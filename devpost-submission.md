# Fabric: A Dynamic WebMCP Runtime Across Your Devices

> Fabric turns your devices into one living runtime where agents build, run, and hot-swap WebMCP tools from the files, cameras, compute, and people available right now.

[Try Fabric Live](https://fabric.keshav-agr2007.workers.dev) · [Explore the Source (MIT)](https://github.com/divagr18/fabric) · [Watch the Demo (<3 min)](https://youtu.be/Gzw9uTK5uZ4)

---

### Inspiration: One Runtime for People, Agents, and Devices

Agents can reason across a task, but the capabilities they need are scattered across the devices and people around us. Photos sit on a phone, documents live on a laptop, compute may be available on a desktop, and some steps require a person to capture something, decide, or approve an action.

Picture asking an agent to assemble a document packet. The source files are on your laptop. A missing paper form is sitting beside someone with a phone. OCR and image processing can run in a browser, but the final result still needs a person to approve it. The agent understands the goal, yet everything it needs is scattered across devices, browsers, and people.

Bringing those pieces together usually means uploading private data to one cloud service or installing a specialized agent runtime on every device. Fabric explores a different model for the open web: browsers, people, and agents contribute explicit capabilities to one shared runtime.

Fabric began with a question: what if those pieces could meet inside one living runtime?

A phone joins with a QR code and contributes its camera. A laptop contributes files. A desktop contributes compute. A person contributes judgment. An agent can see what is available right now, combine those capabilities into a WebMCP tool, and use it in the same conversation. If a device leaves, Fabric builds a new version of the tool around what remains.

Fabric reimagines WebMCP as a dynamic compilation target. An agent can inspect the capabilities available now and compile them into a task-specific WebMCP tool. Human judgment and physical-world input are not interruptions outside the workflow; they are first-class capabilities in the same live graph as files, cameras, and compute.

That is the interaction model Fabric explores: people are not reduced to prompt writers, and agents are not trapped inside one device. People, agents, and browsers collaborate through tools that form around the task and change with the room.

---

### What It Does

Fabric connects browsers into an ad hoc, peer-to-peer runtime.

The quickest way to understand Fabric is to watch a tool come alive.

Open Fabric on a laptop, then scan the room code with a phone. The phone offers sample photos and on-device image processing. Ask the agent, *“Find my dog across my devices.”* Fabric inspects the live room, creates a photo-search tool that did not exist a moment ago, and registers it through WebMCP. The agent calls that new tool immediately. The phone creates the image embeddings locally, sends vectors for ranking, and transfers only the selected preview directly to the host.

1. **Join from a browser:** Scan a QR code or open a link to attach a phone, laptop, or desktop to the room. Each device contributes only the capabilities its user chooses to share, such as `data.list`, `data.read`, `compute.embed`, `compute.ocr`, `human.request`, and `human.notify`.
2. **Compile WebMCP tools at runtime:** When an agent receives a goal such as *“Find my dog across my devices,”* Fabric plans a validated DAG over the current capability graph and registers it through `document.modelContext.registerTool()`. The new tool did not exist when the session began, but the agent can call it immediately.
3. **Keep computation close to the data:** In the photo-search workflow, the phone computes CLIP embeddings locally and sends vectors peer-to-peer for ranking. After Fabric selects a result, only that preview travels peer-to-peer to the host. The photos and preview never pass through a central server.
4. **Put humans inside the workflow:** A document pipeline can pause, ask someone to photograph a paper form, resume with that capture, run OCR, and require explicit approval before producing the final PDF.
5. **Adapt when devices change:** If a device leaves, Fabric detects the graph change, cancels the old registration, replans over the remaining devices, and registers version two under the same tool name and input schema. The agent keeps calling the same interface.

Now remove the device that was doing part of the work. Fabric notices, retires the old pipeline, replans around the remaining capabilities, and registers version two with the same tool name and input schema. The agent keeps using the same interface while the runtime changes underneath it.

The document workflow takes the idea further. An agent can pause mid-task, ask a person to photograph a paper form, resume when the capture arrives, run OCR, assemble the packet, and wait for human approval before producing the PDF. Human input is not an awkward handoff outside the agent loop. It is part of the tool itself.

---

### Why Fabric Is a Strong Fit for WebMCP

Most WebMCP applications expose a fixed set of developer-defined tools. Fabric exposes a tool compiler. Its philosophy is simple: tools should be dynamic and plug-and-play. Devices and people should be able to join, contribute a capability, and immediately become part of a tool an agent creates for the task at hand. Capabilities can come and go; the tool’s interface remains stable while Fabric adapts the implementation underneath it.

* **Dynamic registration and cancellation:** Fabric uses `document.modelContext.registerTool` with `AbortController` cancellation to add task-specific tools, retire old pipelines, and hot-swap new implementations during a conversation.
* **A stable interface during failover:** Fabric freezes the tool name and input schema while replanning. The execution graph may change, but the agent does not need to learn a new tool.
* **The browser as the permission boundary:** Fabric reaches files, cameras, and hardware only through capabilities the user explicitly shares. It does not give the agent unrestricted operating-system access.

---

### Cloudflare Architecture

Fabric uses a Cloudflare Worker as its application and backend entry point, with one Durable Object coordinating each room. Together they handle device membership, signaling, persistent tool definitions, relay fallback, and model delivery.

* **Room coordination and persistence:** Each Durable Object provides a stable address and ordered event stream for its room. It stores compiled tool definitions so they can return after a host reload and heal as suitable devices reconnect.
* **Low idle compute:** WebSocket Hibernation evicts idle compute while keeping WebSocket connections alive. An idle room therefore costs almost nothing in compute to keep available and can remain parked at the edge until its user returns.
* **Application services:** The Worker serves the app, accepts WebSocket upgrades, exposes the planner endpoint, and provides the same-origin model proxy.
* **Client-side AI inference:**
  * **Desktop:** Transformers.js running CLIP ViT-B/32 via **WebGPU (fp16)** for hardware-accelerated vectorization.
  * **Mobile:** A quantized **WASM (q8)** model avoids the memory cost of the desktop model.
  * **OCR:** In-browser Tesseract.js Web Workers.
* **Transport fallback:** WebRTC DataChannels carry binary data and vectors directly between browsers. If a direct connection cannot open, the Durable Object relays the traffic.

---

### How WebMCP Is Implemented

All protocol code is cleanly encapsulated in [`app/src/webmcp/`](https://github.com/divagr18/fabric/tree/main/app/src/webmcp). Every core tool and every runtime-compiled tool uses the standard `document.modelContext.registerTool(...)` path in [`registry.ts`](https://github.com/divagr18/fabric/blob/main/app/src/webmcp/registry.ts). Fabric gives each registration an `AbortController`; aborting the previous registration and registering its replacement enables hot-swapping without changing the interface the agent calls.

* **`registry.ts`:** Wraps `document.modelContext.registerTool`, tracks registrations with `AbortController`, and manages hot reloads.
* **`surface.ts`:** Installs the core WebMCP meta-tool surface:
  * `inspect_fabric`: Reports connected devices and their shared capabilities.
  * `compile_tool`: Creates and validates a pipeline from the user’s goal.
  * `inspect_tool`: Returns the compiled DAG, dependencies, and node assignments.
  * `revoke_tool`: Removes a compiled tool from the WebMCP surface.
  * `request_from_human`: Sends an interactive request to a person on a connected device.
* **Validated pipelines, not generated code:** The planner produces a declarative DAG over a fixed vocabulary: `data.list`, `data.read`, `compute.embed`, `compute.embed_text`, `compute.ocr`, `human.request`, `human.notify`, `host.match`, `host.pick`, and `host.compile_pdf`. Fabric validates every method, stage, dependency, data reference, and node assignment before registration.

---

### Engineering Challenges Overcome

1. **Mobile model memory:** The fp32 CLIP model was too large for mobile devices. Fabric uses quantized WASM (q8) on mobile and reserves WebGPU (fp16) for desktops.
2. **Model delivery:** Browser-side model loading failed when an upstream CDN stopped returning the required CORS headers. Fabric now serves model files through a same-origin, edge-cached streaming proxy.
3. **Stale capability IDs:** Grants can change between compilation and execution. Fabric resolves stages against current grants at invocation time instead of trusting stale identifiers.
4. **Mobile sleep and disconnects:** Mobile power management can interrupt peer connections. A screen wake lock, faster heartbeats, and relay fallback help the runtime detect losses and recover.

---

### Accomplishments

* **Dynamic WebMCP tool creation:** Built a working prototype where an agent creates, registers, and executes a typed browser tool that did not exist at session start.
* **Local-first photo search:** The phone computes embeddings locally and sends vectors for ranking. Only the selected preview moves peer-to-peer to the host; it never passes through a central server.
* **Humans as first-class capabilities:** One pipeline combines OCR, a physical camera capture, document assembly, and a human approval gate.
* **Automatic topology healing:** Removing a device triggers replanning and registration of version two under the same name and input schema, without interrupting the agent’s interface.
* **Cloudflare-backed persistence:** Compiled definitions persist in Durable Object storage. They return in a degraded state after a host reload and heal when suitable devices reconnect.
* **A runtime that can wait:** WebSocket Hibernation lets a personal fabric remain parked at the edge with almost no idle compute cost. It can stay quiet until a person or agent needs it again.

---

### What's Next

* **Cross-vendor WebMCP orchestration:** Enable multiple independent WebMCP-capable agents to interface with the same fabric.
* **Suggested tool compilation:** Learn from repeated capability sequences and suggest useful tools that the user can choose to compile.
* **Remembered grant policies:** Let returning devices restore previously approved capabilities with clear, one-tap consent.

---

### Testing Instructions

You can test Fabric across two browser windows or using your phone and laptop:

1. Open the [Live App](https://fabric.keshav-agr2007.workers.dev) in **ChatGPT's in-app browser** (or Chrome 149+ with the WebMCP flag enabled).
2. Scan the room QR code with your phone or open the join link in a second tab.
3. Click **“Use Sample Files”** on the mobile node to populate test photos and documents.
4. In ChatGPT, prompt:
   > *“Inspect the connected fabric and create a tool to search my photos by description.”*
5. After Fabric compiles and registers the tool into WebMCP, ask:
   > *“Find the photo of the dog.”*
6. Observe the execution: The phone embeds the photos locally via WASM and sends vectors over WebRTC for ranking. After Fabric selects the result, its preview moves peer-to-peer to the host and never passes through a central server.
7. For the document workflow, ask ChatGPT to compile the PDF packet. Follow the capture prompt on the mobile node, photograph a paper form, and approve the host export.

---

### Additional Devpost Answers

**Which agent(s) or client(s) did you test your WebMCP tools with?**

ChatGPT’s in-app browser and Google Chrome with WebMCP enabled.

**Which AI tools have you leveraged while working on this project?**

OpenAI Codex and ChatGPT were used to help implement, debug, test, and document Fabric. The architecture, product direction, and final implementation decisions were made by the team.
