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
 * CLIP embedding worker. Tries WebGPU, falls back to WASM — the active backend
 * is reported so the capability descriptor and UI can name it honestly.
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

async function loadVision(): Promise<void> {
  if (vision) return;
  processor = await AutoProcessor.from_pretrained(MODEL, {});
  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === 'progress' && typeof p.progress === 'number') {
      post({ type: 'progress', pct: Math.round(p.progress), file: p.file ?? '' });
    }
  };
  const preferred: Backend[] = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr: unknown = null;
  for (const device of preferred) {
    try {
      vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback,
      });
      backend = device;
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
  text = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
}

async function embedImages(files: File[]): Promise<number[][]> {
  await loadVision();
  const out: number[][] = [];
  for (const file of files) {
    const image = await RawImage.fromBlob(file);
    const inputs = await processor!(image);
    const { image_embeds } = await vision!(inputs);
    out.push([...(image_embeds.normalize().data as Float32Array)]);
  }
  return out;
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
      const vectors = await embedImages(files ?? []);
      post({ type: 'result', id, result: { vectors, backend, ms: Math.round(performance.now() - t0) } });
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
