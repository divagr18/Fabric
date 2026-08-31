# Phase 4 — Status (Aug 28, 2026)

## Shipped (code complete, deployed, smoke-tested)
- `graphChanged` hub events (node lost/joined, capability revocation via advertise diff)
- HotReloadManager: debounced replan, frozen-interface enforcement (name + canonical schema equality), degraded state with precise "what's missing" errors, automatic heal on rejoin/re-share
- Mid-run recovery: compiled tools catch ExecutionError → replan → re-run once → return result + `hot_reload` note to the agent
- Authority gate: on-screen Approve/Deny card before PDF export (camera-visible), decline fails honestly
- Planner replan mode verified: 3/3 smoke incl. frozen-interface replan avoiding the lost node (6.5s)

## ⏳ DEFERRED — user live-rehearsal checklist (test before video day)
- [ ] Test 1 — idle swap: close laptop node tab → `🔥 HOT-SWAPPED v2` → tool works phone-only
- [ ] Test 2 — revoke as steering: stop sharing mid-session → replan/degrade → re-share → heals
- [ ] Test 3 — mid-run recovery: kill node while stages running → same call returns with hot_reload note
- [ ] Test 4 — approval card: packet tool → Deny path errors honestly, Approve path downloads PDF
- [ ] Carry-over from Phase 3: packet-shaped compile live in ChatGPT; `request_from_human` called directly by ChatGPT; clean screen-recorded pass

Feature freeze in effect: everything after this is polish, judge path, video, packaging.
