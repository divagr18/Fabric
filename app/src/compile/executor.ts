import { Hub } from '../transport/hub';
import { rankBySimilarity } from '../capabilities/match';
import {
  ArgValue, Pipeline, Stage, isInputRef, isStageRef, topoLayers,
} from './pipeline';

export type StageStatus = 'running' | 'done' | 'failed';

export interface ExecutionError extends Error {
  stageId: string;
  nodeId: string;
  reason: string;
}

export interface ExecutionEvents {
  onStage?: (stage: Stage, status: StageStatus, detail?: string) => void;
  onArtifact?: (artifact: { name: string; mime: string; bytes: Uint8Array }) => void;
  /** Authority stays human: irreversible outputs need a tap from the host's user. */
  onApprove?: (what: string) => Promise<boolean>;
}

function makeExecError(stage: Stage, reason: string): ExecutionError {
  const err = new Error(`stage "${stage.id}" (${stage.method} @ ${stage.node}): ${reason}`) as ExecutionError;
  err.stageId = stage.id;
  err.nodeId = stage.node;
  err.reason = reason;
  return err;
}

function pluck(value: unknown, path?: string): unknown {
  if (!path) return value;
  let cur = value;
  for (const key of path.split('.')) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function materialize(v: ArgValue, input: Record<string, unknown>, results: Map<string, unknown>): unknown {
  if (isInputRef(v)) return input[v.$input];
  if (isStageRef(v)) {
    if (!results.has(v.$from)) throw new Error(`stage ref "${v.$from}" not yet resolved`);
    return pluck(results.get(v.$from), v.path);
  }
  if (Array.isArray(v)) return v.map((x) => materialize(x, input, results));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, materialize(x, input, results)]));
  }
  return v;
}

/** Runs one validated pipeline against the live fabric. */
export class Executor {
  constructor(private hub: Hub, private events: ExecutionEvents = {}) {}

  async run(pipeline: Pipeline, input: Record<string, unknown>): Promise<unknown> {
    const results = new Map<string, unknown>();
    for (const layer of topoLayers(pipeline.stages)) {
      await Promise.all(layer.map(async (stage) => {
        this.events.onStage?.(stage, 'running');
        try {
          const args = materialize(stage.args, input, results) as Record<string, unknown>;
          const result = stage.node === 'host'
            ? await this.runHostOp(stage, args)
            : await this.runNodeStage(stage, args);
          results.set(stage.id, result);
          this.events.onStage?.(stage, 'done');
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.events.onStage?.(stage, 'failed', reason);
          throw makeExecError(stage, reason);
        }
      }));
    }
    const out = results.get(pipeline.output.fromStage);
    return pipeline.output.summary ? { summary: pipeline.output.summary, result: out } : out;
  }

  private async runNodeStage(stage: Stage, args: Record<string, unknown>): Promise<unknown> {
    const method = stage.method === 'compute.embed_text' ? 'compute.embed_text' : stage.method;
    const result = await this.hub.rpc(stage.node, method, args) as Record<string, unknown> | null;
    // data.read and human capture answer with a transfer — await the actual bytes.
    if (result && typeof result === 'object' && typeof result.transferId === 'string') {
      const blob = await this.hub.blobs.waitFor(result.transferId);
      return { ...result, name: blob.name, mime: blob.mime, bytes: blob.bytes };
    }
    return result;
  }

  private async runHostOp(stage: Stage, args: Record<string, unknown>): Promise<unknown> {
    switch (stage.method) {
      case 'host.match': {
        const query = args.query as number[];
        const items = args.items as Array<{ fileId?: string; vector: number[] } & Record<string, unknown>>;
        const topK = typeof args.topK === 'number' ? args.topK : 10;
        if (!Array.isArray(query)) throw new Error('host.match: "query" must be a vector');
        if (!Array.isArray(items)) throw new Error('host.match: "items" must be an array of {vector,...}');
        const ranked = rankBySimilarity(
          query,
          items.map((it) => ({ item: it, vector: it.vector })),
          topK,
        );
        return { matches: ranked.map((r) => ({ score: Number(r.score.toFixed(4)), ...stripVector(r.item) })) };
      }
      case 'host.pick': {
        // glue: select a path, then optionally slice and project fields
        const from = args.value;
        const picked = pluck(from, typeof args.path === 'string' ? args.path : undefined);
        let arr = Array.isArray(picked) ? picked : picked === undefined ? [] : [picked];
        if (typeof args.limit === 'number') arr = arr.slice(0, args.limit);
        if (Array.isArray(args.fields)) {
          const fields = args.fields as string[];
          arr = arr.map((it) => Object.fromEntries(fields.map((f) => [f, pluck(it, f)])));
        }
        return { items: arr };
      }
      case 'host.compile_pdf': {
        const parts = args.parts as Array<{ name?: string; mime?: string; bytes?: Uint8Array; text?: string }>;
        if (!Array.isArray(parts) || parts.length === 0) throw new Error('host.compile_pdf: "parts" must be a non-empty array');
        const title = typeof args.title === 'string' ? args.title : 'Fabric packet';
        if (this.events.onApprove) {
          const ok = await this.events.onApprove(`Export "${title}" (${parts.length} item${parts.length === 1 ? '' : 's'}) as a PDF on this device?`);
          if (!ok) throw new Error('the user declined to export the artifact');
        }
        const artifact = await compilePdf(title, parts);
        this.events.onArtifact?.(artifact);
        return {
          artifact: artifact.name,
          pages: parts.length,
          bytes: artifact.bytes.length,
          note: 'compiled on the host device; available for download in the Fabric UI — never uploaded anywhere',
        };
      }
      default:
        throw new Error(`unknown host op ${stage.method}`);
    }
  }
}

function stripVector(item: Record<string, unknown>): Record<string, unknown> {
  const { vector: _vector, ...rest } = item;
  return rest;
}

/** pdf-lib is heavy — load it only when a packet is actually compiled. */
async function compilePdf(
  title: string,
  parts: Array<{ name?: string; mime?: string; bytes?: Uint8Array; text?: string }>,
): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const cover = doc.addPage();
  cover.drawText(title, { x: 50, y: cover.getHeight() - 80, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
  cover.drawText(`${parts.length} item(s) · compiled locally by Fabric`, { x: 50, y: cover.getHeight() - 110, size: 12, font, color: rgb(0.4, 0.4, 0.4) });

  for (const part of parts) {
    const page = doc.addPage();
    const label = part.name ?? 'item';
    page.drawText(label, { x: 40, y: page.getHeight() - 40, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    if (part.bytes && part.mime?.startsWith('image/')) {
      const bytes = part.bytes instanceof Uint8Array ? part.bytes : new Uint8Array(part.bytes);
      try {
        const img = part.mime.includes('png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const maxW = page.getWidth() - 80;
        const maxH = page.getHeight() - 100;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        page.drawImage(img, { x: 40, y: page.getHeight() - 60 - img.height * scale, width: img.width * scale, height: img.height * scale });
      } catch {
        page.drawText('(image could not be embedded)', { x: 40, y: page.getHeight() - 70, size: 10, font, color: rgb(0.6, 0.2, 0.2) });
      }
    } else if (part.text) {
      const lines = part.text.split('\n').slice(0, 45);
      lines.forEach((line, i) => {
        page.drawText(line.slice(0, 100), { x: 40, y: page.getHeight() - 70 - i * 16, size: 10, font, color: rgb(0.15, 0.15, 0.15) });
      });
    }
  }

  const bytes = await doc.save();
  return { name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, mime: 'application/pdf', bytes };
}
