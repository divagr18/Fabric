# Phase 3 — Verification notes (Aug 27, 2026)

## Exit gate: PASSED (live, in ChatGPT's browser, against production)

Full loop verified end to end:

1. `inspect_fabric` → ChatGPT saw real nodes + shared capabilities
2. `compile_tool` → planner (gpt-5.6-luna, ~10–20s) emitted a validated cross-device pipeline
3. `⚡ find_matching_photos REGISTERED via WebMCP` — **tool appeared in ChatGPT's tool list mid-session** ("Listed website tools" in the ChatGPT transcript)
4. ChatGPT called it → stages executed on the Android node (`compute.embed_text` + `compute.embed` on wasm) + host (`host.match`)
5. Ranked results returned to ChatGPT: `78105.jpg 0.2599 > 78336.png 0.2049` — dog query correctly ranked the dog photo first
6. Raw photos never left the phone; only vectors crossed the wire

## Planner quality
- 2/2 smoke goals produce correct pipelines (photo similarity: embed_text→embed×N nodes→match; packet: list→ocr→human capture→compile_pdf)
- Planner **refuses to fabricate** when a method isn't in the graph (returned an empty "unavailable" pipeline rather than inventing) — capability-graph grounding works
- Validator: 8/8 unit tests; catches offline nodes, unknown methods, bad refs, cycles, dup names, promptless human stages

## Hardening shipped during verification (each was a real live failure)
- hf.co dropped CORS → same-origin `/api/hf/*` model proxy, edge-cached, Content-Length preserved for progress
- transformers.js v4 rewrite broke fetches → pinned v3.8.1, ORT wasm fully bundled
- Mobile downloaded 350MB fp32 → q8-first on mobile (89MB), fp16 on desktop webgpu
- Zigzag progress → bytes-weighted monotonic aggregate; indeterminate shows MB
- Stale capIds (grants changed after compile) → primitives fall back to all granted files on the node
- HEIC/undecodable images → per-file skip with names, stage survives
- Stale cached index.html → /assets/* misses 404 instead of SPA-fallback HTML

## Still open (rolls into Phase 4/5)
- [ ] clean screen-recorded pass of the full loop (raw video footage)
- [ ] packet-shaped compile (ocr + human capture + compile_pdf) live in ChatGPT
- [ ] `request_from_human` invoked directly by ChatGPT
- [ ] Phase 4: node loss / capability revocation mid-run → replan → same tool name hot-swapped (registry.hotSwap already spike-proven)
