import { Pipeline } from '../compile/pipeline';

/**
 * WebMCP tool registry — every document.modelContext call in Fabric lives in this
 * directory. Tools register via the standard API; revoke/hot-swap = abort the
 * registration's AbortController and (for swaps) re-register under the same name,
 * which fires the spec's `toolchange` so connected agents refresh their tool list.
 */

export interface WebMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface RegisteredTool {
  def: WebMcpToolDef;
  controller: AbortController;
  origin: 'core' | 'compiled';
  pipeline?: Pipeline;
  version: number;
  goal?: string;           // original compile goal — replanning needs it
  health: 'ok' | 'degraded';
  calls: number;
  lastMs?: number;
}

interface ModelContext {
  registerTool(def: unknown, opts?: { signal?: AbortSignal }): void | Promise<void>;
  addEventListener?(type: string, cb: () => void): void;
}

export function getModelContext(): ModelContext | null {
  const d = document as Document & { modelContext?: ModelContext };
  const n = navigator as Navigator & { modelContext?: ModelContext };
  return d.modelContext ?? n.modelContext ?? null;
}

export type RegistryEvent =
  | { type: 'registered'; name: string; origin: 'core' | 'compiled'; version: number }
  | { type: 'revoked'; name: string }
  | { type: 'swapped'; name: string; version: number }
  | { type: 'health'; name: string; health: 'ok' | 'degraded' }
  | { type: 'call_start'; name: string; args: string; callId: string }
  | { type: 'call_end'; name: string; ok: boolean; ms: number; callId: string }
  | { type: 'unavailable' };

export class WebMcpRegistry {
  private tools = new Map<string, RegisteredTool>();
  private listeners: Array<(e: RegistryEvent) => void> = [];
  readonly available: boolean;

  constructor() {
    this.available = getModelContext() !== null;
  }

  on(cb: (e: RegistryEvent) => void) {
    this.listeners.push(cb);
  }

  private emit(e: RegistryEvent) {
    for (const cb of this.listeners) cb(e);
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  setHealth(name: string, health: 'ok' | 'degraded') {
    const tool = this.tools.get(name);
    if (!tool || tool.health === health) return;
    tool.health = health;
    this.emit({ type: 'health', name, health });
  }

  async register(def: WebMcpToolDef, origin: 'core' | 'compiled', pipeline?: Pipeline, goal?: string): Promise<void> {
    const mc = getModelContext();
    if (!mc) {
      this.emit({ type: 'unavailable' });
      throw new Error('WebMCP not available — open this page in ChatGPT\'s browser or Chrome with WebMCP enabled');
    }
    const existing = this.tools.get(def.name);
    const version = (existing?.version ?? 0) + 1;
    existing?.controller.abort(); // hot-swap path: unregister the old implementation first

    const controller = new AbortController();
    // Platform call (mc === document.modelContext where available):
    //   document.modelContext.registerTool({ name, description, inputSchema, execute }, { signal })
    await mc.registerTool(
      {
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const callId = crypto.randomUUID();
          const t0 = performance.now();
          const tracked = this.tools.get(def.name);
          if (tracked) tracked.calls += 1;
          this.emit({ type: 'call_start', name: def.name, args: JSON.stringify(args ?? {}).slice(0, 120), callId });
          try {
            const result = await def.execute(args ?? {});
            const ms = Math.round(performance.now() - t0);
            const t = this.tools.get(def.name);
            if (t) t.lastMs = ms;
            this.emit({ type: 'call_end', name: def.name, ok: true, ms, callId });
            const text = typeof result === 'string'
              ? result
              // never expand raw bytes into JSON — a 5MB file would become tens of MB of digits
              : JSON.stringify(result, (_k, v) => (v instanceof Uint8Array ? `<binary: ${v.length} bytes, kept on-device>` : v), 2);
            return { content: [{ type: 'text', text }] };
          } catch (err) {
            this.emit({ type: 'call_end', name: def.name, ok: false, ms: Math.round(performance.now() - t0), callId });
            throw err;
          }
        },
      },
      { signal: controller.signal },
    );
    this.tools.set(def.name, {
      def, controller, origin, pipeline, version,
      goal: goal ?? existing?.goal, health: 'ok',
      calls: existing?.calls ?? 0, lastMs: existing?.lastMs,
    });
    this.emit(version > 1 ? { type: 'swapped', name: def.name, version } : { type: 'registered', name: def.name, origin, version });
  }

  revoke(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    tool.controller.abort();
    this.tools.delete(name);
    this.emit({ type: 'revoked', name });
    return true;
  }
}
