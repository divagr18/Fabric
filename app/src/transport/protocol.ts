/** Fabric wire protocol v1 — every message on any pipe (WS relay or DataChannel) is an Envelope. */

export type PeerId = string;

export interface PeerMeta {
  peerId: PeerId;
  role: 'host' | 'node';
  label: string;
  joinedAt: number;
}

export interface CapabilityStub {
  name: string; // Phase 1: 'echo'; Phase 2 replaces with real capability descriptors
}

export type Message =
  | { type: 'roster'; payload: { peers: PeerMeta[] } }
  | { type: 'signal'; payload: { kind: 'offer'; sdp: string } | { kind: 'answer'; sdp: string } | { kind: 'ice'; candidate: RTCIceCandidateInit } }
  | { type: 'advertise_capabilities'; payload: { caps: CapabilityStub[] } }
  | { type: 'rpc_request'; payload: { method: string; args: unknown } }
  | { type: 'rpc_response'; payload: { ok: true; result: unknown } | { ok: false; error: string } }
  | { type: 'ping'; payload: Record<string, never> }
  | { type: 'pong'; payload: Record<string, never> };

export type MsgType = Message['type'];

export type Envelope = Message & {
  v: 1;
  id: string;
  from: PeerId | 'room';
  to: PeerId | 'host' | 'room';
};

export function makeEnvelope<T extends Message>(
  from: PeerId,
  to: Envelope['to'],
  msg: T,
  id?: string,
): Envelope {
  return { v: 1, id: id ?? crypto.randomUUID(), from, to, ...msg };
}

export function parseEnvelope(data: unknown): Envelope | null {
  if (typeof data !== 'string') return null;
  try {
    const env = JSON.parse(data) as Envelope;
    if (env && env.v === 1 && typeof env.type === 'string' && typeof env.to === 'string') return env;
  } catch { /* not ours */ }
  return null;
}

/** Stable per-tab identity so a reload rejoins as the same peer. */
export function myPeerId(): PeerId {
  let id = sessionStorage.getItem('fabric.peerId');
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem('fabric.peerId', id);
  }
  return id;
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iPhone'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Device';
  return `${os}-${myPeerId().slice(0, 4)}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function makeRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
