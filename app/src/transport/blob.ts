import { PeerLink } from './channel';

/**
 * Chunked blob transfer over a PeerLink (works over p2p and relay identically).
 * 48KB chunks keep every envelope under DataChannel/WebSocket message limits.
 */

const CHUNK = 48 * 1024;
const MAX_BLOB = 8 * 1024 * 1024; // Phase 2 cap
const STALL_MS = 60_000;

export interface ReceivedBlob {
  transferId: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface BlobLike {
  name: string;
  mime: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Send a blob over the link. Returns the transferId the receiver can await. */
export async function sendBlob(link: PeerLink, blob: BlobLike): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length > MAX_BLOB) throw new Error(`blob too large (${buf.length} bytes, max ${MAX_BLOB})`);
  const transferId = crypto.randomUUID();
  link.send({ type: 'blob_begin', payload: { transferId, name: blob.name, mime: blob.mime, size: buf.length } });
  let chunks = 0;
  for (let off = 0; off < buf.length; off += CHUNK) {
    link.send({ type: 'blob_chunk', payload: { transferId, seq: chunks, dataB64: toB64(buf.subarray(off, off + CHUNK)) } });
    chunks += 1;
    // crude backpressure: brief yield every ~768KB so DataChannel buffers drain
    if (chunks % 16 === 0) await new Promise((r) => setTimeout(r, 5));
  }
  link.send({ type: 'blob_end', payload: { transferId, chunks } });
  return transferId;
}

interface InFlight {
  name: string;
  mime: string;
  size: number;
  parts: Map<number, Uint8Array>;
  timer: ReturnType<typeof setTimeout>;
}

/** Assembles incoming blob_* envelopes; await a transfer by id. */
export class BlobReceiver {
  /** total bytes received from peers (never a server) — feeds the metrics strip */
  bytesReceived = 0;
  private inflight = new Map<string, InFlight>();
  private done = new Map<string, ReceivedBlob>();
  private failed = new Map<string, string>(); // failures must survive until a waiter shows up
  private waiters = new Map<string, { resolve: (b: ReceivedBlob) => void; reject: (e: Error) => void }>();

  /** Returns true if the envelope was a blob message (consumed). */
  handle(env: { type: string; payload: unknown }): boolean {
    if (env.type === 'blob_begin') {
      const p = env.payload as { transferId: string; name: string; mime: string; size: number };
      this.inflight.set(p.transferId, {
        name: p.name, mime: p.mime, size: p.size, parts: new Map(),
        timer: setTimeout(() => this.fail(p.transferId, 'transfer stalled'), STALL_MS),
      });
      return true;
    }
    if (env.type === 'blob_chunk') {
      const p = env.payload as { transferId: string; seq: number; dataB64: string };
      const t = this.inflight.get(p.transferId);
      if (t) {
        t.parts.set(p.seq, fromB64(p.dataB64));
        clearTimeout(t.timer);
        t.timer = setTimeout(() => this.fail(p.transferId, 'transfer stalled'), STALL_MS);
      }
      return true;
    }
    if (env.type === 'blob_end') {
      const p = env.payload as { transferId: string; chunks: number };
      const t = this.inflight.get(p.transferId);
      if (!t) return true;
      clearTimeout(t.timer);
      this.inflight.delete(p.transferId);
      if (t.parts.size !== p.chunks) {
        this.fail(p.transferId, `missing chunks (${t.parts.size}/${p.chunks})`);
        return true;
      }
      const bytes = new Uint8Array(t.size);
      let off = 0;
      for (let i = 0; i < p.chunks; i++) {
        const part = t.parts.get(i)!;
        bytes.set(part, off);
        off += part.length;
      }
      this.bytesReceived += bytes.length;
      const blob: ReceivedBlob = { transferId: p.transferId, name: t.name, mime: t.mime, bytes };
      const w = this.waiters.get(p.transferId);
      if (w) {
        this.waiters.delete(p.transferId);
        w.resolve(blob);
      } else {
        this.done.set(p.transferId, blob);
        setTimeout(() => this.done.delete(p.transferId), STALL_MS);
      }
      return true;
    }
    return false;
  }

  private fail(transferId: string, reason: string) {
    this.inflight.delete(transferId);
    const w = this.waiters.get(transferId);
    if (w) {
      this.waiters.delete(transferId);
      w.reject(new Error(reason));
    } else {
      this.failed.set(transferId, reason);
      setTimeout(() => this.failed.delete(transferId), STALL_MS);
    }
  }

  waitFor(transferId: string, ms = STALL_MS): Promise<ReceivedBlob> {
    const ready = this.done.get(transferId);
    if (ready) {
      this.done.delete(transferId);
      return Promise.resolve(ready);
    }
    const failure = this.failed.get(transferId);
    if (failure) {
      this.failed.delete(transferId);
      return Promise.reject(new Error(failure));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(transferId);
        reject(new Error('blob transfer timed out'));
      }, ms);
      this.waiters.set(transferId, {
        resolve: (b) => { clearTimeout(timer); resolve(b); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }
}
