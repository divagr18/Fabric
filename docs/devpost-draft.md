# Devpost submission draft

**Project name:** Fabric

**Tagline:** A WebMCP runtime that lets ChatGPT build tools across your devices.

**Live URL:** https://fabric.keshav-agr2007.workers.dev

**Repository:** TODO: public GitHub URL

**Demo video:** TODO: public YouTube URL, under three minutes

## Inspiration

The files and capabilities an agent needs are usually scattered across devices. Photos sit on a phone, documents live on a laptop, and some steps still require a person to capture something or make a decision. Existing agent runtimes tend to stop at one machine or require the user to move everything into a cloud service first.

Browsers already run on each of those devices. They have permissioned access to files, cameras, local models, and people. WebMCP provides a standard way for a browser to expose those capabilities to an agent. Fabric explores what happens when several browsers can contribute to one live tool surface.

## What it does

Fabric connects the browsers on a person's devices into one runtime. Each device joins a room and contributes only the capabilities its owner chooses to share.

ChatGPT starts with five core WebMCP tools. It can inspect the current fabric, ask Fabric to compile a task-specific tool, inspect the resulting pipeline, revoke a compiled tool, or request help from a person. When ChatGPT calls `compile_tool`, Fabric plans a pipeline over the devices that are currently available, validates every stage, and registers the new tool through WebMCP during the active conversation.

In the main demonstration, ChatGPT creates a photo-search tool that did not exist when the session began. The phone generates image embeddings locally, the query is embedded in the same vector space, and the host ranks the results. The raw photos stay on the phone; only vectors move peer to peer.

Fabric can also include people in a pipeline. ChatGPT can ask someone to photograph a paper form, wait for the response, and pause a PDF export until the person approves it. If a device leaves, Fabric replans affected tools against the remaining graph and hot-reloads them under the same name and schema.

## Why this use case is a strong fit for WebMCP

Normal WebMCP sites expose tools chosen by the developer. Fabric uses the same standard interface but makes the surface responsive to the devices and capabilities available right now.

WebMCP registration lets Fabric add a task-specific tool during a conversation. Registration cancellation provides the mechanism for revoking and replacing a tool. The tool-change lifecycle lets ChatGPT discover the new version. Most importantly, the browser page remains the permission boundary: the agent reaches a device only through capabilities that its owner explicitly shared.

Without WebMCP, Fabric would need a custom integration for every agent client. The standard gives an external agent one tool surface over several browsers without installing a conventional agent runtime on every device.

## How it creates a better user experience

The user does not need to copy files between devices, upload an entire library to a shared service, or explain to the agent where every step should run. The user opens a browser on each participating device and chooses what to share. ChatGPT sees one coherent set of tools, while Fabric handles device selection, local execution, transfers, and recovery when the topology changes.

The interface also stays stable. If a device disappears and another device can perform the same work, ChatGPT keeps calling the same tool name with the same input schema. Fabric changes the implementation underneath it.

## What people and agents can now do together

A person can give an agent temporary access to a combination of private files, local compute, cameras, and human judgment without turning all of those resources into one permanent cloud account.

The agent can build the tool it needs from that temporary capability graph. The person can reshape the graph while the agent works by sharing or revoking capabilities. Human requests are first-class stages: the agent can ask for a photograph, a choice, or approval, and the person can decline.

This points toward a broader model for the open web. Any browser could contribute a safe building block to a personal, programmable computer. Agents could assemble temporary tools from the devices and people available for a task, while the owners of those resources retain authority over participation.

## How WebMCP is implemented

All WebMCP calls live in `app/src/webmcp/`. `registry.ts` wraps `document.modelContext.registerTool` and tracks each registration with an `AbortController`. `surface.ts` defines the five core tools and installs compiled tools.

The planner receives a goal plus a metadata-only capability graph and returns JSON over a fixed primitive vocabulary. It cannot introduce arbitrary methods or executable code. The host validates node availability, methods, references, dependencies, and schemas before registering anything. A rejected plan receives one constrained retry with the validation errors.

The executor runs independent DAG stages concurrently. On-device primitives include CLIP embeddings, OCR, shared-file access, notifications, and human requests. Host primitives handle vector matching, selection, and local PDF generation.

When the graph changes, the hot-reload manager replans affected tools with a frozen name and input schema. It aborts the old registration and registers the new implementation under the same name. Compiled tool definitions are stored in the room's Durable Object and return as degraded placeholders after a host reload, then heal as suitable devices rejoin.

## Architecture

One Cloudflare Worker serves the React application, WebSocket signaling, the same-origin model proxy, and the planner endpoint. Each fabric room is backed by a Cloudflare Durable Object, which provides a stable address, ordered room events, WebSocket Hibernation, relay fallback, and storage for compiled tools.

Devices prefer WebRTC DataChannels for peer-to-peer messages and blob transfers. The Durable Object relay keeps the room usable when a direct channel cannot open. On-device inference uses transformers.js CLIP with WebGPU/fp16 on desktop and WASM/q8 on mobile; OCR uses Tesseract.

## Challenges

The build hit several real failures. Hugging Face stopped returning the CORS headers the browser needed, so Fabric added a same-origin, edge-cached model proxy. Mobile WebGPU selected an unsuitable 350 MB fp32 model until the app adopted a device-specific dtype strategy. Capability IDs became stale between compile time and execution, so primitives now resolve over current grants. HEIC files once stopped an entire photo pipeline; per-file decoding now skips unsupported inputs and reports them. Phones also needed a wake lock to remain in the fabric during long runs.

## Accomplishments

ChatGPT created a tool that did not exist, registered it through WebMCP during the conversation, and used it to search photos on a phone without moving the raw photos off that device. The planner works over a validated capability graph rather than inventing code. A compiled tool can preserve its interface while Fabric moves the implementation to the hardware that remains available.

Fabric also treats people as part of the runtime. The same pipeline model can schedule a local model, a file operation, a physical-world capture, and an approval step.

## What's next

The next step is cross-vendor use: one fabric page serving more than one WebMCP-capable agent. Other directions include suggesting compiled tools from repeated primitive sequences and persisting grant policies so a returning device can restore a remembered fabric with one-tap consent.

## Testing instructions

1. Open the live URL in ChatGPT's in-app browser or Chrome 149+ with WebMCP enabled.
2. Start a fabric and open the node link in another tab or on a phone.
3. Generate and share the sample photos.
4. Ask ChatGPT to create a tool that searches shared photos by text description.
5. After the new tool registers, ask it to find the dog.
6. Inspect the compiled pipeline in Fabric's surface panel or with `inspect_tool`.

For the full demonstration, also share the document samples, keep a printed form nearby, compile the PDF-packet workflow, respond to the phone's capture request, and approve the export on the host.

## Submission checklist

- [ ] Verify the live URL from a clean ChatGPT session and a fresh Chrome profile.
- [ ] Add the public repository URL and confirm the MIT license is visible on the repository page.
- [ ] Add the public YouTube video URL and confirm it is under three minutes with audio.
- [ ] Record which agents and browser clients were used for testing.
- [ ] Add the AI tools used during development to the Devpost form.
- [ ] Confirm every teammate has accepted the Devpost invitation.
