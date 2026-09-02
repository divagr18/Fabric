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

## Second pass (same day): 12 of the 14 deferred items fixed
- blob size-mismatch validation + BlobReceiver unit suite (5/5) · approval FIFO queue · DO storage errors logged · planner non-JSON guard · store-after-register (no orphaned persisted tools) · memoized model loads · provenance whitelist · centralized embed_text alias (`capabilityMethodFor`) · bounded node log · `getGraph` derived from `views()` · concurrent replans · per-file vector cache (`cached` count in embed results) · unsubscribe-based listeners + idempotent start/stop (StrictMode/HMR-safe lifecycle)

## Deliberately not fixed (with reasons)
- **base64-over-DataChannel framing** — a proper fix is a binary subprotocol across DataChannel, the WS relay, and the DO router; high risk, no benefit at demo file sizes. Post-hackathon.
- **`delete_tool` sent while the socket is down** — `Signaling` queues sends until reconnect within a session; the only loss window is closing the host immediately after a revoke, and the consequence is a tool restoring as `degraded` (one click to re-revoke). Accepted.
