# Fabric — Demo Video Script (target 2:45, hard cap 2:55)

Rules honored: public YouTube · audio narration (own voice; slightly imperfect beats polished) · project working **within the first 15 seconds** · covers what it is + how WebMCP is used · no music, no third-party marks.

## Pre-flight (do ALL before recording anything)
- [ ] All 4 deferred hot-reload tests pass twice (no first-takes of unrehearsed paths)
- [ ] Models pre-warmed on laptop node + phone (share files once, wait for "ready")
- [ ] Sample/demo files staged; phone plugged in, wake lock confirmed, notifications OFF on all screens
- [ ] ChatGPT session fresh; host page fresh room; OBS at 1080p+, UI zoomed to ~125% so text reads on YouTube compression
- [ ] Phone camera / second phone on a stack of books for the two physical shots (QR scan; photographing the paper doc; closing the tab)
- [ ] Record each SHOT separately, many takes; narrate afterwards over the edit

---

## SHOT A — Cold open: the fifth tool (0:00–0:18)
**Screen:** ChatGPT with the Fabric host page connected. Surface panel visible: CORE — 4 tools.
**Action:** type *"Compile a tool that finds photos across my devices matching a description."* → log flashes `⚡ + find_matching_photos REGISTERED via WebMCP` → the tool appears in ChatGPT's tool list.

> **VO:** "This is ChatGPT, connected to a web page called Fabric. Fabric gives it exactly four tools. Watch the fifth one get made. ... Ten seconds ago, this tool did not exist. Fabric planned it across my devices and registered it through WebMCP — mid-conversation."

## SHOT B — What Fabric is (0:18–0:45)
**Screen/desk:** quick cuts — laptop node tab clicking **Share a folder** (real Chrome permission prompt in frame); phone physically scanning the QR (desk cam); phone tapping **Share photos**; node cards appearing on host with capability chips.

> **VO:** "Rewind. Fabric turns the browsers I already own into one runtime an agent can use. My laptop shares a folder. My phone scans a QR and shares a few photos — real consent prompts; nothing else is reachable. Each device brings its own compute: CLIP embeddings on the phone's chip, OCR on the laptop. Codex proved agents should work on your machine. Fabric asks why they stop at one."

## SHOT C — Execution + the privacy counter (0:45–1:15)
**Screen:** ask *"Use it to find the dog."* Execution panel stages light up (running → done); brief zoom on metrics strip: `raw file bytes to any cloud: 0 B`; ChatGPT prints ranked matches, dog first.

> **VO:** "When ChatGPT calls it, every stage runs where the data lives. The photos are embedded on the phone — they never leave it. Only vectors cross the network, device to device. That counter is the entire privacy story: zero bytes of my files to any cloud. And the dog photo comes back ranked first."

## SHOT D — The human is a node (1:15–1:50)
**Screen + desk:** ask *"Compile a tool that assembles my documents into a PDF packet — you'll also need a photo of the paper certificate."* → run it → **phone buzzes with the full-screen request** (desk cam: pick up phone, photograph the physical paper) → pipeline continues → **Approval card** appears on host → tap ✓ Approve → PDF downloads.

> **VO:** "People are part of the runtime too. This pipeline needs a paper document that only exists physically — so it schedules *me*. My phone buzzes; I photograph the page; execution continues. And the final export waits for a human tap. The agent routes through my judgment the same way it routes through my GPU."

## SHOT E — Hot reload, the second trick (1:50–2:25)
**Screen + desk:** reach over and **close the laptop node tab on camera**. Log: `NODE LOST → "…" stale → replanning… → 🔥 HOT-SWAPPED → v2`; Surface panel badge flips to v2. Ask ChatGPT to call the same tool again → completes on the phone alone.

> **VO:** "Now the part I care about most. I kill a device. The machine under that tool just changed — so Fabric replans it onto what's left and re-registers the *same name* through WebMCP. Same tool, version two, new machine underneath. ChatGPT calls it again — still works. Revoking a capability does the same thing: I steer the machine while the agent keeps working."

## SHOT F — Close (2:25–2:50)
**Screen:** slow pan: Surface panel (CORE + COMPILED v2) → metrics strip → the "Try it" panel.

> **VO:** "Every modelContext call is one folder in the repo. Compiled tools are typed pipelines over consented capabilities — never generated code. Everything you just saw is on the live URL: one reviewer, one laptop, two tabs — sample files included. WebMCP lets a site declare its tools ahead of time. Fabric lets the agent compile them while it works — out of the devices you already own."

*(~345 words ≈ 2:20 of speech at normal pace — leaves 25–30s of breathing room in a 2:50 cut.)*

---

## Edit notes
- Show, don't caption: the only text overlays allowed are the ones the product itself renders (log lines, badges). Zero motion graphics.
- Planner takes 10–20s — **cut the wait**, keep ~2s of "compiling…" for rhythm; a mid-shot cut is honest, a sped-up timer is not.
- If a take flakes, re-run the whole shot; never splice two different runs into one apparent run.
- Thumbnail: host page with 3 node cards + COMPILED v2 badge + `0 B` counter visible.
- Upload: public, title like "Fabric — ChatGPT compiles its own tools from your devices (WebMCP)", first description line = live URL + repo.
