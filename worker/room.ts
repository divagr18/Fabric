/// <reference types="@cloudflare/workers-types" />

/**
 * RoomDO — one Durable Object per Fabric room (named by room code).
 * Pure message router: accepts WebSockets (Hibernation API), keeps a roster,
 * relays envelopes between peers, broadcasts roster changes on join/leave.
 * It never inspects payloads beyond routing fields.
 */

interface PeerMeta {
  peerId: string;
  role: 'host' | 'node';
  label: string;
  joinedAt: number;
}

interface Envelope {
  v: number;
  id: string;
  from: string;
  to: string; // peerId | 'host' | 'room'
  type: string;
  payload: unknown;
}

export class RoomDO implements DurableObject {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const peerId = (url.searchParams.get('peer') ?? crypto.randomUUID()).slice(0, 32);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'node';
    const label = (url.searchParams.get('label') ?? 'device').slice(0, 40);

    // One connection per peerId: close any stale socket for the same peer (reconnects).
    for (const ws of this.state.getWebSockets()) {
      const meta = this.meta(ws);
      if (meta?.peerId === peerId) {
        try { ws.close(4000, 'replaced by reconnect'); } catch { /* already gone */ }
      }
    }

    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server, [peerId, role]);
    server.serializeAttachment({ peerId, role, label, joinedAt: Date.now() } satisfies PeerMeta);
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private meta(ws: WebSocket): PeerMeta | null {
    try { return ws.deserializeAttachment() as PeerMeta; } catch { return null; }
  }

  private roster(): PeerMeta[] {
    return this.state.getWebSockets()
      .map((ws) => this.meta(ws))
      .filter((m): m is PeerMeta => m !== null);
  }

  private send(ws: WebSocket, data: string) {
    try { ws.send(data); } catch { /* closing socket; roster broadcast will follow */ }
  }

  private broadcastRoster() {
    const msg = JSON.stringify({
      v: 1,
      id: crypto.randomUUID(),
      from: 'room',
      to: 'room',
      type: 'roster',
      payload: { peers: this.roster() },
    } satisfies Envelope);
    for (const ws of this.state.getWebSockets()) this.send(ws, msg);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message !== 'string') return;
    let env: Envelope;
    try { env = JSON.parse(message) as Envelope; } catch { return; }
    if (!env || env.v !== 1 || typeof env.to !== 'string') return;

    const sender = this.meta(ws);
    if (!sender) return;
    env.from = sender.peerId; // never trust client-claimed identity

    const data = JSON.stringify(env);
    if (env.to === 'room') {
      for (const peer of this.state.getWebSockets()) {
        if (peer !== ws) this.send(peer, data);
      }
      return;
    }
    for (const peer of this.state.getWebSockets()) {
      const m = this.meta(peer);
      if (!m) continue;
      if (m.peerId === env.to || (env.to === 'host' && m.role === 'host')) {
        this.send(peer, data);
      }
    }
  }

  webSocketClose(_ws: WebSocket) {
    this.broadcastRoster();
  }

  webSocketError(_ws: WebSocket) {
    this.broadcastRoster();
  }
}
