/// <reference types="@cloudflare/workers-types" />
import { RoomDO } from './room';

export { RoomDO };

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const ROOM_PATH = /^\/api\/room\/([A-Za-z0-9]{4,8})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH.exec(url.pathname);
    if (match) {
      const code = match[1].toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
    }
    // Anything else that reached the worker: hand to static assets (SPA fallback).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
