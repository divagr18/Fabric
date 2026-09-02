/** Run: npx tsx tests/blob.test.ts — BlobReceiver unit tests (no network). */
import { BlobReceiver } from '../app/src/transport/blob';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const begin = (id: string, size: number) => ({ type: 'blob_begin', payload: { transferId: id, name: 'f.bin', mime: 'application/octet-stream', size } });
const chunk = (id: string, seq: number, bytes: Uint8Array) => ({ type: 'blob_chunk', payload: { transferId: id, seq, dataB64: b64(bytes) } });
const end = (id: string, chunks: number) => ({ type: 'blob_end', payload: { transferId: id, chunks } });

const data = new Uint8Array(100_000);
for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 0xff;
const CH = 48 * 1024;

// 1. happy path, success-before-waiter
{
  const r = new BlobReceiver();
  const id = 't1';
  r.handle(begin(id, data.length));
  for (let off = 0, s = 0; off < data.length; off += CH, s++) r.handle(chunk(id, s, data.subarray(off, off + CH)));
  r.handle(end(id, Math.ceil(data.length / CH)));
  const blob = await r.waitFor(id, 1000);
  check('reassembles byte-identical (success stored before waiter)',
    blob.bytes.length === data.length && blob.bytes.every((v, i) => v === data[i]));
  check('bytesReceived counted', r.bytesReceived === data.length);
}

// 2. missing chunk → precise error, failure-before-waiter
{
  const r = new BlobReceiver();
  const id = 't2';
  r.handle(begin(id, data.length));
  r.handle(chunk(id, 0, data.subarray(0, CH))); // chunk 1 dropped
  r.handle(end(id, 2));
  try {
    await r.waitFor(id, 1000);
    check('missing chunk rejects', false);
  } catch (err) {
    check('missing chunk rejects with precise error', /missing chunks \(1\/2\)/.test((err as Error).message), (err as Error).message);
  }
}

// 3. size mismatch → precise error (not RangeError / zero-padding)
{
  const r = new BlobReceiver();
  const id = 't3';
  r.handle(begin(id, data.length + 500)); // announces more than sent
  for (let off = 0, s = 0; off < data.length; off += CH, s++) r.handle(chunk(id, s, data.subarray(off, off + CH)));
  r.handle(end(id, Math.ceil(data.length / CH)));
  try {
    await r.waitFor(id, 1000);
    check('size mismatch rejects', false);
  } catch (err) {
    check('size mismatch rejects with precise error', /size mismatch/.test((err as Error).message), (err as Error).message);
  }
}

// 4. waiter registered BEFORE completion resolves on arrival
{
  const r = new BlobReceiver();
  const id = 't4';
  r.handle(begin(id, 3));
  const p = r.waitFor(id, 1000);
  r.handle(chunk(id, 0, new Uint8Array([1, 2, 3])));
  r.handle(end(id, 1));
  const blob = await p;
  check('pre-registered waiter resolves', blob.bytes.length === 3 && blob.bytes[2] === 3);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
