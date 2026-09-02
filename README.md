# Fabric

**Codex proved agents should work on your machine. Fabric asks why they stop at one.**

Fabric turns every browser you own — laptop, desktop, phone — into one runtime an agent can use through [WebMCP](https://github.com/webmachinelearning/webmcp). Devices join a room with a QR scan, each contributing only what its owner explicitly shares. ChatGPT sees four core tools and **compiles the cross-device tools it needs at runtime**; when the hardware changes — a device dies, a human revokes a capability — the tool **hot-reloads under the same name** while its interface survives.

**Live:** https://fabric.keshav-agr2007.workers.dev — open it in ChatGPT's in-app browser (or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`) and follow the "Try it" panel. One reviewer, one laptop, two tabs is enough; sample files are generated on-click.

---

## Why WebMCP fits this use case

Fabric is not a site that *added* WebMCP tools — the mutable WebMCP surface **is the product**:

1. The agent's action space is born at runtime. `compile_tool` plans a pipeline over whatever devices are currently sharing capabilities, and registers the result **mid-session** — the tool list mutates while the agent works (the spec's `toolchange` event, exercised as the core mechanic).
2. Hot reload maps 1:1 onto the platform primitive: registration's `AbortController` is aborted and the same name re-registered with a new implementation. Same schema, new machine underneath.
3. WebMCP is the membrane between parties: an agent reaches another device's capabilities only through tools that device's page — and its human — chose to expose. The consent boundary is the protocol.
4. A CLI agent (Codex-style) can't do any of this: no install path on your phone, no camera, no cross-device composition, and no standard surface for an external agent to see N browsers as one machine.

## What people and agents do together that they couldn't before

- **People are in the tool list.** `request_from_human` lets the agent ask a person to photograph a paper document, decide between options, or approve an action — routed to their device, always declinable. Compiled pipelines schedule human stages exactly like GPU stages.
- **Steering, not just consenting.** Revoke a capability mid-session and affected tools replan live (or degrade with a precise explanation, and heal when capability returns). The human reshapes the machine under the agent while it works.
- **Authority stays human.** Artifact export raises an on-screen Approve/Deny card; declining fails the pipeline honestly.
- **Privacy as a systems property:** execution goes to the data. Photos are embedded *on the phone that shares them*; documents are OCR'd *on the laptop that shares them*; only vectors, text, and explicitly-read files cross the network — peer to peer, never a server. The metrics strip keeps score: `raw file bytes to any cloud: 0 B`.

## How WebMCP is implemented (where to look)

Every tool — core and runtime-compiled — goes through the standard registration call in `app/src/webmcp/registry.ts`:

```js
document.modelContext.registerTool({
  name: pipeline.toolName,          // e.g. "find_matching_photos" — chosen by the agent
  description: pipeline.description,
  inputSchema: pipeline.inputSchema,
  execute: async (input) => { /* run the compiled cross-device pipeline */ },
}, { signal: controller.signal });   // abort = revoke; re-register same name = hot reload
```

Every `document.modelContext` call lives in **`app/src/webmcp/`**:

| What | Where |
|---|---|
| Registration/revoke/hot-swap via `registerTool` + `AbortController` | `app/src/webmcp/registry.ts` |
| The 4 core tools (`inspect_fabric`, `compile_tool`, `revoke_tool`, `request_from_human`) + compiled-tool execute with mid-run recovery | `app/src/webmcp/surface.ts` |
| Pipeline model (typed primitives, no codegen) + validator | `app/src/compile/pipeline.ts`, `app/src/compile/validate.ts` |
| DAG executor (layered concurrency, blob auto-await, host ops, approval gate) | `app/src/compile/executor.ts` |
| Hot reload (graph-change sweep, frozen-interface replan, degraded/heal) | `app/src/compile/hotReload.ts` |
| Planner endpoint (OpenAI, replan mode) | `worker/plan.ts` |
| Consent grants + on-device primitives (embed/OCR/human) | `app/src/capabilities/` |
| Transport: room DO signaling, WebRTC star + relay fallback, chunked blobs | `worker/room.ts`, `app/src/transport/` |

Compiled tools are **not generated code** — the planner (GPT, server-side) emits a validated JSON pipeline over a fixed primitive vocabulary, bound to nodes that actually advertise those methods. The validator rejects anything else, verbatim errors feed one planner retry, and the planner demonstrably refuses to fabricate when a capability isn't in the graph.

## A real session (annotated, from the host log)

```text
[22:57:33] ⚡ + find_matching_photos REGISTERED via WebMCP     ← ChatGPT called compile_tool;
[22:57:33] ⚡ find_matching_photos REGISTERED (3 stages)          the tool appeared in its list mid-session
[22:57:44] stage embed_query  [compute.embed_text @ Android] running
[22:57:44] stage embed_photos [compute.embed      @ Android] running   ← CLIP runs ON the phone (wasm),
[22:57:48] stage embed_query  done                                       photos never leave it
           ...host.match ranks on the host...
ChatGPT:   "Success. Dog-photo matches:
            1. 78105.jpg — 0.2599      ← the dog photo, ranked first
            2. 78336.png — 0.2049"
```

Hot reload, from the planner smoke suite (node removed from graph, interface frozen):

```text
PASS  compile → find_similar_photos [embed_text@laptop → embed@laptop → embed@phone → match@host]
PASS  replan  → same name, same schema, phone gone: [embed_text@laptop → embed@laptop → match@host]  (6.5s)
```

## Measured on real hardware

| | |
|---|---|
| CLIP embed, warm (WebGPU desktop) | 1.6–2.1 s per small batch |
| OCR, one real scanned document | 1.2 s |
| Planner (compile) | 10–20 s; replan ~6 s |
| Model delivery | ~89 MB once per device (q8 on mobile, fp16 on desktop GPU), served same-origin via `/api/hf/*` edge-cached proxy |
| Node-loss detection | < 5 s (roster push) |

## Architecture

```
        ChatGPT (external agent)
                 │  WebMCP — document.modelContext, tools registered/aborted at runtime
        ┌──── Fabric host page ────┐
        │ tool registry · planner  │──── POST /api/plan (Cloudflare Worker → GPT, key server-side)
        │ validator · executor     │
        │ hot-reload manager       │
        └──────────┬───────────────┘
                   │ WebRTC DataChannels (star) with transparent DO-relay fallback
    ┌──────────┬───┴──────┬───────────┐
  laptop tab  desktop   phone (QR)   human
  files       files+GPU camera+files  capture / decide / approve
```

One Cloudflare Worker serves the SPA (Static Assets), WebSocket signaling, the model proxy, and the planner endpoint.

### Why each fabric is a Durable Object

A fabric isn't a row in a database — it's an **addressable actor at the edge**. `ROOM.idFromName(code)` gives every fabric a global identity as a single-threaded live object, and that buys three things outright:

- **Ordering and consistency for free.** The object serializes every event — joins, losses, capability changes, relayed blob chunks. Hot reload trusts the roster and blob transfers reassemble byte-perfect because the actor model *is* the consensus; Fabric contains zero coordination code.
- **A standing runtime that costs nothing while idle.** WebSocket Hibernation evicts the compute while keeping every device's socket open — a personal fabric can sit parked at the edge indefinitely for ~free. That's the deployment story, not a demo constraint.
- **Locality.** The object instantiates near the first device that joins — the coordination point for your living room lives at the edge near your living room.

It also points at the next step: an actor with storage can **outlive its devices**. Persisting compiled tool definitions in the object — so your fabric still remembers what the agent built when you rejoin tomorrow — is a `storage.put` away (roadmap, not shipped).

## Run it

```sh
npm install
npm run dev:worker   # wrangler dev :8787 (signaling + planner; needs OPENAI_API_KEY in .dev.vars)
npm run dev          # vite :5173, proxies /api
npm run deploy       # build + wrangler deploy
```

Tests: `npx tsx tests/validate.test.ts` (pipeline validator) · `npx tsx tests/plan.smoke.ts` (live planner incl. frozen-interface replan).

## Honesty notes

- Nodes contribute **only what their user explicitly shares** — a browser cannot enumerate your photo library, read other tabs, or touch sessions; Fabric never pretends otherwise. Copy throughout says *shared*, never *has*.
- The room code is the only auth (hackathon scope); the planner endpoint is same-origin and metadata-only — goals and capability *descriptions* go to the LLM, never file contents.
- Compiled tools run typed primitives, not arbitrary code. Prompt-injection surface is bounded by the primitive vocabulary and per-capability consent.
- Built solo during the submission window; the commit history is the timeline, including the real failures (hf.co CORS, a 350 MB wrong-dtype download, HEIC decode) and their fixes.

## License

MIT
