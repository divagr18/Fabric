# Fabric

Fabric turns your devices into one live runtime where agents build, run, and hot-swap WebMCP tools from the files, cameras, compute, and people available right now.

[Try Fabric live](https://fabric.keshav-agr2007.workers.dev) · [Explore the source](https://github.com/divagr18/fabric) · [Watch the demo](https://youtu.be/cw65XLqgKRg)

## Inspiration

AI agents can reason across a task, but the world they can act on is fragmented across the devices and people around us. Photos sit on a phone, documents live on a laptop, compute may be available on a desktop, and some steps still require a person to capture something, make a judgment, or approve an action.

Fabric began with a question: what would human-agent collaboration look like if the open web could connect all of those participants through one living runtime? Instead of treating people as prompt writers and devices as isolated endpoints, Fabric lets each contribute explicit, user-granted capabilities to a shared fabric.

Fabric is for people who want agents to work across their devices without uploading all of their private data to the cloud or installing a specialized agent runtime everywhere. People and agents can combine files, cameras, local models, compute, real-world input, and human judgment to create tools for the task at hand.

## What it does

Fabric turns the browsers across a person's devices into one agent-accessible runtime. Each device contributes only the capabilities its owner chooses to share. An agent inspects that live capability graph, compiles the available pieces into a task-specific pipeline, and registers it as a new WebMCP tool during the conversation. The tool can be called immediately, even though it did not exist when the conversation began.

An agent starts with five core WebMCP tools. It can inspect the current fabric, compile a task-specific tool, inspect the resulting pipeline, revoke a compiled tool, or request help from a person. Fabric validates every planned stage before registration; compiled tools are pipelines over a fixed primitive vocabulary, not arbitrary generated code.

In the main demonstration, an agent creates a photo-search tool from capabilities shared by a phone and laptop, then calls it to find a dog. The phone generates the image embeddings locally, the host ranks the results, and only vectors move peer to peer. The raw photos never leave the phone.

Fabric also makes human-in-the-loop collaboration part of the runtime itself. An agent can ask someone to photograph a paper form, wait for the response, and pause a PDF export until that person approves it. The human is not an exception outside the workflow; capture, judgment, and approval are capabilities that can be composed into the tool alongside files and compute.

If a device leaves, Fabric replans affected tools against the remaining graph and hot-reloads them under the same name and schema. The agent keeps using the same interface while Fabric changes the implementation underneath it.

## Why this use case is a strong fit for WebMCP

Most WebMCP applications expose a fixed set of developer-defined tools. Fabric exposes a tool compiler: it creates new WebMCP tools from the devices, people, and capabilities available right now, then rebuilds them under a stable interface when that environment changes.

WebMCP is what makes this possible. Registration lets Fabric add a task-specific tool during a conversation. Registration cancellation lets it revoke or replace that tool. The tool-change lifecycle lets the agent discover the new version. Most importantly, the browser remains the permission boundary: an agent reaches a device only through capabilities its owner explicitly shared.

Without WebMCP, Fabric would need a custom integration for every agent client and every connected capability. WebMCP gives agents one explicit, typed tool surface instead. Fabric extends that shared surface across several browsers without installing a conventional agent runtime on every device.

## How it creates a better user experience

The user does not need to copy files between devices, upload an entire library to a shared service, or explain where every step should run. They open a browser on each participating device and choose what to share. The agent sees one coherent tool surface while Fabric handles device selection, local execution, transfers, and recovery when the topology changes.

The experience stays coherent even as the device graph changes. Tool names, input schemas, and expected results remain stable. If a device disappears and another device can perform the same work, the agent keeps calling the same tool while Fabric hot-swaps the implementation underneath it.

## What people and agents can now do together

Today, an agent usually stops at the browser, application, or device it can directly reach. Fabric lets a person temporarily give it a combination of private files, local compute, cameras, and human judgment without turning those resources into one permanent cloud account.

The agent can build the tool it needs from that temporary capability graph. The person can reshape the graph while the agent works by sharing or revoking capabilities. Human requests are first-class stages: the agent can ask for a photograph, a decision, or approval, and the person can respond or decline without leaving the workflow.

This creates a new paradigm for human-agent interaction. People do not merely issue prompts and wait for results; they lend capabilities, contribute real-world context, make decisions at meaningful checkpoints, and retain authority over what the agent may use. Agents do not merely operate a predefined app; they assemble temporary tools from the people and devices available for the task.

The result is a model for an open web where every browser can contribute a safe building block to a personal, programmable computer. Humans and agents can interact, collaborate, and create together while authority remains with the people who own the data and devices.

## How WebMCP is implemented

All WebMCP calls live in `app/src/webmcp/`. `registry.ts` wraps `document.modelContext.registerTool`, tracks registrations with `AbortController`, and supports revocation and replacement. `surface.ts` defines the five core tools and installs compiled tools.

The planner receives a goal and a metadata-only capability graph, then returns JSON over a fixed primitive vocabulary. The host validates node availability, methods, references, dependencies, and schemas before registering anything. It never executes planner-generated code.

The executor runs independent pipeline stages concurrently. On-device primitives include CLIP embeddings, OCR, shared-file access, notifications, and human requests. Host primitives handle matching, selection, and local PDF generation.

When the graph changes, Fabric replans affected tools with a frozen name and input schema, aborts the old registration, and registers the replacement. Compiled definitions persist in the room's Durable Object, return in a degraded state after a reload, and heal as suitable devices rejoin.

The complete implementation is available in the [public Fabric repository](https://github.com/divagr18/fabric) under the MIT license.

## Architecture

One Cloudflare Worker serves the React app, signaling, model proxy, and planner endpoint. Each room is backed by a Durable Object that provides a stable address, ordered events, relay fallback, and storage for compiled tools. WebSocket Hibernation evicts idle compute while keeping connections alive, so an idle room costs almost nothing to maintain: a personal fabric can sit parked at the edge, waiting for its person.

Devices prefer WebRTC DataChannels for peer-to-peer messages and blob transfers, with the Durable Object as a relay fallback. On-device inference uses transformers.js CLIP with WebGPU/fp16 on desktop and WASM/q8 on mobile; OCR uses Tesseract.

## Challenges

The build hit several real failures. Hugging Face stopped returning the CORS headers the browser needed, so Fabric added a same-origin, edge-cached model proxy. Mobile WebGPU selected an unsuitable 350 MB fp32 model until the app adopted a device-specific dtype strategy. Capability IDs became stale between compile time and execution, so primitives now resolve over current grants. HEIC files once stopped an entire photo pipeline; per-file decoding now skips unsupported inputs and reports them. Phones also needed a wake lock to remain in the fabric during long runs.

## Accomplishments

The working prototype registers tools during an active conversation, executes validated multi-device pipelines, transfers data peer to peer, and pauses for human input and approval. These are not isolated technical demos: they form one coherent runtime where devices and people can join, contribute a capability, and leave while an agent continues working.

In the photo-search demo, an agent creates and calls a tool that did not exist when the session began, while the raw photos stay on the phone. In the document demo, the same pipeline model schedules OCR, a physical-world capture, a file operation, and a human approval gate. Together, these flows demonstrate that both machines and people can be composable participants in one WebMCP runtime.

Compiled tool definitions persist in Durable Object storage, so reloading the host does not erase the tools the agent created. They return in a degraded state and heal as suitable devices reconnect. When a device is removed, Fabric automatically detects the changed graph, replans the affected tool, and hot-registers version two under the same name and input schema. The agent keeps calling the same tool even though its implementation and device placement changed underneath it.

WebSocket Hibernation gives that persistent runtime a practical deployment model. Idle compute is evicted while the room's connections remain alive, so a personal fabric costs almost nothing to keep waiting at the edge when nobody is using it.

## What's next

The next step is cross-vendor use: one fabric page serving more than one WebMCP-capable agent. Other directions include suggesting compiled tools from repeated primitive sequences and persisting grant policies so a returning device can restore a remembered fabric with one-tap consent.

## Testing instructions

1. Open the live URL in ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled.
2. Start a fabric and open the node link in another tab or on a phone.
3. Generate and share the sample photos.
4. Ask ChatGPT to create a tool that searches shared photos by text description.
5. After the new tool registers, ask it to find the dog.
6. Inspect the compiled pipeline in Fabric's surface panel or with `inspect_tool`.

Expected result: Fabric registers the new photo-search tool during the conversation, the agent calls it successfully, and the dog image ranks first without the raw photos leaving the device that shared them.

For the full demonstration, also share the document samples, keep a printed form nearby, compile the PDF-packet workflow, respond to the phone's capture request, and approve the export on the host.
