# Fabric — Demo Voiceover Script (continuous live demo, target 2:50)

Style: one continuous live demo, self-narrated. Lines below are timed subtitle beats —
small lower-third subs, white text on a semi-transparent black box, YouTube style.
`docs/video/vo_script.srt` is the matching subtitle file.

**Opening is multi-device**: frame the desk so BOTH screens and the phone are visible
(or picture-in-picture: host screen full + desk cam corner). Devices join ON camera
in the first seconds — never a single lonely browser.

## Segment 1 — Cold open: the machine assembles (0:00)

- **0:00** — This is Fabric, running right now. My laptop, a second browser, and my phone — becoming one machine for ChatGPT.
- **0:08** — Every device shares only what I choose. Watch the phone join... and there it is.
- **0:15** — I'm Divyansh Agrawal, and this is my entry for the WebMCP Challenge.

## Segment 2 — The problem, then the trick (0:21)

- **0:21** — My files, my photos, my compute — scattered across these devices. No agent can touch any of it without me uploading my life to someone's cloud.
- **0:31** — ChatGPT sees exactly four WebMCP tools here. Fabric's trick? It compiles its own.
- **0:38** — I ask for a tool that doesn't exist: find photos across my devices by description.
- **0:45** — A planner maps my devices' shared capabilities into a typed pipeline. No generated code. Ever.
- **0:53** — And there it is. That tool did not exist ten seconds ago — registered through WebMCP, mid-conversation.

## Segment 3 — Execution where the data lives (1:02)

- **1:02** — "Find the dog." Watch the stages — the embeddings are computed on the phone itself.
- **1:10** — My photos never leave the phone. Only vectors cross, device to device.
- **1:17** — Look at the counter. Zero bytes of my files to any cloud. That's the entire privacy model.
- **1:24** — And there's the dog. Ranked first.

## Segment 4 — The human is a node (1:30)

- **1:30** — Now something harder: assemble my documents into a PDF packet. One certificate only exists on paper.
- **1:38** — So the pipeline schedules *me*. My phone buzzes — I'm a stage in the execution graph.
- **1:45** — I photograph the page... and execution continues.
- **1:52** — The export waits for a human tap. My judgment is routed exactly like my GPU.
- **1:58** — Approved. There's the packet — compiled on my own machine.

## Segment 5 — Kill a device, keep the tool (2:05)

- **2:05** — Now the part that makes this a runtime, not a demo. I'm going to kill a device mid-session.
- **2:12** — Node lost. Fabric replans the tool onto the devices that remain — and re-registers the same name through WebMCP.
- **2:22** — ChatGPT calls it again. Same tool. Version two. New machine underneath. Still works.

## Segment 6 — Close (2:31)

- **2:31** — Everything you just saw is live at the link below. One laptop and two tabs is enough — Fabric generates sample files for you.
- **2:40** — WebMCP lets a website declare its tools ahead of time. Fabric lets the agent compile them while it works — out of the devices you already own.

*(ends ~2:48)*

---

## Production notes

**Continuous-demo recording**: it should FEEL like one take. Record in 3 blocks with natural cut points (after Segment 2's registration; after Segment 4's packet), same session, same room state — never splice different runs of the same action. Cut the 10–20s planner wait to ~2s of visible "compiling"; a jump cut is honest, a faked timer is not.

**Framing**: primary capture = host screen (OBS 1080p+, UI ~125% zoom). Desk cam (phone on a stack of books) for: phone QR-scan (Seg 1), photographing the paper (Seg 4), closing the tab/lid (Seg 5). PiP the desk cam bottom-right when both matter at once.

**Subs**: lower third, small (~40px at 1080p), white on rgba(0,0,0,0.65) box, one beat per card, max 2 lines. Burn them in (judges may watch muted) AND upload the .srt to YouTube.

**Audio**: your own voice, room-quiet, phone notifications off everywhere. Read each beat as its moment happens — the timestamps above assume ~150 wpm with breathing room.

**Pre-flight** (all BEFORE recording): 4 hot-reload tests passed twice · models pre-warmed on every device · fresh ChatGPT session + fresh room · wake lock confirmed on phone · the paper certificate printed and on the desk · dog photo among the shared files.

**Upload**: public YouTube, no music, title "Fabric — ChatGPT compiles its own tools from your devices (WebMCP)", description line 1 = live URL + repo. Thumbnail: host page with 3 node cards + COMPILED v2 badge + the 0 B counter.
