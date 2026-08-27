import { CapabilityStub, Envelope, PeerId, PeerMeta } from './protocol';
import { PeerLink, ChannelKind } from './channel';
import { RtcSession } from './rtc';
import { Signaling, SignalingStatus } from './signaling';

export interface NodeView {
  peerId: PeerId;
  label: string;
  caps: CapabilityStub[];
  kind: ChannelKind;
  alive: boolean;
  lastSeen: number;
}

interface NodeEntry {
  meta: PeerMeta;
  link: PeerLink;
  caps: CapabilityStub[];
  lastSeen: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RPC_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 3_000;
const STALE_MS = 8_000;

type HubEvents = {
  log: (line: string) => void;
  nodes: (nodes: NodeView[]) => void;
  status: (s: SignalingStatus) => void;
  nodeLost: (peerId: PeerId, label: string) => void;
};

/** Host-side hub: node registry, RTC answering, heartbeats, RPC with correlation. */
export class Hub {
  private signaling: Signaling;
  private nodes = new Map<PeerId, NodeEntry>();
  private pending = new Map<string, Pending>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof HubEvents]: HubEvents[K][] } = {
    log: [], nodes: [], status: [], nodeLost: [],
  };

  constructor(public roomCode: string, private selfId: PeerId, label: string) {
    this.signaling = new Signaling(roomCode, selfId, 'host', label);
    this.signaling.onStatus = (s) => this.emit('status', s);
    this.signaling.onMessage = (env) => this.handle(env);
  }

  on<K extends keyof HubEvents>(event: K, cb: HubEvents[K]) {
    this.listeners[event].push(cb);
  }

  private emit<K extends keyof HubEvents>(event: K, ...args: Parameters<HubEvents[K]>) {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  start() {
    this.signaling.connect();
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.emit('log', `room ${this.roomCode} open — waiting for nodes`);
  }

  stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const entry of this.nodes.values()) entry.link.close();
    this.signaling.close();
  }

  views(): NodeView[] {
    const now = Date.now();
    return [...this.nodes.values()].map((e) => ({
      peerId: e.meta.peerId,
      label: e.meta.label,
      caps: e.caps,
      kind: e.link.kind,
      alive: now - e.lastSeen < STALE_MS,
      lastSeen: e.lastSeen,
    }));
  }

  private publishNodes() {
    this.emit('nodes', this.views());
  }

  private tick() {
    for (const entry of this.nodes.values()) {
      entry.link.send({ type: 'ping', payload: {} });
    }
    this.publishNodes(); // refreshes alive/kind badges
  }

  private handle(env: Envelope) {
    switch (env.type) {
      case 'roster':
        this.syncRoster(env.payload.peers);
        return;
      case 'signal': {
        const entry = env.from !== 'room' ? this.nodes.get(env.from) : undefined;
        if (!entry) return;
        if (!entry.link.rtc) {
          entry.link.rtc = new RtcSession({
            role: 'responder',
            sendSignal: (p) => this.signaling.send(
              // answers/ice go back through the relay only
              { v: 1, id: crypto.randomUUID(), from: this.selfId, to: entry.meta.peerId, type: 'signal', payload: p },
            ),
            onEnvelope: (e) => this.handle(e),
            onState: (open) => {
              this.emit('log', `${entry.meta.label}: channel ${open ? 'p2p open' : 'p2p closed → relay'}`);
              this.publishNodes();
            },
          });
        }
        void entry.link.rtc.handleSignal(env.payload);
        return;
      }
      case 'advertise_capabilities': {
        const entry = env.from !== 'room' ? this.nodes.get(env.from) : undefined;
        if (!entry) return;
        entry.caps = env.payload.caps;
        entry.lastSeen = Date.now();
        this.emit('log', `${entry.meta.label} advertises: ${entry.caps.map((c) => c.name).join(', ') || '(none)'}`);
        this.publishNodes();
        return;
      }
      case 'rpc_response': {
        const p = this.pending.get(env.id);
        if (!p) return;
        this.pending.delete(env.id);
        clearTimeout(p.timer);
        if (env.payload.ok) p.resolve(env.payload.result);
        else p.reject(new Error(env.payload.error));
        return;
      }
      case 'pong': {
        const entry = env.from !== 'room' ? this.nodes.get(env.from) : undefined;
        if (entry) entry.lastSeen = Date.now();
        return;
      }
      default:
        return;
    }
  }

  private syncRoster(peers: PeerMeta[]) {
    const present = new Set<PeerId>();
    for (const peer of peers) {
      if (peer.role !== 'node') continue;
      present.add(peer.peerId);
      if (!this.nodes.has(peer.peerId)) {
        this.nodes.set(peer.peerId, {
          meta: peer,
          link: new PeerLink(this.selfId, peer.peerId, this.signaling),
          caps: [],
          lastSeen: Date.now(),
        });
        this.emit('log', `NODE JOINED: ${peer.label}`);
      }
    }
    for (const [peerId, entry] of this.nodes) {
      if (!present.has(peerId)) {
        entry.link.close();
        this.nodes.delete(peerId);
        this.emit('log', `NODE LOST: ${entry.meta.label}`);
        this.emit('nodeLost', peerId, entry.meta.label);
      }
    }
    this.publishNodes();
  }

  rpc(peerId: PeerId, method: string, args: unknown): Promise<unknown> {
    const entry = this.nodes.get(peerId);
    if (!entry) return Promise.reject(new Error(`unknown node ${peerId}`));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc ${method} → ${entry.meta.label} timed out`));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      entry.link.send({ type: 'rpc_request', payload: { method, args } }, id);
    });
  }
}
