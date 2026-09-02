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

    // One host per room: role is client-claimed, so without this, anyone with the
    // room code could claim host and write/erase the fabric's persisted tools.
    if (role === 'host') {
      const rival = this.state.getWebSockets().find((ws) => {
        const m = this.meta(ws);
        return m?.role === 'host' && m.peerId !== peerId;
      });
      if (rival) return new Response('room already has a host', { status: 409 });
    }

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

    // The fabric outlives its devices: a joining host receives every compiled
    // tool persisted in this room's storage.
    if (role === 'host') {
      const stored = await this.state.storage.list({ prefix: 'tool:' });
      if (stored.size > 0) {
        this.send(server, JSON.stringify({
          v: 1,
          id: crypto.randomUUID(),
          from: 'room',
          to: peerId,
          type: 'stored_tools',
          payload: { tools: [...stored.values()] },
        } satisfies Envelope));
      }
    }

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

    // Persistence messages are consumed by the actor, never routed. Host-only.
    if (env.type === 'store_tool' || env.type === 'delete_tool') {
      if (sender.role !== 'host') return;
      void this.handleToolStorage(env);
      return;
    }

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

  private async handleToolStorage(env: Envelope) {
    try {
      await this.applyToolStorage(env);
    } catch (err) {
      // surfaced via `wrangler tail` (observability enabled) — never silent
      console.error('[room] tool storage failed', err);
    }
  }

  private async applyToolStorage(env: Envelope) {
    if (env.type === 'delete_tool') {
      const { name } = env.payload as { name?: unknown };
      if (typeof name === 'string' && name.length <= 64) {
        await this.state.storage.delete(`tool:${name}`);
      }
      return;
    }
    const { tool } = env.payload as { tool?: { goal?: unknown; pipeline?: { toolName?: unknown } } };
    const name = tool?.pipeline?.toolName;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]{2,40}$/.test(name) || typeof tool?.goal !== 'string') return;
    const existing = await this.state.storage.list({ prefix: 'tool:' });
    if (!existing.has(`tool:${name}`) && existing.size >= 20) return; // cap per room
    await this.state.storage.put(`tool:${name}`, tool);
  }

  webSocketClose(_ws: WebSocket) {
    this.broadcastRoster();
  }

  webSocketError(_ws: WebSocket) {
    this.broadcastRoster();
  }
}
