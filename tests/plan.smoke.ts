/** Run: npx tsx tests/plan.smoke.ts — POSTs a canned graph to /api/plan and validates the result. */
import { validatePipeline } from '../app/src/compile/validate';
import type { Pipeline } from '../app/src/compile/pipeline';
import type { CapabilityGraph } from '../app/src/transport/hub';

const BASE = process.env.BASE ?? 'https://fabric.keshav-agr2007.workers.dev';

const graph: CapabilityGraph = {
  nodes: [
    {
      peerId: 'lap1', label: 'Windows-Laptop', online: true,
      caps: [
        { id: 'data:documents-0', kind: 'data', name: 'documents/', detail: '42 files shared', methods: ['data.list', 'data.read', 'compute.embed', 'compute.ocr'] },
        { id: 'compute:embed', kind: 'compute', name: 'embed (webgpu)', detail: 'CLIP embeddings on this device', methods: ['compute.embed', 'compute.embed_text'] },
        { id: 'compute:ocr', kind: 'compute', name: 'ocr', detail: '', methods: ['compute.ocr'] },
        { id: 'human', kind: 'human', name: 'human', detail: 'capture / decide / approve', methods: ['human.request'] },
      ],
    },
    {
      peerId: 'ph1', label: 'Android-Phone', online: true,
      caps: [
        { id: 'data:photos-0', kind: 'data', name: 'selected photos', detail: '38 files shared', methods: ['data.list', 'data.read', 'compute.embed', 'compute.ocr'] },
        { id: 'human', kind: 'human', name: 'human', detail: 'capture / decide / approve', methods: ['human.request'] },
      ],
    },
  ],
};

const goals = [
  'Find photos across all connected devices that look similar to a text description I give as input, and return the best 5 matches with scores.',
  'Assemble a document packet: read the text out of every scanned document on the laptop, ask the phone\'s human to photograph the paper certificate, then compile everything into one PDF titled from my input.',
];

let pass = 0, fail = 0;
for (const goal of goals) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, graph, existingTools: [] }),
  });
  const data = await res.json() as { pipeline?: Pipeline; error?: string; detail?: string };
  if (!res.ok || !data.pipeline) {
    console.log(`FAIL  plan "${goal.slice(0, 50)}…" — HTTP ${res.status} ${data.error ?? ''} ${data.detail ?? ''}`);
    fail++;
    continue;
  }
  const verdict = validatePipeline(data.pipeline, graph, []);
  const stages = data.pipeline.stages.map((s) => `${s.method}@${s.node === 'host' ? 'host' : s.node}`).join(' → ');
  if (verdict.ok) {
    console.log(`PASS  "${goal.slice(0, 45)}…" → ${data.pipeline.toolName} [${stages}] (${Date.now() - t0}ms)`);
    pass++;
  } else {
    console.log(`FAIL  "${goal.slice(0, 45)}…" → ${data.pipeline.toolName} INVALID:\n      - ${verdict.errors.join('\n      - ')}\n      [${stages}]`);
    fail++;
  }
}
// Replan case: the phone died; interface is frozen; new plan must avoid ph1.
{
  const reducedGraph: CapabilityGraph = { nodes: graph.nodes.filter((n) => n.peerId !== 'ph1') };
  const fixed = {
    toolName: 'find_similar_photos',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'text to match photos against' } }, required: ['query'] },
  };
  const canonical = (v: unknown): string => Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
      : JSON.stringify(v);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal: 'Find photos across all connected devices that look similar to a text description I give as input, and return the best 5 matches with scores.',
      graph: reducedGraph,
      existingTools: [],
      fixed,
    }),
  });
  const data = await res.json() as { pipeline?: Pipeline; error?: string };
  if (!res.ok || !data.pipeline) {
    console.log(`FAIL  replan — HTTP ${res.status} ${data.error ?? ''}`);
    fail++;
  } else {
    const p = data.pipeline;
    const verdict = validatePipeline(p, reducedGraph, []);
    const nameKept = p.toolName === fixed.toolName;
    const schemaKept = canonical(p.inputSchema) === canonical(fixed.inputSchema);
    const avoidsLost = p.stages.every((s) => s.node !== 'ph1');
    const ok = verdict.ok && nameKept && schemaKept && avoidsLost;
    console.log(`${ok ? 'PASS' : 'FAIL'}  replan (frozen interface, node lost) → [${p.stages.map((s) => `${s.method}@${s.node === 'host' ? 'host' : s.node}`).join(' → ')}] (${Date.now() - t0}ms)${ok ? '' : ` — name:${nameKept} schema:${schemaKept} avoids:${avoidsLost} valid:${verdict.ok ? 'yes' : JSON.stringify((verdict as { errors: string[] }).errors)}`}`);
    ok ? pass++ : fail++;
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
