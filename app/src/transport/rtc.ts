import { Envelope, parseEnvelope } from './protocol';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

/**
 * One WebRTC peer connection + 'fabric' DataChannel.
 * initiator (node) creates the channel and offers; responder (host) answers.
 * Signaling payloads travel through the room DO via the caller's sendSignal.
 */
export class RtcSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;

  constructor(private opts: {
    role: 'initiator' | 'responder';
    sendSignal: (p: SignalPayload) => void;
    onEnvelope: (env: Envelope) => void;
    onState: (open: boolean) => void;
  }) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) opts.sendSignal({ kind: 'ice', candidate: ev.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') opts.onState(false);
    };
    if (opts.role === 'responder') {
      this.pc.ondatachannel = (ev) => this.attach(ev.channel);
    }
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.opts.onState(true);
    dc.onclose = () => this.opts.onState(false);
    dc.onmessage = (ev) => {
      const env = parseEnvelope(ev.data);
      if (env) this.opts.onEnvelope(env);
    };
  }

  /** Initiator only: create channel + send offer. */
  async start() {
    this.attach(this.pc.createDataChannel('fabric'));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.opts.sendSignal({ kind: 'offer', sdp: offer.sdp! });
  }

  async handleSignal(p: SignalPayload) {
    try {
      if (p.kind === 'offer') {
        await this.pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.opts.sendSignal({ kind: 'answer', sdp: answer.sdp! });
      } else if (p.kind === 'answer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      } else {
        await this.pc.addIceCandidate(p.candidate);
      }
    } catch (err) {
      // Glare/late candidates are non-fatal; relay fallback covers a dead session.
      console.warn('[rtc] signal handling error', err);
    }
  }

  /** True if delivered over the DataChannel. */
  send(env: Envelope): boolean {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(env));
      return true;
    }
    return false;
  }

  get open(): boolean {
    return this.dc?.readyState === 'open';
  }

  close() {
    try { this.dc?.close(); } catch { /* noop */ }
    try { this.pc.close(); } catch { /* noop */ }
  }
}
