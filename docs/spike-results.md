# Phase 0 — Spike Results

## Verified from primary sources (Aug 27, 2026)

### API surface (webmachinelearning/webmcp spec + Chrome docs)
- Entry point: **`document.modelContext`** (NOT `navigator.modelContext` — older articles are wrong; spike page probes both defensively)
- Registration: **`document.modelContext.registerTool(def, { signal })`** — def = `{ name, description, inputSchema, async execute(args) }`
- **Unregistration: abort the `AbortController` signal** passed at registration — this is the revoke/hot-swap primitive
- **Dynamic changes are first-class in the spec: a `toolchange` event fires when tools are added/removed/updated** — agents listen to refresh their registry. The hot-reload concept is spec-aligned, not a hack. ✅ (Whether each agent client honors it live = the test matrix below)
- Also in spec: `getTools()`, `executeTool()`, Permissions Policy `"tools"` directive (default `self`; cross-origin iframes need `allow="tools"`)
- Declarative API also exists (annotated HTML forms) — not needed for Fabric

### Enablement
- **ChatGPT in-app browser: WebMCP supported natively, zero config** (official hackathon resources)
- **Chrome: origin trial Chrome 149–156; local flag `chrome://flags/#enable-webmcp-testing`** → relaunch
- This machine: **Chrome 151.0.7922.174 — inside the origin-trial window** ✅
- Chrome DevTools has a **WebMCP panel** (Application) — registration/invocation inspection; plus a "Model Context Tool Inspector" extension
- Judges: "may evaluate via live URL or based on description and repo alone" — README/transcript strategy confirmed correct

### Ecosystem (for Phase 1+)
- `useWebMCPTool` React hook (npm) — evaluate before hand-rolling
- Cloudflare `agents` repo has WebMCP examples + Workers React template — hosting alignment
- WebMCP security guide (prompt injection / trust boundaries) — cite in README

## Test rig (running now)
- Local: http://localhost:4173 (`npx serve` on `spikes/`)
- HTTPS tunnel (phone + ChatGPT): **https://dude-solaris-stages-column.trycloudflare.com** (quick tunnel — URL changes on restart)
- `spike-a.html` — registers `fabric_ping` (static, unique token) + buttons: FORGE `fabric_secret_number` v1 / HOT-SWAP to v2 (same name) / REVOKE. Logs every real invocation; listens for `toolchange`.
- `spike-b.html` — device probe: WebRTC loopback, WebGPU, WASM, camera, multi-file pick, directory picker, vibration.

## Test matrix — fill during manual run

### Spike A: ChatGPT in-app browser
| # | Test | Result | Notes |
|---|---|---|---|
| A1 | `fabric_ping` called, token matches page | ☐ | |
| A2 | Forged tool visible mid-conversation without any refresh | ☐ | |
| A3 | …or visible after next user message | ☐ | |
| A4 | …or only after page/agent refresh | ☐ | |
| A5 | HOT-SWAP: same name returns v2 secret | ☐ | |
| A6 | REVOKE: call fails cleanly | ☐ | |
| A7 | `toolchange` event seen in page log | ☐ | |

### Spike A: Chrome 151 + flag
| # | Test | Result | Notes |
|---|---|---|---|
| C1 | Flag enabled, `document.modelContext` present | ☐ | |
| C2 | DevTools WebMCP panel shows registered tools | ☐ | |
| C3 | Panel reflects forge/swap/revoke live | ☐ | |
| C4 | Any in-Chrome agent (Gemini) can call tools | ☐ | Spike C — 2h timebox |

### Spike B: phone
| # | Test | Result | Notes |
|---|---|---|---|
| B1 | Device/browser used | ☐ | |
| B2 | WebRTC loopback OK | ☐ | |
| B3 | Camera live capture OK | ☐ | |
| B4 | Multi-photo pick OK | ☐ | |
| B5 | Vibration OK (or iOS → sound fallback) | ☐ | |

## Decision (fill after matrix)
- [ ] **GO — full spec** (A2 pass: mid-conversation registration)
- [ ] **GO — next-turn choreography** (A3 pass: forge lands on next message; adjust video §11 pacing only)
- [ ] **GO — refresh-nudge fallback** (A4 only: core tool returns "refresh tools" instruction)
- [ ] **RESTRUCTURE** (none pass: pre-registered names + hot-swapped implementations; leverage story = stable-schema hot reload; rewrite video before Phase 1)

Cross-vendor beat: ☐ keep / ☐ cut (from C4)
Phone for demo: ☐ device: ____________
