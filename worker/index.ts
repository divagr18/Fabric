/// <reference types="@cloudflare/workers-types" />
import { RoomDO } from './room';
import { handlePlan, PlanEnv } from './plan';

export { RoomDO };

interface Env extends PlanEnv {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const ROOM_PATH = /^\/api\/room\/([A-Za-z0-9]{4,8})$/;
const HF_PREFIX = '/api/hf/';

/**
 * Same-origin proxy for Hugging Face model files — hf.co stopped sending CORS
 * headers our way, so nodes fetch models through us. Immutable files, cached hard.
 */
async function proxyHuggingFace(request: Request, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') return new Response('GET only', { status: 405 });
  const upstream = 'https://huggingface.co/' + url.pathname.slice(HF_PREFIX.length) + url.search;

  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = await fetch(upstream, { redirect: 'follow' });
  if (!res.ok) return new Response(`upstream ${res.status}`, { status: res.status });

  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  // Tee the stream: one branch to the client now, one into the edge cache.
  const [toClient, toCache] = res.body!.tee();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache, { status: 200, headers })));
  return new Response(toClient, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH.exec(url.pathname);
    if (match) {
      const code = match[1].toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
    }
    if (url.pathname.startsWith(HF_PREFIX)) {
      return proxyHuggingFace(request, url, ctx);
    }
    if (url.pathname === '/api/plan') {
      return handlePlan(request, env);
    }
    // Anything else that reached the worker: hand to static assets (SPA fallback).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
