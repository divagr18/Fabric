/** Run: npx tsx tests/validate.test.ts */
import { validatePipeline } from '../app/src/compile/validate';
import { Pipeline } from '../app/src/compile/pipeline';
import type { CapabilityGraph } from '../app/src/transport/hub';

const graph: CapabilityGraph = {
  nodes: [
    {
      peerId: 'lap1', label: 'Laptop', online: true,
      caps: [
        { id: 'data:documents-0', kind: 'data', name: 'documents/', detail: '42 files shared', methods: ['data.list', 'data.read', 'compute.embed', 'compute.ocr'] },
        { id: 'human', kind: 'human', name: 'human', detail: '', methods: ['human.request'] },
      ],
    },
    {
      peerId: 'desk1', label: 'Desktop', online: true,
      caps: [
        { id: 'data:archive-0', kind: 'data', name: 'archive/', detail: '900 files shared', methods: ['data.list', 'data.read', 'compute.embed', 'compute.ocr'] },
        { id: 'compute:embed', kind: 'compute', name: 'embed (webgpu)', detail: '', methods: ['compute.embed'] },
      ],
    },
    { peerId: 'gone1', label: 'Ghost', online: false, caps: [{ id: 'data:x', kind: 'data', name: 'x/', detail: '', methods: ['data.list'] }] },
  ],
};

const good: Pipeline = {
  toolName: 'find_similar_photos',
  description: 'Find photos across devices similar to a text query',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  stages: [
    { id: 'qvec', node: 'desk1', method: 'compute.embed_text', args: { texts: [{ $input: 'query' }] } },
    { id: 'photos', node: 'desk1', method: 'compute.embed', args: { capId: 'data:archive-0', limit: 50 } },
    { id: 'rank', node: 'host', method: 'host.match', args: { query: { $from: 'qvec', path: 'vectors.0' }, items: { $from: 'photos', path: 'items' }, topK: 5 } },
  ],
  output: { fromStage: 'rank' },
};

let pass = 0, fail = 0;
function expect(name: string, result: { ok: boolean; errors?: string[] }, wantOk: boolean, wantErrorMatch?: RegExp) {
  const okMatches = result.ok === wantOk;
  const errMatches = wantOk || !wantErrorMatch || (result.errors ?? []).some((e) => wantErrorMatch.test(e));
  const ok = okMatches && errMatches;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok ? ` — got ${JSON.stringify(result)}` : ''}`);
  ok ? pass++ : fail++;
}

expect('good pipeline validates', validatePipeline(good, graph, []), true);

expect('offline node rejected',
  validatePipeline({ ...good, stages: [{ id: 's1', node: 'gone1', method: 'data.list', args: { capId: 'data:x' } }], output: { fromStage: 's1' } }, graph, []),
  false, /offline/);

expect('unknown method rejected',
  validatePipeline({ ...good, stages: [{ id: 's1', node: 'lap1', method: 'data.destroy' as never, args: {} }], output: { fromStage: 's1' } }, graph, []),
  false, /not a node primitive/);

expect('bad ref rejected',
  validatePipeline({ ...good, stages: [good.stages[0], { ...good.stages[2], id: 'rank', args: { query: { $from: 'nope' } } }], output: { fromStage: 'rank' } }, graph, []),
  false, /unknown stage "nope"/);

expect('cycle rejected',
  validatePipeline({
    ...good,
    stages: [
      { id: 'a', node: 'lap1', method: 'data.list', args: { capId: 'data:documents-0' }, dependsOn: ['b'] },
      { id: 'b', node: 'lap1', method: 'data.list', args: { capId: 'data:documents-0' }, dependsOn: ['a'] },
    ],
    output: { fromStage: 'a' },
  }, graph, []),
  false, /cycle/);

expect('duplicate tool name rejected', validatePipeline(good, graph, ['find_similar_photos']), false, /already registered/);

expect('human.request without prompt rejected',
  validatePipeline({ ...good, stages: [{ id: 'h', node: 'lap1', method: 'human.request', args: { kind: 'approve' } }], output: { fromStage: 'h' } }, graph, []),
  false, /needs a non-empty "prompt"/);

expect('node lacking method rejected',
  validatePipeline({ ...good, stages: [{ id: 'h', node: 'desk1', method: 'human.request', args: { kind: 'approve', prompt: 'ok?' } }], output: { fromStage: 'h' } }, graph, []),
  false, /does not expose human.request/);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
