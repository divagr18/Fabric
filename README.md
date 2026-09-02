# Fabric

**A WebMCP runtime that lets ChatGPT build tools across your devices.**

Your useful data and hardware rarely live in one place. Photos are on your phone, documents are on your laptop, and sometimes the missing input is something only you can provide.

Fabric connects those browsers into one runtime. You choose what each device shares. ChatGPT can then ask Fabric to create a tool for a specific task, such as searching photos across devices. Fabric plans the work, validates the pipeline, and registers the new tool through [WebMCP](https://github.com/webmachinelearning/webmcp) while the conversation is still running.

Computation runs where the data lives. In the photo-search demo, embeddings are generated on the phone and only vectors travel peer to peer. The raw photos stay on the phone. When the hardware changes, Fabric replans affected tools and hot-reloads them under the same name and schema.

**Live demo:** https://fabric.keshav-agr2007.workers.dev

Open it in ChatGPT's in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. One laptop and two tabs are enough; Fabric can generate the sample files for you.

## See it in 30 seconds

1. Open the live app in a WebMCP-capable browser.
2. Start a fabric and open its node link in a second tab or on your phone.
3. Share the generated sample photos from the node.
4. Ask ChatGPT:

   > Create a tool that searches the shared photos by a text description.

5. Watch Fabric register the new tool through WebMCP.
6. Ask:

   > Find the dog.

The search tool did not exist when the session began. ChatGPT created it from the capabilities currently shared by your devices, then called it in the same conversation.

## The problem

Agents can only use the tools a site registered in advance. Meanwhile, the capabilities a person wants to use change from moment to moment: a phone joins with a camera, a laptop shares a folder, a desktop offers a GPU, or a person becomes available to make a judgment call.

Moving all of that into one cloud service creates a second problem. People must upload private files, duplicate data between devices, or install a specialized runtime everywhere before an agent can help.

Fabric gives the agent one live tool surface over the browsers the person already has. The person decides what enters that surface. The agent decides how to compose the available capabilities for the task.

## The demonstrated workflow

In the main demo, ChatGPT asks Fabric to create a cross-device photo-search tool:

1. `inspect_fabric` reports the capabilities each device has explicitly shared.
2. `compile_tool` sends the goal and current capability graph to the planner.
3. The planner returns a JSON pipeline over Fabric's fixed primitive vocabulary. It does not generate executable code.
4. Fabric validates every stage against the live graph and registers the result through WebMCP.
5. The compiled tool embeds the text query and phone photos locally, then ranks the vectors on the host.
6. If a device disappears, Fabric replans the same tool against the surviving graph and re-registers it with the same interface.

The PDF workflow adds a person to the graph. ChatGPT can ask someone to photograph a paper form, resume the pipeline when the photo arrives, and pause the final export for approval.

## Why WebMCP is essential

Normal WebMCP sites expose tools chosen by the developer. Fabric keeps that standard interface but makes the available surface dynamic:

- `compile_tool` can register a task-specific tool during an active conversation.
- Aborting a registration and registering the same name again gives Fabric a clean hot-reload mechanism.
- The browser page remains the permission boundary. An agent reaches a device only through the capabilities its owner shared.
- The `toolchange` lifecycle lets the agent discover a tool that did not exist when the conversation started.

A CLI agent has no standard install path onto a phone, no direct route to its camera, and no common tool surface spanning several browsers. WebMCP supplies that surface.

## What people and agents can do together

Fabric treats human judgment as a capability rather than an interruption outside the workflow. `request_from_human` lets an agent ask a person to capture a physical document, choose between options, or approve an action. The request appears on the selected device and the person can always decline.

People also steer the runtime itself. Revoking a shared capability changes the graph under the agent. Fabric either moves the work to another device or reports exactly why the tool can no longer run.

## Why this matters

Fabric points toward a web where every browser can contribute to a personal, programmable computer. An agent could assemble a temporary tool from cameras, local models, private files, nearby hardware, and human judgment without waiting for one company to build the entire workflow into a centralized product.

That changes the role of a website. Instead of exposing a fixed menu of actions, it can give an agent safe building blocks and let the user decide which devices and data participate. The result is an open execution layer that can grow as new browsers and capabilities join it, while authority stays with the people who own them.

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

The phone creates the embeddings. The raw photos stay there. ChatGPT receives the ranked result through the compiled WebMCP tool.

## Architecture

```text
        ChatGPT
           |
           | WebMCP: core tools and runtime-compiled tools
           |
    Fabric host page
    registry | planner | validator | executor | hot reload
           |
           | WebRTC DataChannels, with Durable Object relay fallback
           |
     laptop     desktop     phone     human
     files      files+GPU   camera    capture/decide/approve
```

One Cloudflare Worker serves the app, signaling, the model proxy, and the planner endpoint.

Each room is backed by a Cloudflare Durable Object. The object gives the room a stable address and a single ordered event stream for joins, departures, roster changes, and relayed messages, so Fabric does not need a separate consensus or leader-election layer. WebSocket Hibernation keeps idle rooms inexpensive, and Durable Object storage lets compiled tools survive after the browsers disconnect. Restored tools return in a degraded state and heal when suitable devices rejoin.

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
