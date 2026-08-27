import { createWorker, Worker as TesseractWorker } from 'tesseract.js';
import { Capability } from '../transport/protocol';
import { GrantStore } from './grants';

/** compute.ocr — Tesseract on this device, over granted files only. */

let workerPromise: Promise<TesseractWorker> | null = null;

function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) workerPromise = createWorker('eng');
  return workerPromise;
}

export async function ocrFiles(
  store: GrantStore,
  args: unknown,
): Promise<{ items: { fileId: string; text: string; confidence: number }[]; ms: number }> {
  const { fileIds } = args as { fileIds: string[] };
  const targets = (fileIds ?? []).map((id) => store.getFile(id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (targets.length === 0) throw new Error('no granted files matched');
  const worker = await getWorker();
  const t0 = performance.now();
  const items = [];
  for (const t of targets) {
    const file = await t.getFile();
    const { data } = await worker.recognize(file);
    items.push({ fileId: t.id, text: data.text.trim(), confidence: Math.round(data.confidence) });
  }
  return { items, ms: Math.round(performance.now() - t0) };
}

export function ocrCapability(): Capability {
  return {
    id: 'compute:ocr',
    kind: 'compute',
    name: 'ocr',
    detail: 'text extraction, computed on this device',
    methods: ['compute.ocr'],
  };
}
