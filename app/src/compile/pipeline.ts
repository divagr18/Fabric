/**
 * Compiled-tool pipeline model. A pipeline is a DAG of primitive invocations,
 * bound to real nodes in the capability graph, produced by the planner LLM
 * and validated before it ever runs. No arbitrary code — only these shapes.
 */

export type StageMethod =
  | 'data.list'
  | 'data.read'
  | 'compute.embed'
  | 'compute.embed_text'
  | 'compute.ocr'
  | 'human.request'
  | 'human.notify'
  | 'host.match'
  | 'host.pick'
  | 'host.compile_pdf';

export const NODE_METHODS: StageMethod[] = [
  'data.list', 'data.read', 'compute.embed', 'compute.embed_text', 'compute.ocr', 'human.request', 'human.notify',
];
export const HOST_METHODS: StageMethod[] = ['host.match', 'host.pick', 'host.compile_pdf'];

/** compute.embed_text rides the same model/capability advertisement as compute.embed. */
export function capabilityMethodFor(method: string): string {
  return method === 'compute.embed_text' ? 'compute.embed' : method;
}

/** Reference to the tool-call input: { "$input": "query" } */
export interface InputRef { $input: string }
/** Reference to a prior stage's result: { "$from": "stageId", "path": "items.0.vector" } */
export interface StageRef { $from: string; path?: string }

export type ArgValue = unknown | InputRef | StageRef;

export interface Stage {
  id: string;
  /** peerId of the node that runs this stage, or 'host' for host-local ops */
  node: string;
  method: StageMethod;
  args: Record<string, ArgValue>;
  dependsOn?: string[];
}

export interface Pipeline {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  stages: Stage[];
  output: { fromStage: string; summary?: string };
}

export function isInputRef(v: unknown): v is InputRef {
  return !!v && typeof v === 'object' && '$input' in (v as object);
}

export function isStageRef(v: unknown): v is StageRef {
  return !!v && typeof v === 'object' && '$from' in (v as object);
}

/** All refs mentioned anywhere in a stage's args (deep). */
export function collectRefs(args: unknown): { inputs: string[]; stages: string[] } {
  const inputs: string[] = [];
  const stages: string[] = [];
  const walk = (v: unknown) => {
    if (isInputRef(v)) inputs.push(v.$input);
    else if (isStageRef(v)) stages.push(v.$from);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(args);
  return { inputs, stages };
}

/** Stages a stage depends on: explicit dependsOn + implicit $from refs. */
export function stageDeps(stage: Stage): string[] {
  return [...new Set([...(stage.dependsOn ?? []), ...collectRefs(stage.args).stages])];
}

/** Topological layers (stages with no unmet deps run together). Throws on cycles. */
export function topoLayers(stages: Stage[]): Stage[][] {
  const remaining = new Map(stages.map((s) => [s.id, s]));
  const done = new Set<string>();
  const layers: Stage[][] = [];
  while (remaining.size > 0) {
    const layer = [...remaining.values()].filter((s) => stageDeps(s).every((d) => done.has(d)));
    if (layer.length === 0) throw new Error('pipeline has a dependency cycle');
    for (const s of layer) {
      remaining.delete(s.id);
      done.add(s.id);
    }
    layers.push(layer);
  }
  return layers;
}
