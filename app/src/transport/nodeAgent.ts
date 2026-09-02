import { Capability, Envelope, PeerId } from './protocol';
import { PeerLink, ChannelKind, forceRelay } from './channel';
import { RtcSession } from './rtc';
import { Signaling, SignalingStatus } from './signaling';

export type PrimitiveHandler = (args: unknown, ctx: { link: PeerLink }) => Promise<unknown> | unknown;

type NodeEvents = {
  log: (line: string) => void;
  status: (s: SignalingStatus) => void;
  kind: (k: ChannelKind) => void;
};

/** Node-side agent: joins the room, advertises granted capabilities, dispatches primitive RPCs. */
export class NodeAgent {
  private signaling: Signaling;
  private link: PeerLink;
  private handlers = new Map<string, PrimitiveHandler>();
  private listeners: { [K in keyof NodeEvents]: NodeEvents[K][] } = { log: [], status: [], kind: [] };

  constructor(
    public roomCode: string,
    private selfId: PeerId,
    private label: string,
    private getCaps: () => Capability[],
  ) {
    this.signaling = new Signaling(roomCode, selfId, 'node', label);
    this.link = new PeerLink(selfId, 'host', this.signaling);
    this.signaling.onStatus = (s) => {
      this.emit('status', s);
      if (s === 'open') this.onConnected();
    };
    this.signaling.onMessage = (env) => this.handle(env);
  }

  on<K extends keyof NodeEvents>(event: K, cb: NodeEvents[K]): () => void {
    this.listeners[event].push(cb);
    return () => {
      const arr = this.listeners[event];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  private emit<K extends keyof NodeEvents>(event: K, ...args: Parameters<NodeEvents[K]>) {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  register(method: string, handler: PrimitiveHandler) {
    this.handlers.set(method, handler);
  }

  private startedFlag = false;

  /** Idempotent — StrictMode/HMR remounts may start/stop repeatedly. */
  start() {
    if (this.startedFlag) return;
    this.startedFlag = true;
    this.signaling.connect();
  }

  stop() {
    if (!this.startedFlag) return;
    this.startedFlag = false;
    this.link.close();
    this.signaling.close();
  }

  get kind(): ChannelKind {
    return this.link.kind;
  }

  /** Re-advertise current capabilities (call on every grant change). */
  advertise() {
    this.link.send({ type: 'advertise_capabilities', payload: { caps: this.getCaps() } });
  }

  private onConnected() {
    this.advertise();
    this.emit('log', `joined room ${this.roomCode} as ${this.label}`);
    if (!forceRelay() && !this.link.rtc) {
      const rtc = new RtcSession({
        role: 'initiator',
        sendSignal: (p) => this.signaling.send(
          { v: 1, id: crypto.randomUUID(), from: this.selfId, to: 'host', type: 'signal', payload: p },
        ),
        onEnvelope: (e) => this.handle(e),
        onState: (open) => {
          this.emit('log', open ? 'p2p channel open' : 'p2p channel closed — using relay');
          this.emit('kind', this.link.kind);
        },
      });
      this.link.rtc = rtc;
      void rtc.start();
    } else if (forceRelay()) {
      this.emit('log', 'relay-only mode (?relay=1)');
    }
  }

  private handle(env: Envelope) {
    switch (env.type) {
      case 'signal':
        void this.link.rtc?.handleSignal(env.payload);
        return;
      case 'ping':
        this.link.send({ type: 'pong', payload: {} }, env.id); // echo id so the host can measure RTT
        return;
      case 'rpc_request':
        void this.dispatch(env);
        return;
      default:
        return;
    }
  }

  private async dispatch(env: Envelope & { type: 'rpc_request' }) {
    const { method, args } = env.payload;
    if (method === 'fabric.advertise') {
      // built-in: the host asks us to resend capabilities (e.g. after it reloaded)
      this.advertise();
      this.link.send({ type: 'rpc_response', payload: { ok: true, result: { advertised: true } } }, env.id);
      return;
    }
    const handler = this.handlers.get(method);
    try {
      if (!handler) throw new Error(`this node does not serve ${method}`);
      this.emit('log', `→ ${method}`);
      const result = await handler(args, { link: this.link });
      this.link.send({ type: 'rpc_response', payload: { ok: true, result } }, env.id);
      this.emit('log', `✓ ${method}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.link.send({ type: 'rpc_response', payload: { ok: false, error: message } }, env.id);
      this.emit('log', `✗ ${method}: ${message}`);
    }
  }
}
