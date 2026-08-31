# Devpost submission draft (edit before submitting)

**Project name:** Fabric
**Tagline:** Codex proved agents should work on your machine. Fabric asks why they stop at one.
**Live URL:** https://fabric.keshav-agr2007.workers.dev
**Repo:** (public GitHub URL — push before submitting)
**Video:** (YouTube URL, ≤3 min)

---

## Inspiration

Local agent runtimes exist — for developers, on one machine, behind an install. Meanwhile the things an agent would actually be useful for live scattered across devices: photos on a phone, documents on a laptop, a GPU in a desktop, judgment in a person. Every path to giving an agent that reach today means uploading your life to someone's cloud. Browsers are the one runtime already installed on every device with permissioned paths to files, cameras, and GPUs — and now they have agents attached. WebMCP is the missing membrane.

## What it does

Fabric turns the browsers you already own into one runtime an agent can use. Devices join a room with a QR scan, each sharing only what its owner explicitly grants. ChatGPT sees four core WebMCP tools — `inspect_fabric`, `compile_tool`, `revoke_tool`, `request_from_human` — and **compiles the cross-device tools it needs at runtime**: describe a goal, Fabric plans a pipeline across the connected devices' capabilities, validates it, and registers the new tool mid-session. Photos are embedded on the phone that shares them; documents are OCR'd on the laptop that shares them; only vectors and results cross the network, peer to peer. When a device dies or a human revokes a capability, affected tools **hot-reload under the same name** — replanned onto the surviving devices, degraded with a precise explanation if nothing can serve them, healed automatically when capability returns. People are nodes too: the agent schedules a human to photograph a paper document or approve an export exactly like it schedules a GPU — and the human can always decline.

## Why WebMCP fits

The mutable WebMCP surface IS the product. The agent's action space is born at runtime (`toolchange` as core mechanic, not edge case); hot reload maps directly onto registration's AbortController; and WebMCP is the consent membrane — an agent reaches a device only through tools that device's page and human chose to expose. None of this exists without the standard: no install path on a phone, no cross-device composition for a CLI, no other way for an external agent to see N browsers as one machine.

## What people and agents can do together that was previously impossible

A person and their agent assemble work from devices *and people* in the same graph. The agent asks the human on the phone to photograph the paper certificate mid-pipeline; the human revokes an over-broad grant and watches the agent's tool re-fit itself to what remains; the final export waits for a human tap. Collaboration isn't a chat pattern here — it's the runtime's scheduling model.

## How we built it

One Cloudflare Worker (Static Assets SPA + Durable Object per room for WebSocket signaling + same-origin model proxy + planner endpoint). WebRTC DataChannel star topology with transparent relay fallback. On-device compute via transformers.js CLIP (WebGPU/fp16 on desktop, WASM/q8 on mobile) and Tesseract. The planner is GPT (server-side, structured to a typed-primitive pipeline JSON — no code generation) with a validator that rejects anything the capability graph can't serve, and a replan mode with a frozen interface for hot reload. All `document.modelContext` code lives in `app/src/webmcp/` — registration, revoke, and hot-swap in one greppable place.

## Challenges

The honest list, all hit live and fixed in the commit history: Hugging Face dropped CORS for our origin (solution: same-origin edge-cached model proxy — which also made the demo independent of anyone's CDN); mobile WebGPU silently selected a 350 MB fp32 model (dtype strategy per device class); capability ids going stale between compile-time and call-time (primitives now resolve semantically over current grants); HEIC photos killing whole pipelines (per-file decode with skip); phones dropping off the fabric when screens sleep (wake lock).

## Accomplishments

ChatGPT compiled a tool that didn't exist, WebMCP registered it mid-conversation, and it ran a CLIP search on a phone's own silicon over photos that never left the device — then correctly ranked the dog photo first. The planner demonstrably refuses to fabricate capabilities that aren't in the graph. Replan preserves a byte-identical interface while re-fitting the implementation to surviving hardware.

## What's next

Cross-vendor: the same fabric page serving Chrome's built-in agent alongside ChatGPT — two vendors' agents sharing one consent membrane. Session capabilities (a page exposing safe, user-approved actions from an authenticated app). Trace-driven tool suggestion (repeated primitive sequences offered as compiled tools).

---

### Submission checklist (rules compliance)
- [ ] Live URL works in ChatGPT in-app browser and Chrome+flag (cold test from clean profile)
- [ ] Public repo (GitHub), MIT license visible, README has WebMCP implementation map
- [ ] Video ≤3 min, public YouTube, audio explanation, no third-party music/trademarks
- [ ] Text description covers: why WebMCP fits · UX improvement · people+agents together · implementation
- [ ] Built during submission period — commit history is the evidence
