<p align="center">
  <a href="https://fabric.keshav-agr2007.workers.dev">
    <img src="docs/fabric-readme-banner-v2.svg" alt="Fabric connects your devices so agents can build, run, and hot-swap WebMCP tools" width="100%">
  </a>
</p>

> Fabric connects your devices so agents can build, run, and hot-swap WebMCP tools from whatever files, cameras, compute, and people are available right now.

[Try Fabric Live](https://fabric.keshav-agr2007.workers.dev) · [Watch the Demo](https://youtu.be/Gzw9uTK5uZ4) · [MIT License](LICENSE)

Fabric follows a simple philosophy: tools should be dynamic and plug-and-play. Phones, laptops, desktops, and people can contribute files, cameras, compute, and judgment to one shared capability graph.

The agent inspects what is available, **compiles a WebMCP tool for the goal**, and runs it across the connected devices. It can search photos using a vision model on a phone, ask someone to capture a paper document, combine it with files from a laptop, and wait for explicit approval before exporting the result.

If a device leaves, Fabric preserves the room state, replans around the remaining capabilities, and **hot-swaps the execution graph** under the same tool name and input schema. The agent keeps using a stable interface while the implementation changes underneath it.

## The Device Capability Matrix

Every device in the mesh contributes its natural strengths, sandboxed by explicit browser grants:

| Node Type | Shared Capabilities | Client-Side Runtime | Status |
|---|---|---|---|
| **Smartphone** | Camera capture, user-selected photos, interactive prompts | Quantized WASM (q8 CLIP) | Live |
| **Desktop Workstation** | Image and text embeddings, similarity ranking | Hardware-accelerated WebGPU (fp16 CLIP) | Live |
| **Laptop** | Explicitly shared files, document packets, host coordination | Host execution engine and in-browser Tesseract OCR | Live |
| **Human (HITL)** | Physical document capture, real-world perception, approval gates | Interactive native prompts (`human.request`) | Live |

## Human-in-the-Loop (HITL) as a Native Primitive

Fabric treats humans as execution nodes inside the WebMCP DAG, so a tool can request physical-world input or approval without abandoning the workflow:

* **Interactive Real-World Capture:** The tool sends a `human.request` to a connected phone, where the user can photograph a physical paper form.
* **Local Document Processing:** User-selected digital documents can be processed with Tesseract.js in a browser worker before the extracted text returns to the host.
* **Explicit Approval Gates:** Final PDF export pauses at a verification modal. The tool finishes only after the user approves it.
* **One Continuous Workflow:** The human contributes capture and judgment inside the active tool call. The human is a node in the runtime, not a spectator.

## Two Demonstrated Workflows

### 1. Local-First Photo Search and Self-Healing Failover
1. **Goal & Inspection:** You ask ChatGPT to search photos across your devices. The agent calls `inspect_fabric` to inspect connected nodes and their explicitly shared capabilities.
2. **Tool Compilation:** Fabric compiles a brand-new tool, `search_shared_photos`, directly from the active capability graph. After validating the pipeline dependencies and device leases, Fabric exposes the compiled tool to the agent via `document.modelContext.registerTool()`.
3. **Local-First P2P Execution:** The phone runs a quantized CLIP vision model in WASM and computes embeddings locally. Vectors travel peer-to-peer for host-side ranking. After Fabric selects a result, only that preview moves peer-to-peer to the host. Source photos and the selected preview never pass through a central server.
4. **Self-Healing Failover (Hot-Swap):** When a device disconnects, Fabric detects the graph change, aborts the previous registration via `AbortController`, recompiles the tool around the surviving hardware, and registers it under the same tool name and schema.

### 2. Human-in-the-Loop Document Assembly
1. **Multi-Source Intent:** You ask the agent to assemble disparate records into a verified PDF packet, combining digital files on your laptop with a missing physical form on your desk.
2. **Tool Compilation:** Fabric compiles the `create_document_packet` tool from the live device graph, weaving together local file reads, remote optical capture on your phone, and explicit human sign-off into a single validated pipeline.
3. **Interactive Physical Capture:** When the compiled tool reaches the missing physical document, it pauses at a `human.request` stage. Your phone screen lights up with a live camera prompt. You photograph the paper form, and the capture is transferred directly into the assembly pipeline over a WebRTC DataChannel.
4. **Human Verification & Export:** Before producing the artifact, the compiled pipeline pauses at an interactive approval gate on your host screen. You review the packet contents, tap **Approve**, and Fabric compiles the final multi-page PDF locally.

## Why WebMCP

Most WebMCP applications expose a static list of developer-defined tools. Fabric uses WebMCP as a **dynamic compilation target**:

* **Tools Built at Runtime:** Tools are compiled on demand from the devices and people currently in the room.
* **Stable Interface during Failover:** Replacing an active pipeline using an `AbortController` allows hot-swapping implementations without changing the tool name or schema, preventing agent errors.
* **Browser as Permission Sandbox:** The agent never gets raw operating system access. It interacts exclusively with explicit browser grants (`data.read`, `compute.embed`, `human.request`).
* **Dynamic Discovery:** Agents discover newly compiled tools through the browser's `toolchange` lifecycle.

## How WebMCP Is Implemented

Every core and runtime-compiled tool passes through `app/src/webmcp/registry.ts`, which uses the standard registration call:

```javascript
document.modelContext.registerTool({
  name: pipeline.toolName,
  description: pipeline.description,
  inputSchema: pipeline.inputSchema,
  execute: async (input) => { /* run the validated cross-device pipeline */ },
}, { signal: controller.signal });
```

### Core WebMCP Meta-Tools

| Tool | Purpose |
|---|---|
| `inspect_fabric` | Lists connected devices and explicitly shared capabilities |
| `compile_tool` | Plans, validates, and registers a task-specific WebMCP tool |
| `inspect_tool` | Returns the execution DAG, stage dependencies, and node health |
| `revoke_tool` | Cancels an active registration via `AbortController` |
| `request_from_human` | Dispatches capture, decision, or approval requests to a person |

**Validated Execution Pipelines:** The planner outputs a structured pipeline rather than executable code. Fabric checks every stage, reference, dependency, schema, and device lease before calling `registerTool`.

## Cloudflare Edge Architecture

* **Durable Objects:** Each room is anchored by a Durable Object that manages room membership, WebRTC SDP signaling, and persistent tool definitions across host reloads.
* **WebSocket Hibernation:** Idle rooms can evict active compute while preserving client WebSockets, giving them almost no idle compute cost while they wait at the edge. Requests and storage still have normal platform costs.
* **Direct P2P with Relay Fallback:** WebRTC DataChannels carry vectors and images directly between browsers. When a direct connection cannot open, the Durable Object relays the traffic.
* **Edge-Cached Model Proxy:** The Worker proxies model files through the app origin, adds the CORS headers required by the browser client, and caches responses at the edge.

## Measured on Real Hardware

| Operation | Environment | Observed Result |
|---|---|---|
| CLIP Embed (small batch) | Warm WebGPU Desktop (fp16) | 1.6 - 2.1 seconds |
| OCR Extraction | In-browser Tesseract worker | 1.2 seconds |
| Planner Synthesis | Cloudflare Worker / OpenAI | 10 - 20 seconds |
| Topology Replan (Hot-swap) | Cloudflare Worker / OpenAI | ~6 seconds |
| First-time Model Delivery | Edge-cached model proxy | ~88 MB q8 or ~170 MB fp16, cached after first load |
| Node Loss Detection | Heartbeat roster monitor | < 5 seconds |

## Testing Instructions for Hackathon Judges

You can test Fabric across two physical devices (such as a laptop and phone) or simply between two browser tabs:

1. **Open the Live App:** Open [fabric.keshav-agr2007.workers.dev](https://fabric.keshav-agr2007.workers.dev) in ChatGPT's in-app browser or in Google Chrome 149+ with the experimental flag enabled via `chrome://flags/#enable-webmcp-testing`.
2. **Attach a Node:** Scan the room QR code with your phone (or open the join link in a second browser window).
3. **Load Test Data:** On the joined node, tap **"Use sample files"** to populate test receipts, documents, and photos.
4. **Test Dynamic Tool Compilation:** In ChatGPT or your WebMCP agent, prompt:
   > Inspect the connected fabric and compile a tool to search my photos by description.
5. **Test Local-First Execution:** Once the tool registers via WebMCP, prompt:
   > Find the photo of the dog.

   *Observe:* The phone embeds the photos locally via WASM and sends vectors over WebRTC. Only the selected preview then moves peer-to-peer to the host.
6. **Test Human-in-the-Loop (HITL) Workflow:** Prompt the agent:
   > Compile the document packet.

   *Observe:* The agent sends an interactive capture prompt to the phone, receives the photo peer-to-peer, and pauses at an approval gate on the host before generating the final PDF. User-selected digital documents can also be OCR'd in the browser.

## Where to Look in the Code

| Component | File Path |
|---|---|
| WebMCP registration, revoke, and hot-swap | `app/src/webmcp/registry.ts` |
| Core meta-tools and compiled DAG execution | `app/src/webmcp/surface.ts` |
| Pipeline models and DAG validator | `app/src/compile/pipeline.ts`, `app/src/compile/validate.ts` |
| DAG executor and approval gates | `app/src/compile/executor.ts` |
| Topology failover, degrade, and healing | `app/src/compile/hotReload.ts` |
| Edge planner endpoint and frozen schema prompt | `worker/plan.ts` |
| Capability grants and on-device primitives | `app/src/capabilities/` |
| WebRTC DataChannels and Durable Object relay | `app/src/transport/`, `worker/room.ts` |

## Run Locally

### Prerequisites
* Node.js 20.19+ or 22.12+
* An OpenAI API key (for the planner)

```sh
git clone https://github.com/divagr18/fabric.git
cd fabric
npm install

# 1. Start Cloudflare Worker (port 8787)
# Create .dev.vars in the repository root with: OPENAI_API_KEY="your-key"
npm run dev:worker

# 2. Start Vite Frontend (port 5173, proxies /api to Worker)
npm run dev
```

### Verification Commands
```sh
npm run build
npm run typecheck:worker
npx tsx tests/validate.test.ts
npx tsx tests/blob.test.ts
npx tsx tests/plan.smoke.ts
```

## Known Limitations

* **Room Credentials:** A 4-character room code serves as the room credential for this hackathon build.
* **Strict Permission Boundaries:** A device exposes only files, cameras, compute, and human actions that its user explicitly grants. Fabric cannot inspect unshared directories, other tabs, or system files.
* **Closed Primitive Vocabulary:** Compiled tools execute Fabric's typed primitives; the planner cannot execute unvalidated, arbitrary JavaScript strings.
* **First-Run Model Download:** Loading the client-side vision model requires an initial download of roughly 88 MB for q8 or 170 MB for fp16, which is then cached by the browser.

## License

[MIT](LICENSE)
