/// <reference lib="webworker" />
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env as hfEnv,
} from '@huggingface/transformers';

/**
 * CLIP embedding worker. Device/dtype strategy picks the smallest download that
 * works: mobile prefers wasm+q8 (~88MB); desktop tries webgpu+fp16 first, falls
 * back to wasm+q8. The active backend is reported so the capability descriptor
 * and UI can name it honestly.
 */

const MODEL = 'Xenova/clip-vit-base-patch32';
hfEnv.allowLocalModels = false;
// Model files come through our own origin (worker proxies hf.co) — no third-party CORS.
hfEnv.remoteHost = new URL('/api/hf/', self.location.origin).href;

// Diagnostic: record the last URL fetch attempted so failures name their target.
let lastFetchUrl = '';
const realFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  lastFetchUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return realFetch(input, init);
}) as typeof fetch;

type Backend = 'webgpu' | 'wasm';

let vision: CLIPVisionModelWithProjection | null = null;
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let text: CLIPTextModelWithProjection | null = null;
let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
let backend: Backend = 'wasm';

function post(msg: unknown) {
  (self as unknown as Worker).postMessage(msg);
}

// Several files download concurrently, each with its own 0-100%. Aggregate by
// bytes across all files so the reported percentage only ever moves forward.
const fileProgress = new Map<string, { loaded: number; total: number }>();
function progress_callback(p: { status?: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== 'progress' || !p.file || typeof p.loaded !== 'number') return;
  fileProgress.set(p.file, { loaded: p.loaded, total: p.total ?? 0 });
  let loaded = 0, total = 0;
  for (const f of fileProgress.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({
    type: 'progress',
    // no totals (missing Content-Length) → indeterminate: report bytes, not a fake %
    pct: total > 0 ? Math.min(99, Math.round((100 * loaded) / total)) : null,
    mb: +(loaded / 1048576).toFixed(1),
    mbTotal: total > 0 ? +(total / 1048576).toFixed(1) : null,
  });
}

const IS_MOBILE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

function attempts(): Array<{ device: Backend; dtype: 'fp16' | 'q8' }> {
  const hasGpu = 'gpu' in navigator;
  if (IS_MOBILE) {
    // smallest download first — q8 is ~88MB vs fp16 ~170MB vs fp32 ~350MB
    return [{ device: 'wasm', dtype: 'q8' }, ...(hasGpu ? [{ device: 'webgpu', dtype: 'fp16' } as const] : [])];
  }
  return hasGpu
    ? [{ device: 'webgpu', dtype: 'fp16' }, { device: 'wasm', dtype: 'q8' }]
    : [{ device: 'wasm', dtype: 'q8' }];
}

async function loadVision(): Promise<void> {
  if (vision) return;
  processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback });
  let lastErr: unknown = null;
  for (const attempt of attempts()) {
    try {
      vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback,
      });
      backend = attempt.device;
      return;
    } catch (err) {
      lastErr = err;
      vision = null;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('no embedding backend available');
}

async function loadText(): Promise<void> {
  if (text) return;
  tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  text = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8', progress_callback });
}

async function embedImages(files: File[]): Promise<{ vectors: Array<number[] | null>; skipped: string[] }> {
  await loadVision();
  const vectors: Array<number[] | null> = [];
  const skipped: string[] = [];
  for (const file of files) {
    try {
      const image = await RawImage.fromBlob(file);
      const inputs = await processor!(image);
      const { image_embeds } = await vision!(inputs);
      vectors.push([...(image_embeds.normalize().data as Float32Array)]);
    } catch {
      // undecodable format (HEIC etc.) — skip the file, not the stage
      vectors.push(null);
      skipped.push(file.name || 'unnamed');
    }
  }
  return { vectors, skipped };
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  await loadText();
  const inputs = tokenizer!(texts, { padding: true, truncation: true });
  const { text_embeds } = await text!(inputs);
  const norm = text_embeds.normalize();
  const [n, dim] = norm.dims;
  const data = norm.data as Float32Array;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push([...data.subarray(i * dim, (i + 1) * dim)]);
  return out;
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, op, files, texts } = ev.data as { id: string; op: string; files?: File[]; texts?: string[] };
  try {
    if (op === 'warmup') {
      await loadVision();
      post({ type: 'result', id, result: { backend } });
    } else if (op === 'embedImages') {
      const t0 = performance.now();
      const { vectors, skipped } = await embedImages(files ?? []);
      post({ type: 'result', id, result: { vectors, skipped, backend, ms: Math.round(performance.now() - t0) } });
    } else if (op === 'embedTexts') {
      const vectors = await embedTexts(texts ?? []);
      post({ type: 'result', id, result: { vectors, backend } });
    } else {
      throw new Error(`unknown op ${op}`);
    }
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err);
    const detail = /fetch/i.test(base) && lastFetchUrl ? `${base} (url: ${lastFetchUrl})` : base;
    post({ type: 'error', id, error: detail });
  }
};
