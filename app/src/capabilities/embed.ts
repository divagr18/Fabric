import { Capability } from '../transport/protocol';
import { GrantStore, isImage } from './grants';

/** Main-thread wrapper around the CLIP embedding worker. */

export type EmbedStatus =
  | { state: 'idle' }
  | { state: 'loading'; pct: number | null; mb?: number; mbTotal?: number | null }
  | { state: 'ready'; backend: 'webgpu' | 'wasm' }
  | { state: 'error'; error: string };

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class Embedder {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingCall>();
  status: EmbedStatus = { state: 'idle' };
  onStatus: (s: EmbedStatus) => void = () => {};

  private setStatus(s: EmbedStatus) {
    this.status = s;
    this.onStatus(s);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
      const msg = ev.data as { type: string; id?: string; pct?: number | null; mb?: number; mbTotal?: number | null; result?: unknown; error?: string };
      if (msg.type === 'progress') {
        if (this.status.state !== 'ready') {
          this.setStatus({ state: 'loading', pct: msg.pct ?? 0, mb: msg.mb, mbTotal: msg.mbTotal });
        }
        return;
      }
      const p = msg.id ? this.pending.get(msg.id) : undefined;
      if (!p || !msg.id) return;
      this.pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.result);
      else p.reject(new Error(msg.error ?? 'embed worker error'));
    };
    this.worker = w;
    return w;
  }

  private call(op: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    const w = this.ensureWorker();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, op, ...extra });
    });
  }

  async warmup(): Promise<void> {
    if (this.status.state === 'ready') return;
    if (this.status.state === 'idle') this.setStatus({ state: 'loading', pct: null });
    try {
      const { backend } = (await this.call('warmup')) as { backend: 'webgpu' | 'wasm' };
      this.setStatus({ state: 'ready', backend });
    } catch (err) {
      this.setStatus({ state: 'error', error: (err as Error).message });
      throw err;
    }
  }

  /** compute.embed handler: embeds granted images by fileId (or all images in a capId). */
  async embed(store: GrantStore, args: unknown): Promise<{ items: { fileId: string; vector: number[] }[]; backend: string; ms: number }> {
    const { capId, fileIds, limit } = args as { capId?: string; fileIds?: string[]; limit?: number };
    let targets = fileIds
      ? fileIds.map((id) => store.getFile(id)).filter((f): f is NonNullable<typeof f> => !!f)
      : (capId ? store.getGrant(capId)?.files ?? [] : []).filter((f) => isImage(f.name));
    if (limit && limit > 0) targets = targets.slice(0, limit);
    if (targets.length === 0) throw new Error('no granted image files matched');
    await this.warmup();
    const files = await Promise.all(targets.map((t) => t.getFile()));
    const { vectors, backend, ms } = (await this.call('embedImages', { files })) as {
      vectors: number[][]; backend: string; ms: number;
    };
    return { items: targets.map((t, i) => ({ fileId: t.id, vector: vectors[i] })), backend, ms };
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    await this.warmup();
    const { vectors } = (await this.call('embedTexts', { texts })) as { vectors: number[][] };
    return vectors;
  }

  /** Compute capability descriptor for advertising (backend named honestly). */
  capability(): Capability {
    const backend = this.status.state === 'ready'
      ? this.status.backend
      : ('gpu' in navigator ? 'webgpu?' : 'wasm');
    return {
      id: 'compute:embed',
      kind: 'compute',
      name: `embed (${backend})`,
      detail: 'CLIP image/text embeddings, computed on this device',
      methods: ['compute.embed', 'compute.embed_text'],
    };
  }
}
