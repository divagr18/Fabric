import { Hub, GraphChange } from '../transport/hub';
import { WebMcpRegistry, RegisteredTool } from '../webmcp/registry';
import { Pipeline } from './pipeline';
import { validatePipeline } from './validate';

/**
 * Hot reload: when the machine under a tool changes — a node dies, a human
 * revokes a capability, a device rejoins — every affected compiled tool is
 * replanned against the current graph and re-registered UNDER THE SAME NAME
 * with the same input schema. The agent's interface survives; only the
 * implementation moves. Tools that lose a required capability entirely go
 * `degraded` (they explain exactly what's missing) and heal automatically
 * when the capability returns.
 */

export interface HotReloadDeps {
  hub: Hub;
  registry: WebMcpRegistry;
  plan: (body: Record<string, unknown>) => Promise<Pipeline>;
  /** Registers a pipeline as a live compiled tool (executor-backed execute). */
  install: (pipeline: Pipeline, goal: string) => Promise<void>;
  /** Re-registers the tool with an execute that throws `reason`. */
  degrade: (tool: RegisteredTool, reason: string) => Promise<void>;
  onLog?: (line: string) => void;
  onBanner?: (banner: { kind: 'replanning' | 'swapped' | 'degraded'; text: string } | null) => void;
}

const DEBOUNCE_MS = 2_000;
const REPLAN_COOLDOWN_MS = 10_000;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export class HotReloadManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: GraphChange[] = [];
  private lastReplanAt = new Map<string, number>();
  private retryScheduled = new Set<string>();
  private sweeping = false;

  constructor(private deps: HotReloadDeps) {}

  start() {
    this.deps.hub.on('graphChanged', (change) => {
      this.pending.push(change);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.sweep(), DEBOUNCE_MS);
    });
  }

  private log(line: string) {
    this.deps.onLog?.(line);
  }

  private affectedBy(tool: RegisteredTool, changes: GraphChange[]): GraphChange | null {
    if (!tool.pipeline) return null;
    const graph = this.deps.hub.getGraph();
    for (const change of changes) {
      const referenced = tool.pipeline.stages.some((s) => s.node === change.peerId);
      if (!referenced && tool.health !== 'degraded') continue;
      if (tool.health === 'degraded') return change; // any change is a heal opportunity
      const node = graph.nodes.find((n) => n.peerId === change.peerId);
      const stillFine = node?.online && tool.pipeline.stages
        .filter((s) => s.node === change.peerId)
        .every((s) => {
          const m = s.method === 'compute.embed_text' ? 'compute.embed' : s.method;
          return node.caps.some((c) => c.methods.includes(m) || c.methods.includes(s.method));
        });
      if (!stillFine) return change;
    }
    return null;
  }

  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    const changes = this.pending.splice(0);
    try {
      for (const tool of this.deps.registry.list()) {
        if (tool.origin !== 'compiled') continue;
        const hit = this.affectedBy(tool, changes);
        if (!hit) continue;
        const why = hit.kind === 'node_lost' ? `NODE LOST (${hit.label})`
          : hit.kind === 'caps_changed' ? `CAPABILITIES CHANGED (${hit.label})`
          : `NODE JOINED (${hit.label})`;
        this.log(`${why} → "${tool.def.name}" ${tool.health === 'degraded' ? 'may heal' : 'stale'} → replanning…`);
        this.deps.onBanner?.({ kind: 'replanning', text: `⚠ ${why} — REPLANNING "${tool.def.name}"…` });
        await this.replanTool(tool.def.name);
      }
    } finally {
      this.sweeping = false;
      // Changes that arrived mid-sweep must not rot in the queue.
      if (this.pending.length > 0) setTimeout(() => void this.sweep(), 150);
    }
  }

  /** Replan one tool now. Returns true if a new implementation is live. */
  async replanTool(name: string): Promise<boolean> {
    const tool = this.deps.registry.get(name);
    if (!tool?.pipeline || !tool.goal) return false;
    const last = this.lastReplanAt.get(name) ?? 0;
    const wait = REPLAN_COOLDOWN_MS - (Date.now() - last);
    if (wait > 0) {
      // Don't drop the request — a node that bounced within the cooldown window
      // would otherwise leave its tools degraded forever. Retry once after it.
      if (!this.retryScheduled.has(name)) {
        this.retryScheduled.add(name);
        setTimeout(() => {
          this.retryScheduled.delete(name);
          void this.replanTool(name);
        }, wait + 200);
      }
      return false;
    }
    this.lastReplanAt.set(name, Date.now());

    const graph = this.deps.hub.getGraph();
    const others = this.deps.registry.names().filter((n) => n !== name);
    const fixed = { toolName: tool.pipeline.toolName, inputSchema: tool.pipeline.inputSchema };
    try {
      const pipeline = await this.deps.plan({ goal: tool.goal, graph, existingTools: others, fixed });
      const verdict = validatePipeline(pipeline, graph, others);
      if (!verdict.ok) throw new Error(verdict.errors.join('; '));
      if (pipeline.toolName !== fixed.toolName || canonical(pipeline.inputSchema) !== canonical(fixed.inputSchema)) {
        throw new Error('planner drifted the frozen interface');
      }
      await this.deps.install(pipeline, tool.goal);
      this.deps.registry.setHealth(name, 'ok');
      this.log(`🔥 ${name} HOT-SWAPPED → v${this.deps.registry.get(name)?.version} (new plan: ${pipeline.stages.map((s) => `${s.method}@${s.node === 'host' ? 'host' : s.node.slice(0, 6)}`).join(' → ')})`);
      this.deps.onBanner?.({ kind: 'swapped', text: `🔥 ${name} HOT-SWAPPED → v${this.deps.registry.get(name)?.version}` });
      return true;
    } catch (err) {
      const missing = describeMissing(tool.pipeline, graph);
      const reason = `"${name}" cannot run right now: ${missing}. (replan: ${(err as Error).message})`;
      await this.deps.degrade(tool, reason);
      this.deps.registry.setHealth(name, 'degraded');
      this.log(`⚠ ${name} DEGRADED — ${missing}`);
      this.deps.onBanner?.({ kind: 'degraded', text: `⚠ ${name} DEGRADED — ${missing.split(' — ')[0]}` });
      return false;
    }
  }
}

function describeMissing(pipeline: Pipeline, graph: ReturnType<Hub['getGraph']>): string {
  const needed = [...new Set(pipeline.stages.filter((s) => s.node !== 'host').map((s) => s.method))];
  const available = new Set(graph.nodes.filter((n) => n.online).flatMap((n) => n.caps.flatMap((c) => c.methods)));
  const gone = needed.filter((m) => !available.has(m === 'compute.embed_text' ? 'compute.embed' : m) && !available.has(m));
  return gone.length
    ? `no connected device currently provides ${gone.join(', ')} — rejoin a device or share the capability to heal this tool`
    : 'the devices it needs are not currently reachable';
}
