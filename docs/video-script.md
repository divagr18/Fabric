# Fabric — Demo Voiceover Script v3 (continuous live demo, ~2:45)

Delivery: natural, conversational — showing a friend a side project. Pauses and "uhs" welcome; the timings below leave room for them. Subs: small lower-third, white on 65%-black box, burned in + `docs/video/vo_script.srt` uploaded to YouTube.

## Segment 1 — Cold open: the machine assembles (0:00)
[Wide desk shot: laptop + second browser + phone, all joining on camera]

- **0:00** — So right now, this is Fabric running live. That's my laptop, a second browser, and my phone — all linking up into one machine for ChatGPT.
- **0:09** — Normal WebMCP lets a site expose fixed tools. Fabric lets ChatGPT compile its own — out of whatever devices are on your desk.
- **0:17** — I'm Divyansh Agrawal, and this is my entry for the WebMCP Challenge.

## Segment 2 — The problem, then the trick (0:22)
[Zoom: ChatGPT tool list — 4 core tools]

- **0:22** — Right now, ChatGPT sees just four core tools from this Fabric page.
- **0:27** — So let's give it something trickier: find photos of my dog across my devices, by description.
- **0:34** — That tool doesn't exist. Fabric's planner looks at what my devices have shared and builds a typed pipeline — photos on the phone, a local CLIP model to match them. No code generation. No cloud.
- **0:47** — And... there it is. That tool did not exist ten seconds ago — registered into ChatGPT through WebMCP, mid-conversation.

## Segment 3 — Execution where the data lives (0:57)
[Execution panel stages; PiP phone mirror]

- **0:57** — ChatGPT calls it: find the dog.
- **1:01** — Watch the stages — the embeddings are computed right on the phone itself.
- **1:08** — My photos never leave it. Just 512-dimensional vectors moving device to device.
- **1:15** — And check the counter: zero bytes of my files to any cloud. That's the whole privacy model.
- **1:22** — Aaand there's the dog. Ranked first.

## Segment 4 — The human is a node (1:28)
[Packet request; phone buzzes; desk cam for the paper]

- **1:28** — Okay, something harder: assemble my documents into a PDF packet. The catch — one form only exists on paper.
- **1:36** — So Fabric schedules *me*. My phone buzzes — I'm literally a stage in the execution graph.
- **1:43** — I snap the paper on my desk... and the pipeline picks up right where it left off.
- **1:50** — One final sign-off — I tap Approve. My judgment, routed like a GPU task.
- **1:56** — And there's the packet, compiled locally on my machine.

## Segment 5 — Kill a device, keep the tool (2:02)
[Close the node tab on camera; panel flips to v2]

- **2:02** — Now the part that proves this is a runtime, not a canned demo. I'm killing a node mid-session.
- **2:10** — Node lost. Fabric sees the topology change, replans onto the devices that remain — and re-registers the exact same tool.
- **2:20** — ChatGPT calls it again. Same tool, version two, new hardware underneath. Still works.

## Segment 6 — Close (2:28)
[Full screen: live URL + repo + surface panel]

- **2:28** — Everything you saw is live at the link below — two tabs is enough, and Fabric generates sample files for you.
- **2:36** — WebMCP gives websites a way to hand agents tools. Fabric hands them the machine to run on — yours.
- **2:43** — Thanks for watching.

---

## Filming the easy way

1. **Video first, voice second.** Record the demo footage silent, cut it to the timestamps, then read the VO over the finished picture (exactly your Diligence Room workflow — "burned lines, read straight off it"). Live-narrating while driving three devices is the hard way; don't.
2. **scrcpy the phone.** USB-mirror the Android screen into a desktop window → crisp phone UI inside OBS, no desk-cam focus hunting. Desk cam only for the two physical beats: the QR scan and photographing the paper.
3. **OBS scenes + hotkeys**: Scene A = host fullscreen · Scene B = host + phone mirror PiP · Scene C = desk cam. Switching live while recording gives you cuts for free.
4. **Record each segment 2–3× back-to-back** in one session (same room state), pick best takes. Never splice two different runs of one action.
5. **Cut the planner wait** to ~2s of "compiling…" — jump cut, not sped-up footage.
6. Subs: DaVinci/CapCut auto-caption from the SRT, style once (small, lower third, 65% black box), export burned-in.

## Pre-flight (all BEFORE recording)
4 hot-reload tests passed twice · packet path run at least once live · models warm on every device · dog photo + printed paper form staged · notifications off everywhere · fresh ChatGPT session + fresh room.
