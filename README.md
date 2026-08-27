# Fabric

**Codex proved agents should work on your machine. Fabric asks why they stop at one.**

Fabric turns every browser you own — laptop, desktop, phone — into one runtime an agent can use through [WebMCP](https://github.com/webmachinelearning/webmcp). Devices join a room with a QR scan, each contributing only what its owner explicitly exposes. An external agent (ChatGPT) sees a small WebMCP tool surface and forges the cross-device tools it needs at runtime; when the hardware changes, the tools hot-reload while their interface survives.

> Status: Phase 1 (transport substrate). See `PLAN.md` for the build plan and `FABRIC-SPEC.md` for the full spec.

## Stack

- **Client:** Vite + React + TS (`app/`)
- **Server:** one Cloudflare Worker — static assets + `/api/room/:code` WebSocket signaling via a Durable Object per room (`worker/`)
- **Transport:** WebRTC DataChannels (star topology, host = hub) with transparent relay fallback through the room DO

## Develop

```sh
npm install
npm run dev:worker   # wrangler dev on :8787 (signaling)
npm run dev          # vite on :5173, proxies /api → :8787
```

Open http://localhost:5173 (host), then open the printed `/r/CODE` link in more tabs (nodes). `?relay=1` on a node URL forces relay-only transport.

## Deploy

```sh
npx wrangler login   # once
npm run deploy
```

## License

MIT
