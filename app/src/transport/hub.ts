import { Capability, Envelope, PeerId, PeerMeta, StoredTool, makeEnvelope } from './protocol';
import { PeerLink, ChannelKind } from './channel';
import { BlobReceiver } from './blob';
import { RtcSession } from './rtc';
import { Signaling, SignalingStatus } from './signaling';

export interface NodeView {
  peerId: PeerId;
  label: string;
  caps: Capability[];
  kind: ChannelKind;
  alive: boolean;
  lastSeen: number;
  rtt?: number;
}

/** Snapshot of everything every node currently exposes — Phase 3's planner input. */
export interface CapabilityGraph {
  nodes: Array<{ peerId: PeerId; label: string; online: boolean; caps: Capability[] }>;
}

interface NodeEntry {
  meta: PeerMeta;
  link: PeerLink;
  caps: Capability[];
  lastSeen: number;
  rtt?: number;
}

interface Pending {
  peerId: PeerId;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const HEARTBEAT_MS = 3_000;
const STALE_MS = 8_000;

/** Per-method RPC budgets: humans take minutes, models take a while, everything else is quick. */
function rpcTimeout(method: string): number {
  if (method.startsWith('human.')) return 300_000;
  if (method.startsWith('compute.')) return 240_000; // first call may still include model warm-up on slow devices
  return 10_000;
}

export interface GraphChange {
  kind: 'node_lost' | 'node_joined' | 'caps_changed';
  peerId: PeerId;
  label: string;
}

type HubEvents = {
  log: (line: string) => void;
  nodes: (nodes: NodeView[]) => void;
  status: (s: SignalingStatus) => void;
  nodeLost: (peerId: PeerId, label: string) => void;
  graphChanged: (change: GraphChange) => void;
  storedTools: (tools: StoredTool[]) => void;
};

/** Host-side hub: node registry, RTC answering, heartbeats, RPC with correlation. */
export class Hub {
  private signaling: Signaling;
  private nodes = new Map<PeerId, NodeEntry>();
  private pending = new Map<string, Pending>();
  private pings = new Map<string, { peerId: PeerId; at: number }>();
  readonly blobs = new BlobReceiver();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private listeners: { [K in keyof HubEvents]: HubEvents[K][] } = {
    log: [], nodes: [], status: [], nodeLost: [], graphChanged: [], storedTools: [],
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
      rtt: e.rtt,
    }));
  }

  private publishNodes() {
    this.emit('nodes', this.views());
  }

  private tick() {
    if (this.pings.size > 50) this.pings.clear(); // drop stale unanswered pings
    for (const entry of this.nodes.values()) {
      const id = crypto.randomUUID();
      this.pings.set(id, { peerId: entry.meta.peerId, at: performance.now() });
      entry.link.send({ type: 'ping', payload: {} }, id);
    }
    this.publishNodes(); // refreshes alive/kind badges
  }

  /** Current capability graph across all online nodes (planner input in Phase 3). */
  getGraph(): CapabilityGraph {
    const now = Date.now();
    return {
      nodes: [...this.nodes.values()].map((e) => ({
        peerId: e.meta.peerId,
        label: e.meta.label,
        online: now - e.lastSeen < STALE_MS,
        caps: e.caps,
      })),
    };
  }

  /** Persist a compiled tool in the room's Durable Object (the fabric outlives its devices). */
  storeTool(tool: StoredTool) {
    this.signaling.send(makeEnvelope(this.selfId, 'room', { type: 'store_tool', payload: { tool } }));
  }

  deleteTool(name: string) {
    this.signaling.send(makeEnvelope(this.selfId, 'room', { type: 'delete_tool', payload: { name } }));
  }

  private handle(env: Envelope) {
    if (this.blobs.handle(env)) return;
    switch (env.type) {
      case 'roster':
        this.syncRoster(env.payload.peers);
        return;
      case 'stored_tools':
        this.emit('storedTools', env.payload.tools);
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
        const before = entry.caps.map((c) => c.id).sort().join('|');
        const after = env.payload.caps.map((c) => c.id).sort().join('|');
        entry.caps = env.payload.caps;
        entry.lastSeen = Date.now();
        this.emit('log', `${entry.meta.label} advertises: ${entry.caps.map((c) => c.name).join(', ') || '(none)'}`);
        if (before !== after) {
          this.emit('graphChanged', { kind: 'caps_changed', peerId: entry.meta.peerId, label: entry.meta.label });
        }
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
        if (entry) {
          entry.lastSeen = Date.now();
          const sent = this.pings.get(env.id);
          if (sent) {
            entry.rtt = Math.max(1, Math.round(performance.now() - sent.at));
            this.pings.delete(env.id);
          }
        }
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
        this.emit('graphChanged', { kind: 'node_joined', peerId: peer.peerId, label: peer.label });
      }
    }
    for (const [peerId, entry] of this.nodes) {
      if (!present.has(peerId)) {
        entry.link.close();
        this.nodes.delete(peerId);
        // fail in-flight RPCs to this node immediately — no waiting out long compute/human budgets
        for (const [id, p] of this.pending) {
          if (p.peerId === peerId) {
            this.pending.delete(id);
            clearTimeout(p.timer);
            p.reject(new Error(`node ${entry.meta.label} left mid-call`));
          }
        }
        this.emit('log', `NODE LOST: ${entry.meta.label}`);
        this.emit('nodeLost', peerId, entry.meta.label);
        this.emit('graphChanged', { kind: 'node_lost', peerId, label: entry.meta.label });
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
      }, rpcTimeout(method));
      this.pending.set(id, { peerId, resolve, reject, timer });
      entry.link.send({ type: 'rpc_request', payload: { method, args } }, id);
    });
  }
}
