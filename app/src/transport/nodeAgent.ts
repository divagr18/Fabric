import { CapabilityStub, Envelope, PeerId } from './protocol';
import { PeerLink, ChannelKind, forceRelay } from './channel';
import { RtcSession } from './rtc';
import { Signaling, SignalingStatus } from './signaling';

type NodeEvents = {
  log: (line: string) => void;
  status: (s: SignalingStatus) => void;
  kind: (k: ChannelKind) => void;
};

/** Node-side agent: joins the room, advertises capabilities, answers pings and RPCs. */
export class NodeAgent {
  private signaling: Signaling;
  private link: PeerLink;
  private listeners: { [K in keyof NodeEvents]: NodeEvents[K][] } = { log: [], status: [], kind: [] };

  constructor(
    public roomCode: string,
    private selfId: PeerId,
    private label: string,
    private caps: CapabilityStub[],
  ) {
    this.signaling = new Signaling(roomCode, selfId, 'node', label);
    this.link = new PeerLink(selfId, 'host', this.signaling);
    this.signaling.onStatus = (s) => {
      this.emit('status', s);
      if (s === 'open') this.onConnected();
    };
    this.signaling.onMessage = (env) => this.handle(env);
  }

  on<K extends keyof NodeEvents>(event: K, cb: NodeEvents[K]) {
    this.listeners[event].push(cb);
  }

  private emit<K extends keyof NodeEvents>(event: K, ...args: Parameters<NodeEvents[K]>) {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  start() {
    this.signaling.connect();
  }

  stop() {
    this.link.close();
    this.signaling.close();
  }

  get kind(): ChannelKind {
    return this.link.kind;
  }

  private onConnected() {
    this.link.send({ type: 'advertise_capabilities', payload: { caps: this.caps } });
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
        this.link.send({ type: 'pong', payload: {} });
        return;
      case 'rpc_request': {
        const { method, args } = env.payload;
        if (method === 'echo') {
          this.emit('log', `echo ← host: ${JSON.stringify(args)}`);
          this.link.send(
            { type: 'rpc_response', payload: { ok: true, result: { echo: args, from: this.label, at: Date.now() } } },
            env.id,
          );
        } else {
          this.link.send(
            { type: 'rpc_response', payload: { ok: false, error: `unknown method ${method}` } },
            env.id,
          );
        }
        return;
      }
      default:
        return;
    }
  }
}
