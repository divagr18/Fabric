# Fabric — Final Build Spec

**The WebMCP Challenge (webmcp.devpost.com) · Deadline: Sep 3, 2026, 1:00 PM PDT · Solo build · 8 days**

---

## 0. The one-paragraph version

Fabric is a web app that turns every browser you own — laptop, desktop, phone — into one runtime an agent can use. Devices join a session with one QR scan, each contributing only what its owner explicitly exposes: files, GPU compute, camera, judgment. ChatGPT sees a tiny WebMCP tool surface (`inspect_fabric`, `compile_tool`, `revoke_tool`) and **compiles the tools it needs at runtime** — Fabric plans a cross-device pipeline, registers the new tool via WebMCP mid-session, and ChatGPT calls it seconds later. When the hardware changes — a device dies, or the human revokes a capability mid-task — Fabric replans and hot-reloads the tool's implementation while its WebMCP interface survives. The human is a node in the runtime, not a spectator: the agent schedules people (photograph this, decide that, approve this) exactly like it schedules GPUs.

---

## 1. Framing (locked — do not relitigate)

### The pitch

> **Codex proved agents should work on your machine. Fabric asks why they stop at one.**

Local agent runtimes already exist — for developers, on one machine, behind an install. Fabric is local execution for the rest of your life: every device you own joins one runtime through the browser — no install — and the agent composes them: files here, GPU there, camera in your pocket, judgment in your hands.

### The differentiating kernel

Not "local execution" (Codex owns that phrase). **Composition across devices, zero install.** No CLI on earth can use your phone's camera, your desktop's GPU, and your laptop's files in a single task. Browsers are the only runtime already installed on every device with permissioned paths to files, cameras, and GPUs — and now they have agents attached.

### The technical reveal (for Alex Nahas / the deep-cut section)

> **WebMCP is the syscall interface. Your browsers are the machine.**

WebMCP is also the *membrane between parties*: an agent reaches another device's capabilities only through tools that device's page — and its human — chose to expose. The consent boundary is the protocol.

### The privacy thesis (stated dryly, as a systems property)

Data stays private because **execution goes to the data instead of data going to the execution**. `raw data uploaded: 0 B` is the proof meter, permanently on screen.

### Framings that are DEAD (rejected in review — do not resurrect)

- ❌ "Private brain / search your life" — crowded field (Rewind, Recall, every personal-RAG demo)
- ❌ Body/organs metaphor — gimmicky
- ❌ Mom's-birthday sentimentality as the spine — wrong register for a 7-engineer judge panel
- ❌ "Runtime / ABI / infrastructure" as the *lead* — reads as technical PoC; it's the reveal, not the headline
- ❌ Generic browser-compute cluster — fails the "would this exist without WebMCP" gate
- ❌ Enterprise anything (incident response, deploy permissions, high-LTV customers)

---

## 2. Why WebMCP is indispensable (the gate answer, memorized)

1. The product **is** a live, mutable tool surface presented to an external agent. Without WebMCP there is no product — the mutating tool list *is* the interface.
2. Dynamic registration + hot reload exercise WebMCP's deepest capability: the action space changes while the agent works. The judge literally watches the WebMCP surface mutate inside ChatGPT.
3. Cross-device, cross-vendor, browser-native execution cannot exist without a standard exactly like WebMCP: it's the only way an external agent sees one coherent tool surface over N browsers.
4. Codex-style local execution doesn't need WebMCP — which is precisely why Fabric isn't Codex.

---

## 3. Humans and agents together (the collaboration gate, structural not bolted-on)

**In Fabric, the human is a node.** A capability provider in the same graph as the GPU, contributing the three things no device has: physical reach, judgment, authority.

Three load-bearing mechanics, all on camera:

1. **The human gets scheduled.** The execution graph renders a stage assigned to YOU. Mid-pipeline the phone buzzes: *"Fabric needs: photograph the paper document — no digital copy exists."* You shoot it; the pipeline unblocks. ChatGPT's tool list visibly contains `request_from_human()` — **a person in the tool list, over an open standard.**
2. **Steering, not just consenting.** The hot-reload beat is *human-initiated*: revoke a capability mid-execution. Fabric replans live; the tool survives on reduced capabilities; the agent reports what it lost. Hot reload reframed from fault-tolerance into **user agency** — aimed directly at the Chrome judges.
3. **Authority stays human.** Anything irreversible (a file moving between devices, the final artifact export) requires a tap.

Devpost copy: *"Fabric treats people and devices the same way: everything in the runtime contributes what only it has. Your desktop has the GPU. Your phone has the camera. You have hands, judgment, and the right to say no — and the agent has to route through all of it."*

---

## 4. The demo scenario: **The Packet**

**Task given to ChatGPT:** *"Assemble my visa application packet. The checklist is on my laptop."*

Chosen because identity documents are the most sensitive files a person owns — people today literally upload passports to random visa agents' Google Drives. Maximal privacy stakes, universally dreaded chore, ends on a made artifact. (Generalizes to insurance claims, apartment applications, tax filings — mention once, demo once.)

**The nodes and what each visibly contributes:**

| Node | Joins as | Exposes (explicit consent card) | Does |
|---|---|---|---|
| Laptop | first node, hosts the session | `documents/` folder, checklist file | doc search, packet assembly |
| Desktop | second browser/machine | `archive/` folder (statements, old scans), WebGPU | OCR + embedding match — the muscle, counters blazing |
| Phone | QR scan on camera | camera + picked photos | **the human stage**: photographs the one physical-only document |
| You | implicit | judgment + authority | resolves "two passport scans — which is current?", approves final export |

**The loop as demoed:**

1. Nodes join → consent cards on camera → ChatGPT sees 3 core tools.
2. ChatGPT calls `compile_tool` → planning graph renders → `assemble_document_packet` **appears in ChatGPT's tool list**. ("That tool didn't exist four seconds ago.")
3. ChatGPT calls it → checklist auto-fills item by item, doc thumbnails stream in, per-node throughput counters, `0 B uploaded`.
4. Pipeline blocks on a physical-only document → **phone buzzes with a capture request** → you photograph the paper → pipeline flows.
5. **You revoke the desktop's archive access mid-run** (or close its lid) → `MUSCLE LOST → replanning → OCR falls back to laptop/WASM → HOT RELOAD COMPLETE` → same WebMCP tool, called again, completes — visibly slower. Honest.
6. Final approval tap → compiled packet (PDF) on screen. Artifact ending.

---

## 5. Architecture

```
            ChatGPT (external agent)          [stretch: Chrome/Gemini as 2nd agent]
                     │
                  WebMCP  (navigator.modelContext — register/unregister at runtime)
                     │
        ┌──────── Fabric Host page ────────┐
        │  Tool Registry (core + compiled)   │
        │  Compile / Planner (LLM → pipeline │
        │    JSON over typed primitives —  │
        │    NO arbitrary codegen)         │
        │  Executor + Hot-Reload Manager   │
        │  Capability Graph                │
        └───────────────┬──────────────────┘
                        │  WebRTC data channels (signaling: Cloudflare Workers/DO or PartyKit)
        ┌───────────┬───┴────────┬─────────────┐
     Laptop node  Desktop node  Phone node   Human
     (files)      (files+GPU)   (camera)     (via request cards on any node)
```

**Typed primitives (the entire capability vocabulary — small on purpose):**

- `data.list(scope)` / `data.read(ref)` / `data.query(scope, filter)`
- `compute.embed(refs)` / `compute.ocr(refs)` / `compute.match(a, b)` — transformers.js + Tesseract.js; WebGPU backend with WASM fallback (the fallback IS the hot-reload story — architecturally honest)
- `sensor.capture(kind)` — getUserMedia, user-triggered
- `human.request(kind, payload)` — capture / decide / approve
- `artifact.compile(parts)` — pdf-lib on the host

**compile_tool contract:** input = goal + constraints → LLM planner (server-side API call, small model, few-second budget) emits a pipeline JSON referencing only primitives available in the current capability graph → validated → registered via WebMCP with schema. Rejected plans surface as honest errors. Hot reload = re-run the planner against the updated graph, same tool name + schema, version bump visible in UI.

**Honesty constraints (Chrome engineers are judging — one overclaim torches everything):**

- Browsers cannot enumerate photo libraries or read arbitrary sessions. Copy always says **"shared/selected"**, never "has". Directory grants via `showDirectoryPicker` (real Chrome permission prompt ON CAMERA — deliberately).
- Every capability shown is a real browser API: file/directory picker, getUserMedia, WebRTC, WebGPU/WASM.
- Standing line: **"Nodes contribute only what the user explicitly exposes."**
- No fake terminal noise. Every flashy UI event corresponds to a real system event.

---

## 6. UI direction

Live-runtime feel, not SaaS dashboard. (Precedent: Work From Coffee OS won Vercel's own hackathon on craft; Observee won the YC MCP hackathon on making tool calls visible. The observability surface is the proof layer — the product is the task completing.)

- **Left:** nodes + consent state. **Center:** live execution topology — stages light up on the node running them, including the human stage. **Right:** the live WebMCP surface — CORE tools / COMPILED tools with version badges (`v2 · hot-reloaded`).
- Permanent metrics strip: `nodes · compiled tools · hot reloads · raw data uploaded: 0 B`.
- Polish bar is high; jank is punished harder than narrowness by this panel. Every state transition tight. `tabular-nums` on all counters.

---

## 7. Judge-alone path (non-negotiable property, flexible implementation)

A judge alone on one laptop during Sep 4–21 must experience the full loop in under 3 minutes:

1. **Tabs are nodes** — real nodes, zero extra architecture. Landing page says: "Open these two links in new tabs/windows — each becomes a device."
2. **Hosted always-on node** — a headless browser joined to the demo room (real node, not simulated), pre-loaded with sample documents, so the fabric is never empty.
3. **Phone join via QR** works for judges who bother — but is never required.
4. Sample dataset baked in (fake-but-realistic visa docs) so compile → execute → revoke → hot reload works with zero setup.
5. No separate "simulated node" code path — second code paths that exist only to fake the demo read as mocked.

---

## 8. Day-1 spikes (before ANY other code)

1. **THE load-bearing wall:** a 20-line page registering a WebMCP tool on button-click while ChatGPT is connected. Does ChatGPT see mid-session registrations? Test in ChatGPT's browser AND Chrome-with-WebMCP. If tool-list changes aren't picked up live → fallbacks, in order: (a) a core tool response that instructs/triggers list refresh, (b) prompt nudge ("check your tools"), (c) restructure the demo so compiling happens between agent turns. Everything else in this document depends on the answer.
2. **Phone reality check:** Android Chrome + iOS Safari — WebRTC data channels, `<input type=file multiple>`, getUserMedia, QR-join flow.
3. **Stretch (timeboxed to 2h):** Chrome's built-in agent driving the same fabric page → the cross-vendor beat ("ChatGPT and Gemini cooperated through an open standard"). If flaky, cut without mourning; note it in README as roadmap.

---

## 9. Scope: MVP and cut list

**MVP (all of this, nothing more):**
- 3 nodes (any mix of machines/tabs) + hosted node
- 4 core WebMCP tools: `inspect_fabric`, `compile_tool`, `revoke_tool`, `request_from_human`
- One compiled cross-device tool (the Packet pipeline), real planner, real local compute
- One human-dispatch beat, one revocation, one hot reload
- Live-runtime UI + metrics
- Judge-alone path + sample data

**CUT (decided — do not creep):** JIT/trace compilation · session/auth capabilities · deploy permissions · capability SDK · OPFS · 7-package monorepo · arbitrary codegen · Wasm DSL compiler (the honest one-liner survives: compiled plans execute in workers over typed primitives, not eval'd code) · multi-human rooms · TV nodes · Kubernetes-anything.

---

## 10. Eight-day plan (Aug 26 → Sep 3)

| Day | Deliverable |
|---|---|
| **1 (Aug 26)** | Spikes 1–3. GO/NO-GO on dynamic registration. Repo scaffold, hosting (Cloudflare or Vercel — both are sponsor-judges), signaling worker |
| **2** | Node join: WebRTC mesh, capability advertisement, consent cards, QR flow, tabs-as-nodes |
| **3** | Primitives on nodes: directory/file grants, embed/OCR workers (WebGPU + WASM), `human.request` cards |
| **4** | Compile: planner → pipeline JSON → validation → WebMCP registration. First end-to-end compiled call |
| **5** | Hot reload: revocation + node-loss → replan → re-register. Full loop works. **Feature freeze.** |
| **6** | UI polish day: topology animation, counters, tool-surface panel, packet result view. Hosted node + sample data + judge path |
| **7** | Video: storyboard, record real footage (all takes), edit. README + annotated transcript |
| **8 (Sep 2–3)** | Devpost write-up, license, repo cleanup, live-URL smoke tests from a clean machine, **submit ≥12h early** |

Rule: anything not in the video or the judge-alone path doesn't get built.

---

## 11. Video script (~2:50, real footage only, self-recorded voiceover)

Calibration test for every shot: *a Chrome engineer thinks "that's technically outrageous"; their non-technical partner glancing over thinks "oh, it's doing their visa paperwork without uploading their passport."*

- **0:00–0:20 — Cold open on the trick.** ChatGPT on screen, tool list: 3 tools. Cut: three devices on a real desk, nodes joining. Cut back: `compile_tool` runs — a 4th tool appears in ChatGPT's list. VO: "That tool didn't exist four seconds ago. ChatGPT just built it — out of my three computers."
- **0:20–0:35 — The constraint, stated like an engineer.** "A visa application needs my passport, bank statements, and photos — scattered across three devices. Every service that could help wants me to upload all of it. No."
- **0:35–1:00 — Assembly.** Consent cards on camera (real Chrome permission prompts). Node cards: `LAPTOP · documents · 3,182 files` / `DESKTOP · archive + WebGPU` / phone QR-scans in live. VO: "Codex proved agents should work on your machine. Fabric asks why they stop at one."
- **1:00–1:25 — Compile.** The ask. Planning graph renders. `+ assemble_document_packet — REGISTERED`. ChatGPT immediately calls it.
- **1:25–1:50 — Execution.** Topology lights up per stage, checklist auto-fills, thumbnails stream, `0 B uploaded` counter huge. Then: pipeline blocks → **phone buzzes** → "Fabric needs: photograph the paper certificate" → shoot it on camera → pipeline flows. VO: "I'm not watching it work. I'm in the runtime — it schedules me like it schedules the GPU."
- **1:50–2:20 — The twist.** Revoke the desktop's archive access mid-run (tap, on camera). `MUSCLE LOST → replanning → OCR → laptop/WASM → HOT RELOAD v2`. Same tool called again — works, visibly slower. VO: "Same tool. New machine underneath. The agent never lost its footing — and I never lost control."
- **2:20–2:40 — The artifact.** Approval tap. Compiled packet on screen, scrolled. Metrics strip: `3 devices · 1 compiled tool · 1 hot reload · 0 B uploaded`.
- **2:40–2:50 — Close.** "WebMCP lets a site declare its tools ahead of time. Fabric lets the agent compile them while it works — from the devices you already own. The open web is already installed everywhere. Fabric makes it the place agents work."

---

## 12. Submission package (per official rules)

- **Live URL** — works in ChatGPT's browser and Chrome-with-WebMCP; hosted on a sponsor platform
- **Video** — ≤3 min, public YouTube, clear audio, real demo, no third-party trademarks/music
- **Public repo** — open-source license visible in header; built after Aug 25 (commit history is the timestamped evidence)
- **Text description** — with headings that literally mirror the rubric (stage one may be AI-assisted; make alignment impossible to miss):
  - *Why WebMCP fits this use case*
  - *What people and agents can do together that they couldn't before*
  - *How we implemented WebMCP* — *file paths + line refs* to registration, schemas, dynamic re-registration
- **README extras:** `webmcp/` directory impossible to miss · **annotated session transcript** of the full loop (compile → register → call → human dispatch → revoke → hot reload → call again) — the artifact that lets a text-only evaluator verify the central claim · concrete numbers, zero unfalsifiable poetry · screenshots

---

## 13. Judging map

| Criterion (equal weight) | Evidence on screen |
|---|---|
| **WebMCP Leverage** | Tool surface born, mutated, hot-swapped mid-session inside ChatGPT; tiny core surface; compiled tools with schemas; humans in the tool list; registration code greppable in 10 seconds |
| **Execution** | Complete product arc: chore → assembled packet. Judge-alone path works cold. Polish everywhere. Not a PoC — a task actually finishes |
| **Potential Impact** | Specific, credible, demonstrated: sensitive-document chores without uploading identity docs; generalizes via compile. `0 B` is proof, not promise |
| **Creativity & Ambition** | Tools that don't pre-exist; execution topology that doesn't stay fixed; a semantic tool surviving physical change; a person as a scheduled capability. Nobody else will have any of these |

**Panel notes:** Nahas → the syscall/membrane reveal + real dynamic registration. Chrome (Drasner) → consent surfaces used honestly + revocation-as-steering. OpenAI (Rushing) → ChatGPT-first demo, compile moment. Cloudflare/Vercel/Netlify → hosted on them, open-web thesis. Shopify (Grigorik) → performance honesty (WASM fallback shown slower, not hidden).

---

## 14. Gates — final pass

| Gate | Verdict |
|---|---|
| WebMCP indispensable | ✅ the mutable surface IS the product (§2) |
| Not possible as CLI/Codex | ✅ cross-device composition, zero install (§1) |
| Human-agent two-notch | ✅ human as scheduled node + steering + authority (§3) |
| Useful | ✅ sensitive-document chores, real dread, real privacy stakes |
| Flashy | ✅ tool born on camera · phone buzzing as a pipeline stage · live revocation survived · artifact ending |
| Solo-demoable | ✅ own devices, no party, no actors |
| Judge-alone | ✅ tabs + hosted node + sample data (§7) |
| Honest | ✅ every capability a real browser API; "shared", never "has" (§5) |
| 15-second trailer | ✅ tool list 3→4 while ChatGPT works is legible with zero explanation |
| 8-day buildable | ✅ with §9's cut list enforced and Day-1 GO |

## 15. Risks & fallbacks

| Risk | Fallback |
|---|---|
| ChatGPT doesn't see mid-session registrations | Spike 1 fallbacks (§8); worst case: compile between turns — loop survives, money shot softens |
| WebRTC flaky across networks | Relay through signaling worker; tabs-as-nodes always works |
| WebGPU unavailable/slow | WASM everywhere; keep honest labels; slower-but-works is on-message |
| Planner emits bad pipelines | Tight validation + honest error surfaced to agent; retry once; demo path uses a well-tested goal |
| Cross-vendor (Gemini) flaky | Cut; one line in README roadmap |
| Time | Feature freeze Day 5 is contractual. Video > features. Submit ≥12h early |

---

*Kill criterion for any new idea during the build: if it isn't in the video or the judge-alone path, it doesn't exist.*
