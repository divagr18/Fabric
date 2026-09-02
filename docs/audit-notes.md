# Code audit (Sep 3, 2026, pre-submission)

A high-effort multi-agent review over `app/src` + `worker` produced 24 verified findings.
All 10 top-severity items were fixed the same hour; the rest are catalogued below honestly.

## Fixed (commit `audit fixes`)
1. **DO tool storage trusted a client-claimed `?role=host`** → one live host per room enforced (409 for rivals). Room code remains the trust boundary by design; this closes hijack-while-host-online.
2. **Grant capId collision after revoke** (`grants.size` reuse) → monotonic sequence; advertised fileIds can no longer silently point at different files.
3. **Host reload lost node capabilities forever** (nodes only advertise on their own connect) → host now requests `fabric.advertise` from every newly-tracked node; fixes the persistence restore→heal path.
4. **Node rejoin fed fresh WebRTC offers into a dead peer connection** → an offer for an existing session tears the old one down first.
5. **A declined/denied human request resolved as stage success** → declines and denials now fail the stage explicitly.
6. **Hot-reload sweep dropped graph changes arriving mid-sweep** → pending queue re-sweeps after completion.
7. **Replan cooldown silently swallowed heal opportunities** (node bouncing within 10s stayed degraded forever) → a retry is scheduled for after the cooldown.
8. **host.match silently dropped vectorless candidates** → results carry `considered` / `without_vectors_dropped` counts.
9. **Blob failure before a waiter registered lost the diagnosis** (60s generic timeout instead) → failures are stored symmetrically with successes.
10. **Tool results containing raw bytes exploded into multi-MB JSON** → Uint8Array serializes as `<binary: N bytes, kept on-device>`.

## Known, deliberately deferred (post-deadline backlog)
- blob_begin `size` not validated against received bytes (corrupt-sender edge)
- single-slot approval UI (concurrent approvals would queue-jump)
- `void` DO storage writes don't surface rare put() failures
- React StrictMode double-registers listeners on memoized emitters (dev-only double logs)
- concurrent first-use CLIP model loads race (both succeed; wasted download)
- embed_text→embed aliasing encoded in 4 places; base64 (not binary) DataChannel framing; no per-file vector cache; sequential replans in sweep
