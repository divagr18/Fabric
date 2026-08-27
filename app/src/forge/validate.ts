import { CapabilityGraph } from '../transport/hub';
import {
  HOST_METHODS, NODE_METHODS, Pipeline, Stage, StageMethod, collectRefs, stageDeps, topoLayers,
} from './pipeline';

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const TOOL_NAME = /^[a-z][a-z0-9_]{2,40}$/;

/**
 * Every pipeline the planner emits passes through here before registration.
 * Errors are precise so the planner's single retry can actually fix them.
 */
export function validatePipeline(
  pipeline: Pipeline,
  graph: CapabilityGraph,
  existingTools: string[],
): ValidationResult {
  const errors: string[] = [];

  if (!TOOL_NAME.test(pipeline.toolName)) {
    errors.push(`toolName "${pipeline.toolName}" must match ${TOOL_NAME}`);
  }
  if (existingTools.includes(pipeline.toolName)) {
    errors.push(`toolName "${pipeline.toolName}" already registered — pick another name`);
  }
  if (!pipeline.description?.trim()) errors.push('description is required');
  if (!pipeline.stages?.length) errors.push('pipeline has no stages');

  const ids = new Set<string>();
  const nodesById = new Map(graph.nodes.map((n) => [n.peerId, n]));

  for (const stage of pipeline.stages ?? []) {
    const where = `stage "${stage.id}"`;
    if (ids.has(stage.id)) errors.push(`${where}: duplicate stage id`);
    ids.add(stage.id);

    const method = stage.method as StageMethod;
    if (stage.node === 'host') {
      if (!HOST_METHODS.includes(method)) {
        errors.push(`${where}: "${stage.method}" is not a host op (host ops: ${HOST_METHODS.join(', ')})`);
      }
    } else {
      if (!NODE_METHODS.includes(method)) {
        errors.push(`${where}: "${stage.method}" is not a node primitive (node primitives: ${NODE_METHODS.join(', ')})`);
      }
      const node = nodesById.get(stage.node);
      if (!node) {
        errors.push(`${where}: node "${stage.node}" is not in the fabric (nodes: ${graph.nodes.map((n) => `${n.peerId}=${n.label}`).join(', ')})`);
      } else {
        if (!node.online) errors.push(`${where}: node "${node.label}" is offline`);
        // embed_text rides the same model as embed — accept either advertisement
        const serves = node.caps.some((c) => c.methods.includes(method))
          || (method === 'compute.embed_text' && node.caps.some((c) => c.methods.includes('compute.embed')));
        if (!serves) {
          errors.push(`${where}: node "${node.label}" does not expose ${stage.method} (it exposes: ${[...new Set(node.caps.flatMap((c) => c.methods))].join(', ') || 'nothing'})`);
        }
      }
    }

    if (method === 'human.request') {
      const prompt = (stage.args as { prompt?: unknown }).prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        errors.push(`${where}: human.request needs a non-empty "prompt" arg — a person will read it`);
      }
    }
  }

  // Refs must point at earlier-declared stages
  for (const stage of pipeline.stages ?? []) {
    for (const dep of stageDeps(stage)) {
      if (!ids.has(dep)) errors.push(`stage "${stage.id}": references unknown stage "${dep}"`);
      if (dep === stage.id) errors.push(`stage "${stage.id}": references itself`);
    }
    for (const input of collectRefs(stage.args).inputs) {
      const props = (pipeline.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {};
      if (!(input in props)) {
        errors.push(`stage "${stage.id}": {$input: "${input}"} is not declared in inputSchema.properties`);
      }
    }
  }

  if (pipeline.output?.fromStage && !ids.has(pipeline.output.fromStage)) {
    errors.push(`output.fromStage "${pipeline.output.fromStage}" is not a stage`);
  }
  if (!pipeline.output?.fromStage) errors.push('output.fromStage is required');

  if (errors.length === 0) {
    try {
      topoLayers(pipeline.stages as Stage[]);
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
