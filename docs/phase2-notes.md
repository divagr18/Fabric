# Phase 2 — Verification notes (Aug 27, 2026)

Live URL: https://fabric.keshav-agr2007.workers.dev

## Benchmarks (real hardware, real files — Windows node, RTX-class GPU, Chrome 151)

| Primitive | First run | Warm run | Notes |
|---|---|---|---|
| `compute.embed` (3 images, CLIP ViT-B/32) | 36.9s total (model download + warm-up) | **1.6–2.1s compute**, ~4.5s RPC total | backend: **webgpu**, honestly re-advertised (`webgpu?` → `webgpu` after first run) |
| `compute.ocr` (1 scanned doc, tesseract) | — | **1.2s**, 59% confidence | real text extracted from a real scan |
| model delivery | ~100MB once per device | browser-cached after | served same-origin via `/api/hf/*` worker proxy (hf.co dropped CORS; edge-cached immutable) |

## Verified behaviors
- Grant → advertise → chip appears live; revoke → chip disappears live (log shows `Scan/` appearing in the advertise line)
- Vectors/text only cross the wire; file bytes move only on explicit `data.read` (peer transfer, never a server)
- Android node joined via QR and was detected lost cleanly
- Embed backend fallback chain in place (webgpu → wasm) — this is the Phase 4 hot-reload substrate

## Known quirks
- Phone screen sleeping drops the node (NODE LOST ~5 min after join) — expected browser behavior; demo phones should keep screen on. Consider a wake-lock (`navigator.wakeLock`) in Phase 5 polish.
- First-run model download needs decent network; pre-warm demo devices before recording.

## Outstanding gate items (user to confirm)
- [ ] phone `human.request capture` (buzz → photo → blob at host)
- [ ] phone `human.request approve`
- [ ] kill node tab mid-`embed` → clean immediate failure at host
