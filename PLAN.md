# Fabric — Phase-wise Build Plan

Companion to `FABRIC-SPEC.md`. Dates: **Aug 27 → Sep 3 (1:00 PM PDT deadline)** — 7 working days remain, so the spec's 8-day table compresses: Phases 0–1 share Day 1–2, and polish/video days are protected at all costs.

**Standing rules**
1. Anything not in the video or the judge-alone path doesn't get built.
2. Every phase has an exit gate. A phase that misses its gate by >half a day triggers its listed contingency, not overtime.
3. Commit early and often — commit history is the timestamped evidence the rules require (built after Aug 25).
4. Feature freeze at end of Phase 4. After that, only polish, content, and packaging.

---

## Phase 0 — Validation spikes (Day 1 morning, ~4h) 🔴 EVERYTHING DEPENDS ON THIS

Goal: kill or confirm the load-bearing assumptions before writing product code.

### 0.1 Spike A — Dynamic WebMCP registration (~2.5h)
The money shot depends on ChatGPT seeing a tool registered mid-session.

- [ ] Verify current WebMCP API shape from primary sources (spec repo / MCP-B docs / Chrome implementation status) — do NOT trust memory; the API surface (`navigator.modelContext`, tool registration calls, list-changed behavior) may have moved
- [ ] Build `spike-a.html`: one static tool + a button that registers a second tool at runtime
- [ ] Test matrix:
  - ChatGPT browser (Atlas / in-app browser) — does the new tool appear mid-conversation? After a new user turn? Not at all?
  - Chrome with WebMCP enabled (flag/origin trial) — same questions with its agent surface
- [ ] Record exact behavior in `docs/spike-results.md` (this becomes README material — judges love verified platform notes)

**Decision table:**
| Result | Consequence |
|---|---|
| New tool visible mid-conversation | Full spec as written. GO |
| Visible only on next user turn | Demo choreography: compile at end of one turn, call on the next. Still strong. GO |
| Requires reconnect/refresh | Compile flow returns "tool ready — refresh tools" via core-tool response; hot reload keeps same tool name/schema so ONLY registration timing softens. GO with adjusted script |
| Never visible dynamically | 🔴 Restructure: pre-register tool *names* with mutable implementations — leverage story shifts to hot-swap-under-stable-schema. Rewrite video §11 before building anything |

### 0.2 Spike B — Phone reality (~1h)
- [ ] On Android Chrome and iOS Safari: WebRTC DataChannel to a desktop peer, `<input type="file" multiple>` photo pick, `getUserMedia` capture, QR-link join flow
- [ ] Record which phone/browser combo demos best (one is enough)

### 0.3 Spike C — Chrome's agent on the fabric page (STRICT 2h timebox)
- [ ] Can Chrome's built-in agent call the same page's WebMCP tools? If yes → cross-vendor beat lives. If flaky → cut, one README roadmap line, zero mourning.

**Exit gate 0:** GO/NO-GO recorded; demo choreography for the compile moment decided; phone combo picked.

---

## Phase 1 — Scaffold + transport (Day 1 afternoon → Day 2 morning)

Goal: N browsers form a room and exchange typed messages.

### 1.1 Scaffold (~2h)
- [ ] Repo `fabric` — public from day one, MIT license in header
- [ ] Vite + React + TS. Structure (flat, no monorepo):
  ```
  fabric/
  ├── src/
  │   ├── webmcp/        # ALL WebMCP surface code — greppable in 10s (registry, schemas, register/unregister)
  │   ├── transport/     # signaling client, WebRTC mesh, protocol types
  │   ├── capabilities/  # primitives + consent
  │   ├── compile/         # planner client, pipeline validator, executor, hot-reload
  │   ├── ui/            # panels, topology, cards, counters
  │   └── node/          # node-page entry (a device's view)
  ├── worker/            # Cloudflare Worker: signaling (Durable Object) + planner proxy
  ├── docs/              # spike-results, transcript, screenshots
  └── README.md
  ```
- [ ] Deploy pipeline live on day one: Cloudflare Pages + Worker (sponsor-judge alignment). `fabric.<something>.workers.dev` acceptable; custom domain optional.

### 1.2 Signaling + rooms (~3h)
- [ ] Durable Object per room: join/leave, peer list, SDP/ICE relay, heartbeat presence
- [ ] Room codes (`fabric.app/r/XXXX`) + QR render on host page
- [ ] Tabs-as-nodes falls out free: same URL, new tab = new peer

### 1.3 WebRTC mesh + protocol (~4h)
- [ ] DataChannels host↔node (star topology — host is coordinator; do NOT build full mesh, unnecessary)
- [ ] Typed protocol (one file, discriminated unions): `hello`, `advertise_capabilities`, `revoke_capability`, `invoke_primitive`, `primitive_result`, `human_request`, `human_response`, `node_lost`
- [ ] Relay fallback through the DO when direct WebRTC fails (hostile networks) — transparent to upper layers

**Exit gate 1:** 3 nodes (2 tabs + 1 phone) join a room, advertise dummy capabilities, echo an RPC round-trip, and survive a node closing (host sees `node_lost` <5s).
**Contingency:** WebRTC eats >1 day → ship DO-relay-only transport. Latency is fine for the demo; note it honestly.

---

## Phase 2 — Capability layer (Day 2 afternoon → Day 3)

Goal: real primitives, real consent, running on real nodes.

### 2.1 Consent + grants (~3h)
- [ ] Consent card UI on node join: named capabilities with per-item toggles ("Share: `documents/` ✓ · camera ✓ · location ✗")
- [ ] Desktop/laptop: `showDirectoryPicker` grant → indexed file listing (name/type/size only crosses the wire until a `data.read` is invoked)
- [ ] Phone: multi-file picker + camera
- [ ] Copy audit: every string says **"shared/selected"**, never "has" — the Chrome-judge honesty rule

### 2.2 Primitives (~6h)
- [ ] `data.list / data.read / data.query` over granted scopes
- [ ] `compute.embed` — transformers.js CLIP/text embeddings in a Worker; WebGPU backend where available, WASM fallback **built now** (it IS the hot-reload story)
- [ ] `compute.ocr` — Tesseract.js in a Worker
- [ ] `compute.match` — cosine similarity / checklist-to-doc matching on host
- [ ] `sensor.capture` — getUserMedia still capture, user-triggered
- [ ] `human.request(kind, payload)` — full-screen card on the target node: capture / decide / approve, with response routing
- [ ] `artifact.compile` — pdf-lib packet assembly on host
- [ ] Benchmark embed/OCR on the real demo dataset — numbers go in the README

### 2.3 Capability graph (~2h)
- [ ] Host-side registry: capability → node, type, scope, availability; updates on join/leave/revoke; event stream the UI and planner both consume

**Exit gate 2:** From host devtools: invoke each primitive on each node type and get correct results; pull a node mid-call and get a clean failure the caller can catch.
**Contingency:** OCR too slow/flaky on real scans → demo dataset uses clean printed docs (honest — they're your own docs); or swap OCR for filename+embedding matching and never claim OCR.

---

## Phase 3 — WebMCP surface + Compile (Day 4)

Goal: ChatGPT compiles a tool and calls it, end to end. **The project's spine day.**

### 3.1 Core WebMCP tools (~2h)
- [ ] Register `inspect_fabric`, `compile_tool`, `revoke_tool`, `request_from_human` with clean JSON schemas + descriptions written for an agent reader
- [ ] `inspect_fabric` returns the capability graph in agent-friendly form (semantic, not raw devices)

### 3.2 Planner (~4h)
- [ ] Worker endpoint `POST /plan`: goal + constraints + capability graph → pipeline JSON (OpenAI API, small/fast model, strict JSON output)
- [ ] Pipeline schema: DAG of primitive invocations with node bindings, data-flow refs, human stages, `no_cloud_upload` constraint honored structurally (no primitive can exfiltrate — enforce in executor, not just prompt)
- [ ] Validator: every referenced primitive exists in the current graph; reject + honest error back to the agent otherwise; one retry with validator feedback
- [ ] Test with 5+ goal phrasings of the Packet task; pin the demo phrasing that plans best

### 3.3 Executor + registration (~4h)
- [ ] DAG runner: dispatch stages over RPC, stream stage events (for UI), collect results, propagate failures
- [ ] On successful plan: register compiled tool via WebMCP (name, description, input/output schema from planner), store plan as `v1`
- [ ] Wire the Phase-0 choreography decision (mid-turn vs next-turn registration)

**Exit gate 3:** In ChatGPT against the live URL: `compile_tool` → `assemble_document_packet` appears → ChatGPT calls it → multi-node execution completes → structured results (checklist status + doc refs) return to ChatGPT. **Record a screen capture the moment this works** — raw footage bank + proof-of-progress.
**Contingency:** LLM planning unreliable → planner becomes template-retrieval (curated plan for the packet-shaped goal, parameterized by graph). Keep the LLM path behind a flag; README describes exactly what's dynamic. Honesty > theater.

---

## Phase 4 — Hot reload + human-in-the-loop (Day 5) → FEATURE FREEZE

### 4.1 Human stages (~3h)
- [ ] Executor pauses on `human.request` stage → target node's card buzzes (vibration API + sound) → response resumes pipeline
- [ ] Approval gate before `artifact.compile` output is finalized
- [ ] Disambiguation flow ("two passport scans — which is current?") if planner naturally produces it; do not force

### 4.2 Hot reload (~5h)
- [ ] Triggers: `node_lost` (heartbeat timeout) AND live revocation (a node un-toggles a capability mid-run)
- [ ] On trigger: mark affected compiled tools stale → replan against updated graph → same name+schema, plan `v2` → version badge in UI → in-flight execution either resumes from completed stages (nice) or restarts cleanly (acceptable)
- [ ] Agent-facing: tool result includes a note when execution ran on a degraded/replanned fabric ("GPU unavailable — completed on WASM, 4.2× slower") — honesty as a feature
- [ ] Rehearse both demo variants: lid-close (node loss) and revoke-toggle (steering)

### 4.3 Full-loop rehearsal (~2h)
- [ ] Script the exact demo sequence; run it 5× end to end; log every flake and fix or route around
- [ ] **FEATURE FREEZE at end of day.** Write the freeze commit message so future-you respects it.

**Exit gate 4:** The complete §11 video sequence works live, twice in a row, without touching devtools.

---

## Phase 5 — Product polish + judge-alone path (Day 6)

### 5.1 The three-panel runtime UI (~5h)
- [ ] Left: nodes + consent state. Center: live topology — stages light on the node running them, human stage included. Right: WebMCP surface — CORE / COMPILED, version badges, birth animation on registration
- [ ] Metrics strip: `nodes · compiled tools · hot reloads · raw data uploaded: 0 B` (`tabular-nums`)
- [ ] Result view: checklist filling, doc thumbnails, compiled packet preview — this is the artifact shot, art-direct it
- [ ] Pass: every animation maps to a real system event; kill anything decorative

### 5.2 Judge-alone path (~4h)
- [ ] Landing page: 30-second explainer + "Try it now": demo room with sample dataset, "open this link in a new tab — it becomes your second device", optional QR for phone
- [ ] Hosted always-on node: headless Chromium (Playwright on a small VM/container) joined to the demo room with the sample archive — a real node, so the fabric is never empty
- [ ] Sample dataset: realistic fake visa docs (passport bio page, statements, photos, certificate) — clearly watermarked SAMPLE
- [ ] Cold test: fresh Chrome profile + ChatGPT → full loop in <3 min following only on-screen instructions. Fix every stumble.

**Exit gate 5:** A friend (or you on a borrowed machine) completes the loop unassisted, <3 min, zero verbal help.

---

## Phase 6 — Video (Day 7, full day, protected)

- [ ] Morning: storyboard §11 shot-for-shot; stage the desk (3 devices visible, clean); phone camera on tripod/stack for the physical shots
- [ ] Record in segments, many takes: cold-open tool-list mutation · consent cards · QR join · compile+registration · execution+phone buzz+paper capture · revocation+hot reload · artifact · close
- [ ] Screen recordings at 1080p+, UI at comfortable zoom; physical shots on phone
- [ ] Voiceover: yourself, script from §11, slightly imperfect > polished-agency (evidence: every winner studied)
- [ ] Edit to ≤2:55. No copyrighted music (rules), captions for key lines
- [ ] Upload YouTube (public), verify playback

**Exit gate 6:** Video live, <3:00, passes both glances: engineer = "technically outrageous", non-technical = "it did their paperwork without uploading their passport."

## Phase 7 — Packaging + submission (Day 8, Sep 2 → Sep 3 morning)

- [ ] README: hero GIF · **WebMCP implementation section with file paths + line refs** · architecture sketch · **annotated session transcript** (compile → register → call → human dispatch → revoke → hot reload → call again) · benchmark numbers · spike findings · run instructions
- [ ] Devpost description with rubric-mirroring headings: *Why WebMCP fits* / *What people and agents do together that they couldn't* / *Implementation* — concrete numbers, zero unfalsifiable poetry
- [ ] License visible in repo header; repo cleaned (no dead packages, no TODO graveyards)
- [ ] Smoke test live URL from a clean machine + phone network (not home Wi-Fi)
- [ ] **Submit ≥12h early** (Sep 2 evening IST ≈ well before Sep 3 1PM PDT). Devpost accepts edits until deadline — submit, then improve.

---

## Dependency chain (what actually blocks what)

```
0.1 Spike A ──► 3.3 registration choreography ──► Phase 6 video script
0.2 Spike B ──► 2.1 phone consent/capture ──► 4.1 human stage beat
1.3 protocol ──► 2.2 primitives ──► 3.3 executor ──► 4.2 hot reload
2.3 graph ──► 3.2 planner
Phase 5 hosted node ──► judge-alone gate (parallelizable from Day 4 if ahead)
```

Nothing in UI polish (5.1) blocks anything — steal from it first when behind, but never below "no jank in the video frame."

## Time-pressure triage (pre-decided, in order)

1. Cut Spike C / cross-vendor (already optional)
2. Cut disambiguation flow (keep capture + approval)
3. Cut resume-from-completed-stages (clean restart is fine)
4. Template planner behind honest README (Phase 3 contingency)
5. DO-relay transport only (Phase 1 contingency)
6. **Never cut:** dynamic registration moment · hot reload · human dispatch · judge-alone path · video day

## First three actions (today)

1. Verify WebMCP API surface from primary sources → build `spike-a.html` → run the ChatGPT test matrix (§0.1)
2. Record results in `docs/spike-results.md`, make the GO decision
3. `git init`, scaffold, first deploy to Cloudflare — a live URL by tonight
