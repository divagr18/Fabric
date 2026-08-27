import { Envelope, PeerId, parseEnvelope } from './protocol';

export type SignalingStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** WebSocket client to the room Durable Object, with auto-reconnect + backoff. */
export class Signaling {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private closedByUs = false;
  private queue: string[] = [];

  onMessage: (env: Envelope) => void = () => {};
  onStatus: (s: SignalingStatus) => void = () => {};

  constructor(
    private roomCode: string,
    private peerId: PeerId,
    private role: 'host' | 'node',
    private label: string,
  ) {}

  connect() {
    this.closedByUs = false;
    this.open();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ peer: this.peerId, role: this.role, label: this.label });
    const url = `${proto}://${location.host}/api/room/${this.roomCode}?${params}`;
    this.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.onStatus('open');
      for (const m of this.queue.splice(0)) ws.send(m);
    };
    ws.onmessage = (ev) => {
      const env = parseEnvelope(ev.data);
      if (env) this.onMessage(env);
    };
    ws.onclose = (ev) => {
      if (this.closedByUs || ev.code === 4000 /* replaced by our own reconnect */) return;
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleReconnect() {
    this.attempts += 1;
    const delay = Math.min(500 * 2 ** this.attempts, 8000);
    this.onStatus('reconnecting');
    setTimeout(() => { if (!this.closedByUs) this.open(); }, delay);
  }

  send(env: Envelope) {
    const data = JSON.stringify(env);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    else this.queue.push(data);
  }

  close() {
    this.closedByUs = true;
    this.onStatus('closed');
    this.ws?.close();
  }
}
