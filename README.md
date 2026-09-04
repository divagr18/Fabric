<p align="center">
  <a href="https://fabric.keshav-agr2007.workers.dev">
    <img src="docs/fabric-readme-banner-v2.svg" alt="Fabric connects your devices so agents can build, run, and hot-swap WebMCP tools" width="100%">
  </a>
</p>

# Fabric

> Fabric connects your devices so agents can build, run, and hot-swap WebMCP tools from whatever files, cameras, compute, and people are available right now.

[Try Fabric](https://fabric.keshav-agr2007.workers.dev) · [Watch the demo](https://youtu.be/Gzw9uTK5uZ4) · [MIT License](LICENSE)

Fabric runs on a simple philosophy: tools should be dynamic and plug-and-play.

A phone, laptop, desktop, or person can join the fabric and contribute only the capabilities its user chooses to share. An agent can compile those capabilities into a task-specific tool and call it during the same conversation. When capabilities change, Fabric replans and hot-swaps the implementation while keeping the tool's name and input schema stable.

Fabric uses [WebMCP](https://github.com/webmachinelearning/webmcp) as the tool interface, WebRTC for direct browser-to-browser transport, local models for private computation, and Cloudflare Workers and Durable Objects for coordination and persistence.

## See it in 30 seconds

1. Open the live app in a WebMCP-capable browser.
2. Start a fabric and open its node link in a second tab or on your phone.
3. Share the generated sample photos from the node.
4. Ask ChatGPT:

   > Create a tool that searches the shared photos by a text description.

5. Watch Fabric register the new tool through WebMCP.
6. Ask:

   > Find the dog.

The search tool did not exist when the session began. Fabric compiled it from the capabilities shared by the connected devices, registered it through WebMCP, and ChatGPT called it in the same conversation.

## One runtime for people, agents, and devices

Agents can reason across a task, but the capabilities they need are scattered across the devices and people around us. Photos sit on a phone, documents live on a laptop, compute may be available on a desktop, and some steps require a person to capture something, decide, or approve an action.

Bringing those pieces together usually means uploading private data to one cloud service or installing a specialized runtime on every device. Fabric takes a different approach: browsers, people, and agents contribute explicit capabilities to one shared runtime.

The person controls what enters the fabric. The agent decides how to compose the available capabilities for the task. A device or person can join, contribute something useful, and leave again without forcing the agent to learn a new interface.

## Two demonstrated workflows

### Cross-device photo search

1. `inspect_fabric` reports the capabilities each device has explicitly shared.
2. `compile_tool` sends the goal and current capability graph to the planner.
3. The planner returns a JSON pipeline over Fabric's fixed primitive vocabulary. It does not generate executable code.
4. Fabric validates every stage against the live graph and registers the result through WebMCP.
5. The compiled tool embeds the text query and phone photos locally, then ranks the vectors on the host.
6. If a device disappears, Fabric replans the same tool against the surviving graph and re-registers it with the same interface.

The phone computes CLIP embeddings locally and sends vectors peer-to-peer for ranking. After Fabric selects a result, only that preview moves to the host. The photos and preview never pass through a central server.

### Human-assisted document packet

The second workflow adds a person to the graph. An agent asks someone to photograph a paper form, resumes the pipeline when the capture arrives, runs OCR, and pauses the final PDF export for approval. The person can respond or decline without leaving the workflow.

## Why WebMCP

Most WebMCP applications expose a fixed set of developer-defined tools. Fabric uses WebMCP as a dynamic compilation target:

- `compile_tool` can register a task-specific tool during an active conversation.
- Aborting a registration and registering the same name again gives Fabric a clean hot-reload mechanism.
- The browser page remains the permission boundary. An agent reaches a device only through the capabilities its owner shared.
- The `toolchange` lifecycle lets the agent discover a tool that did not exist when the conversation started.

This creates a different model for human-agent interaction. People do more than issue prompts: they lend capabilities, provide physical-world input, make decisions, and retain authority over what the agent may use. Agents do more than operate a predefined application: they assemble temporary tools from the people and devices available for the task.

## How WebMCP is implemented

Every core and runtime-compiled tool goes through the standard registration call in `app/src/webmcp/registry.ts`:

```js
document.modelContext.registerTool({
  name: pipeline.toolName,
  description: pipeline.description,
  inputSchema: pipeline.inputSchema,
  execute: async (input) => { /* run the validated cross-device pipeline */ },
}, { signal: controller.signal });
```

Fabric currently exposes five core tools:

| Tool | Purpose |
|---|---|
| `inspect_fabric` | Lists connected devices and explicitly shared capabilities |
| `compile_tool` | Plans, validates, and registers a new task-specific tool |
| `inspect_tool` | Shows the exact stages, devices, version, and health of a compiled tool |
| `revoke_tool` | Removes a compiled tool from the WebMCP surface |
| `request_from_human` | Routes capture, decision, and approval requests to a person |

Compiled tools are data, not generated code. The planner emits a pipeline over a fixed set of typed primitives. The validator rejects unknown methods, offline nodes, broken references, dependency cycles, and incompatible schemas. Validation errors feed one constrained planner retry.

## Where to look

| What | Where |
|---|---|
| WebMCP registration, revoke, and hot-swap | `app/src/webmcp/registry.ts` |
| Core tools and compiled-tool execution | `app/src/webmcp/surface.ts` |
| Pipeline model and validator | `app/src/compile/pipeline.ts`, `app/src/compile/validate.ts` |
| DAG executor and approval gate | `app/src/compile/executor.ts` |
| Graph-change replan, degrade, and heal | `app/src/compile/hotReload.ts` |
| Planner endpoint and frozen-interface replan prompt | `worker/plan.ts` |
| Consent grants and on-device primitives | `app/src/capabilities/` |
| WebRTC, relay fallback, and chunked blobs | `app/src/transport/`, `worker/room.ts` |

## A real session

```text
[22:57:33] compiling: "search photos across my devices by description"
[22:57:33] find_matching_photos REGISTERED via WebMCP
[22:57:44] stage embed_query  [compute.embed_text @ Android] running
[22:57:44] stage embed_photos [compute.embed      @ Android] running
[22:57:48] stage embed_query  done
             ...host.match ranks the vectors on the host...
ChatGPT:     "Dog-photo matches:
              1. 78105.jpg - 0.2599
              2. 78336.png - 0.2049"
```

The phone creates the embeddings and sends vectors for ranking. The selected preview moves peer-to-peer to the host, never through a central server. ChatGPT receives the ranked result through the compiled WebMCP tool.

## Cloudflare architecture

A Cloudflare Worker serves the app, accepts WebSocket upgrades, exposes the planner endpoint, and proxies model files through the same origin.

Each room is coordinated by a Durable Object. It provides a stable address and ordered event stream for joins, departures, signaling, and relayed messages. It also stores compiled tool definitions. After a host reload, saved tools return in a degraded state and heal as suitable devices reconnect.

Browsers prefer direct WebRTC DataChannels for binary transfers and vectors. If a direct connection cannot open, the Durable Object relays the traffic. WebSocket Hibernation evicts idle compute while keeping connections alive, so a personal fabric costs almost nothing in compute to keep parked at the edge until its user returns.

## Measured on real hardware

| Operation | Observed result |
|---|---|
| CLIP embed, warm WebGPU desktop | 1.6-2.1 seconds per small batch |
| OCR, one scanned document | 1.2 seconds |
| Planner compile | 10-20 seconds |
| Planner replan | About 6 seconds in the recorded smoke run |
| Model delivery | About 89 MB once per device, q8 mobile or fp16 desktop |
| Node-loss detection | Under 5 seconds from the roster update |

## Run locally

```sh
npm install
npm run dev:worker   # Cloudflare Worker on :8787; needs OPENAI_API_KEY in .dev.vars
npm run dev          # Vite on :5173, proxying /api to the Worker
```

Verification commands:

```sh
npm run build
npm run typecheck:worker
npx tsx tests/validate.test.ts
npx tsx tests/blob.test.ts
npx tsx tests/plan.smoke.ts
```

To test the deployed product, use ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled. Open the live URL in a fresh session, join a second tab or phone, share the sample photos, compile the search tool, and ask it to find the dog.

## Known limitations

- A room code is the room credential for this hackathon build.
- A device exposes only files, cameras, compute, and human actions that its user explicitly shares. Fabric cannot enumerate a photo library, read other tabs, or access browser sessions.
- The planner sees the goal and capability descriptions, but not file contents. The API key remains server-side.
- Compiled tools run Fabric's fixed primitive vocabulary; they cannot execute arbitrary generated code.
- Model downloads are large on first use and then cached by the browser and edge proxy.
- WebRTC is preferred for peer-to-peer transport. A Durable Object relay keeps the fabric usable when a direct channel cannot open.

## License

MIT
