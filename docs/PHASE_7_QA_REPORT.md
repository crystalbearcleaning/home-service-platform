# Phase 7 QA Report

**Date:** 2026-05-27
**Step:** Phase 7E — Phase 7 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md`
(Appendix A — Phase 7B schema + adapter scaffold, Appendix B —
Phase 7C `/admin/simulation/play` read-only shell, Appendix C —
Phase 7D-1 Start simulated route, Appendix D — Phase 7D-2 Hang
actions).

This pass closes out Phase 7 (Simulation Play Surface + Door Hanger
Simulation Adapter). **No new features were added in this step.**
Operator-initiated Finish-route, plugin-builder, and simulation
outcomes (delayed CRM leads from completed routes) remain deferred to
Phase 7+.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **518 / 518** tests across 48 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/simulation/play` at 3.41 kB. |

DB-side verification (via `supabase db query --linked`):

| Check | Result |
|---|---|
| `door_hanger_distribution_sessions` Phase 7B columns | ✅ `simulation_run_id`, `seconds_per_hanger`, `status`, `started_at`, `ended_at` all present |
| `door_hanger_routes.last_completed_at` | ✅ present |
| `door_hanger_route_stops.completed_at` | ✅ present |
| `simulation_activity` table | ✅ exists |
| `simulation_activity` RLS | ✅ enabled |
| `simulation_activity_members_select` policy | ✅ SELECT, `authenticated` |
| `door_hanger_simulation_hang` function | ✅ exists, `security definer`, signature `(uuid, uuid, uuid, text, integer)` |
| RPC EXECUTE grants | ✅ only `postgres` (owner) + `service_role` after Phase 7D-2 lockdown migration; `anon` + `authenticated` revoked |
| Real Crystal Bear simulated sessions | ✅ **0** (no leakage into real workspace) |
| Real Crystal Bear simulation_activity | ✅ **0** (no leakage into real workspace) |
| `crystal-bear-simulation` `is_simulation` | ✅ `true` |
| `crystal-bear` `is_simulation` | ✅ `false` |

---

## 2. What shipped in Phase 7 (recap)

- **Phase 7A** — source-of-truth doc + Phase 7 pointer paragraphs in
  `CLAUDE.md` / `README.md`.
- **Phase 7B** — additive migration
  `20260527120000_phase_7_simulation_play.sql`:
  five new columns on `door_hanger_distribution_sessions`, one on
  `door_hanger_routes`, one on `door_hanger_route_stops`, and the new
  `simulation_activity` table (Pattern B RLS). Server-only
  `appendSimulationActivity` + `listSimulationActivityForRun`
  helpers. Door Hanger simulation adapter scaffold under
  `src/plugins/door-hanger/simulation/` (assumptions + pure helpers +
  action key + activity type taxonomies). 40 pure unit tests.
- **Phase 7C** — `/admin/simulation/play` read-only shell with three
  gate branches (real / no-active-save / play). Door Hanger card with
  disabled "Coming next" buttons, current-session card, and
  simulation_activity feed. Pure gate + progress helpers + 12 unit
  tests. Sidebar active-state fix
  (`resolveActiveNavHref` longest-prefix wins) so
  `/admin/simulation/play` no longer highlights both Saves and Play.
- **Phase 7D-1** — Start simulated route end-to-end. Pure
  `validateStartSessionForm` + 12 tests. Server-only
  `startDoorHangerSimulationSession` core helper, server action
  `startDoorHangerSimulationSessionAction`, and the client
  `<StartSimulatedRouteForm>`. Selectable-route + selectable-design
  loaders. The Door Hanger card branches between embedded start form
  (no session) and "route in progress" status + disabled Hang
  buttons (active session).
- **Phase 7D-2** — Hang 1 / Hang custom / Hang route. New Postgres
  function `door_hanger_simulation_hang` (`security definer`, ALL
  writes in one transaction) plus a tiny follow-up lockdown migration
  that revokes EXECUTE from `anon`/`authenticated`. Thin TS wrapper
  `performHangAction`, three server actions (`hangOneAction`,
  `hangCustomAction`, `hangRouteAction`), and the client
  `<HangActionsCard>` with live time-cost preview, capped-by
  notices, and route-completion placeholder copy.

---

## 3. Phase 7 Definition of Done — checklist

Drawn from §15 of the Phase 7 doc + each appendix's "What did NOT
ship" section.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | Phase 7 doc + Appendices A / B / C / D. |
| `/admin/simulation/play` exists | ✅ | Built page; 3.41 kB. |
| Play page requires simulation workspace AND active save | ✅ | `resolvePlayPageGate` pure helper + 12 unit tests; server actions independently re-check (`NOT_SIMULATION_WORKSPACE`, `NO_ACTIVE_SAVE`). |
| Door Hanger simulation adapter implemented | ✅ | `src/plugins/door-hanger/simulation/*` (assumptions + helpers + adapter manifest + action/activity type taxonomies). |
| Operator can start exactly one simulated session per save | ✅ | `SESSION_ALREADY_ACTIVE` enforced in `startDoorHangerSimulationSession` (TS layer) + re-checked inside the Hang RPC (`select … for update` on the active session row). |
| `seconds_per_hanger` stored on the session + visible on the play page | ✅ | Added in Phase 7B; written at start; rendered in the active-session card. |
| Hang 1 / Hang custom / Hang route work as single transactional actions | ✅ | One PL/pgSQL function with `select … for update` on session/design/route/run + `with … for update` on N pending stops. Validation `raise exception` rolls back any uncommitted work. |
| Inventory decrements correctly; overdraft rejected | ✅ | RPC updates `quantity_used += effective`. DB CHECK `quantity_used <= quantity_received` is the safety net; RPC raises `INSUFFICIENT_INVENTORY` before getting there. |
| Simulated time advances `effective × seconds_per_hanger` per action | ✅ | RPC updates `simulation_runs.simulated_current_at`. End-to-end verification §5: 100 hangers × 30s = +3000s. |
| Route-stop `pending → completed` when stops exist; count-only fallback otherwise | ✅ | RPC's `with next_stops as (… order by stop_order asc nulls last, created_at asc limit effective for update)` block; skipped when `route_total_stops = 0 and pending = 0`. |
| Route + session progress updates after every action | ✅ | RPC always updates session counters; play page revalidates via `revalidatePath('/admin/simulation/play')`. |
| `simulation_activity` rows written for every action; feed updates on the play page | ✅ | Primary row per Hang; two extra rows on route completion. Feed reads via `listSimulationActivityForRun` (default 50, hard cap 200). |
| Finishing a route marks session ended + route completed + sets `last_completed_at` | ✅ | RPC's completion branch updates both rows + writes `door_hanger.route_completed` and `door_hanger.session_completed` activity rows. |
| **No CRM outcomes generated** | ✅ | Do-Not-Build audit §7 below. Verified `contacts/leads/quotes/tasks/notification_logs/events` all remain **0** on the simulation workspace after end-to-end Hang sequence. |
| Phase 6D GHL guardrail is not even reached from Phase 7 | ✅ | grep shows no `sendInternalSmsNotification` / `getSmsProviderAdapter` calls in any `simulation`, `simulation-start`, `simulation-hang`, or `/admin/simulation/play` path. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_7_QA_REPORT.md` exists | ✅ | This file. |
| `CLAUDE.md` Phase 7 pointer | ✅ | Added in Phase 7A. |
| `README.md` Phase 7 status block | ✅ | Added in Phase 7A. |

Phase 1+2+3+4+5+6 Definition-of-Done items remain in force; nothing
in Phase 7 regressed them. See §8 below.

---

## 4. Manual test checklist

### 4.1 Schema + RPC (DB-verified)

| Step | Status |
|---|---|
| `door_hanger_distribution_sessions.simulation_run_id` exists (uuid NULL FK) | ✅ |
| `door_hanger_distribution_sessions.seconds_per_hanger` exists (integer NULL) | ✅ |
| `door_hanger_distribution_sessions.status` exists (text NOT NULL default `'completed'`) | ✅ |
| `door_hanger_distribution_sessions.started_at` exists (timestamptz NULL) | ✅ |
| `door_hanger_distribution_sessions.ended_at` exists (timestamptz NULL) | ✅ |
| `door_hanger_routes.last_completed_at` exists (timestamptz NULL) | ✅ |
| `door_hanger_route_stops.completed_at` exists (timestamptz NULL) | ✅ |
| `simulation_activity` table exists | ✅ |
| `simulation_activity` RLS enabled | ✅ |
| `simulation_activity_members_select` policy exists (SELECT, `authenticated`) | ✅ |
| `door_hanger_simulation_hang` function exists | ✅ |
| Function is `security definer` | ✅ |
| EXECUTE granted only to `service_role` + owner `postgres` | ✅ — `anon` + `authenticated` revoked by lockdown migration |
| anon/authenticated cannot execute the function | ✅ — verified via `information_schema.routine_privileges` |

### 4.2 Play page gates

| Step | Status |
|---|---|
| `/admin/simulation/play` exists | ✅ — built (3.41 kB) |
| Real workspace shows "Switch to a simulation workspace" empty state | ✅ — `resolvePlayPageGate.kind === "not_simulation_workspace"` pinned by unit test |
| Simulation workspace with no active save shows "Create or select a simulation save first" + Link to `/admin/simulation` | ✅ — pinned by unit test |
| Simulation workspace with active save renders play shell | ✅ — `kind === "play"` pinned by unit test; manually verified via the Phase 7D-2 end-to-end run |
| Door Hanger card renders only when plugin installed/enabled | ✅ — `isDoorHangerPluginEnabled` checks `plugin_definitions` → `installed_plugins.status='enabled'` |
| No gameplay UI on real workspace | ✅ — server actions independently re-gate; play page never even loads start-form prereqs unless `business.isSimulation` |

### 4.3 Start simulated route

| Step | Status |
|---|---|
| Start form appears when no active Door Hanger session exists | ✅ — verified via Phase 7D-1 rollout + Phase 7D-2 sequence |
| Route select only uses simulation workspace routes (status in draft/ready/paused) | ✅ — `listSelectableRoutesForStart` business-scoped + status-filtered |
| Design select only uses simulation workspace in-stock designs | ✅ — `listSelectableDesignsForStart` business-scoped + app-side `quantity_received - quantity_used > 0` filter |
| `seconds_per_hanger` defaults to 30, validates ≥ 1 | ✅ — `parseSecondsPerHanger` enforces `[1, 600]`; default surfaces when empty |
| Start inserts `door_hanger_distribution_sessions` row (`mode='simulated'`, `status='active'`, `simulation_run_id` set, `seconds_per_hanger` set, `started_at/distributed_at` = save's `simulated_current_at`) | ✅ — verified by row inspection during Phase 7D-2 end-to-end |
| Route flips to `in_progress` | ✅ |
| `simulation_activity` row `door_hanger.session_started` written | ✅ |
| No inventory decrement on start | ✅ — design `quantity_used` unchanged after start (was 0 → still 0) |
| No simulated time advance on start | ✅ — clock stayed at the same `simulated_current_at` |
| No CRM / message rows on start | ✅ — `contacts/leads/quotes/tasks/notification_logs/events` all remained 0 |
| One-active-session-per-save | ✅ — `SESSION_ALREADY_ACTIVE` raised before any DB write when another active sim session exists |

### 4.4 Hang actions (live end-to-end against the simulation workspace, Phase 7D-2)

Starting state: session linked to route `Intercoastals` (100 stops,
all pending), design with `quantity_received=2500`, `quantity_used=0`,
`cost_per_hanger_cents=17`, `seconds_per_hanger=30`,
`simulated_current_at=2026-05-26 16:33:00+00`.

| Action | RPC result | Verified state change |
|---|---|---|
| **Hang 1** | `effective_count=1`, `time_advanced_seconds=30`, `route_completed=false` | clock 16:33:00 → 16:33:30; `quantity_used=1`; session `hangers_distributed=1`, `time_spent_seconds=30`; activity row `door_hanger.hang_one` |
| **Hang custom 25** | `effective_count=25`, `capped_by=null`, `time_advanced_seconds=750` | clock 16:33:30 → 16:46:00; `quantity_used=26`; session `hangers_distributed=26`, `time_spent_seconds=780`; activity row `door_hanger.hang_custom` |
| **Hang route** | `effective_count=74`, `capped_by=null`, `time_advanced_seconds=2220`, `route_completed=true` | clock 16:46:00 → 17:23:00; `quantity_used=100`; session `hangers_distributed=100`, `time_spent_seconds=3000`, `status='completed'`, `ended_at=17:23:00`, `material_cost_cents=1700` (100 × 17¢); route `status='completed'`, `last_completed_at=17:23:00`; 100 route_stops `completed`, 0 pending; activity rows `door_hanger.hang_route` + `door_hanger.route_completed` + `door_hanger.session_completed` |

Totals after the sequence:
- Inventory `quantity_used` 0 → **100** (matches 1 + 25 + 74).
- Simulated clock advanced **+3000 s** (matches 100 × 30 s).
- 100 route_stops completed; 0 pending.
- 6 `simulation_activity` rows on the active save (1 session_started
  + 3 hang + 1 route_completed + 1 session_completed).
- Hang custom + Hang route both cap-checked: `capped_by=null` (no
  cap hit on this run); capping logic itself is covered by RPC §7
  branches + the Phase 7B `computeEffectiveHangCount` unit tests.

### 4.5 Stop-based and fallback behaviour

| Step | Status |
|---|---|
| RentCast route with stops completes stops in order (`stop_order asc nulls last, created_at asc`) | ✅ — confirmed by 100 `completed_at` timestamps and `pending=0` after Hang route |
| Manual route with no stops uses count-only fallback | ✅ — RPC §6 branches on `route_has_stops`; falls back to `target_home_count - hangers_distributed`, or to remaining inventory when target is also null (covered by `computeEffectiveHangCount` and `isRouteComplete` unit tests) |
| No `route_stop` rows are created for manual fallback | ✅ — RPC only updates pending stops; never inserts |
| Inventory overdraft rejected safely | ✅ — RPC raises `INSUFFICIENT_INVENTORY` before any write; DB CHECK is the second-line safety |
| One-active-session rule holds across both Start and Hang | ✅ — TS enforces at Start; RPC enforces at Hang (only `status='active'` sessions are selected for update) |

### 4.6 Simulation activity feed

| Step | Status |
|---|---|
| Feed shows start / hang / completion activities | ✅ — 6 rows visible on the play page; ordered newest-first by `created_at` |
| Activity is scoped to the active save | ✅ — `listSimulationActivityForRun({ businessId, simulationRunId })` |
| Activity does not appear in normal CRM activity | ✅ — written to `simulation_activity` table, never to `events` / `activities` |
| No core `events` / `activities` rows written by Phase 7 gameplay | ✅ — grep shows no `publishEvent` / `createActivity` calls in `simulation*` / `simulation-start` / `simulation-hang` modules |

---

## 5. Phase 7D-2 end-to-end summary (verified Hang sequence)

For the record (reproduces §4.4 in single-block form):

- **Hang 1** → effective=1, time +30 s.
- **Hang custom 25** → effective=25, time +12 min 30 s.
- **Hang route** → effective=74, route + session auto-completed.
- Inventory `quantity_used`: 0 → 100.
- Simulation clock: +3000 s (16:33:00 → 17:23:00 UTC).
- Route stops: 100 completed, 0 pending.
- `simulation_activity` rows on the active save: 6 (1 session_started
  from Phase 7D-1 + 3 hang + 1 route_completed + 1 session_completed).
- CRM rows on the simulation workspace remained at **0**
  (`contacts/leads/quotes/tasks/notification_logs/events`).

This single run exercises every Hang RPC branch:
- Hang 1 single-stop completion path.
- Hang custom N-stop completion (well below cap, so `capped_by=null`).
- Hang route remaining-stops completion that finishes both route
  and session in one transaction.

Cap-by-inventory and cap-by-stops branches are not exercised by this
run (request always fit). They are covered by:
- `computeEffectiveHangCount` unit tests (Phase 7B) — 7 cap-scenario
  tests pin `cappedBy` values.
- RPC §7 conditional branches — symmetric to the TS helper.

---

## 6. Security / schema check

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| RPC `security definer` posture | ✅ — required because the function writes to RLS-protected tables; `set search_path = public` prevents schema-hijack |
| RPC EXECUTE confined to `service_role` | ✅ — Phase 7D-2 lockdown migration revokes `anon` + `authenticated` defaults |
| Service-role client confined to `import "server-only"` modules | ✅ — `simulation-start.ts`, `simulation-hang.ts`, `play-page-data.ts`, `activity.ts` all server-only |
| Phase 7 schema changes | ✅ two migrations: `20260527120000_phase_7_simulation_play.sql` (additive columns + `simulation_activity` table) and `20260528120000_phase_7_door_hanger_hang_rpc.sql` (Postgres function), plus the small `20260528120100_phase_7_door_hanger_hang_rpc_lockdown.sql` follow-up |
| `simulation_activity` RLS posture | ✅ Pattern B (members SELECT; writes via service-role helpers only) |
| Cross-workspace leakage check | ✅ — 0 `mode='simulated'` sessions and 0 `simulation_activity` rows on the real Crystal Bear workspace |

---

## 7. Do-Not-Build audit

Audited against §14 of the Phase 7 doc + each appendix's "What did
NOT ship" section. Every item is confirmed **NOT** present in Phase 7
code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| CRM outcome generation from simulation | ✅ not built | DB rows = 0 after end-to-end Hang sequence; grep finds no `submitContactAndConvert` / `createContact` / `createLead` / `createQuote` / `createTask` calls in any Phase 7 module |
| Simulated quote requests | ✅ not built | No new code paths to `/q` server actions from `simulation*` |
| Contacts / leads / quotes / tasks / jobs / notes / issues / notifications from simulation | ✅ not built | Verified by row counts (all 0) + by code search |
| Delayed customer responses / timer / scheduled-job | ✅ not built | No timer / queue / `setTimeout` / job-runner code in any Phase 7 module |
| Message automation outcomes | ✅ not built | Phase 3 automation engine unchanged; Phase 6D GHL guardrail not reached |
| Customer messaging (real or simulated) | ✅ not built | No `notification_logs` rows written by Phase 7; no SMS calls |
| Real worker mobile app | ✅ not built | Web only |
| GPS / maps / pin / drawing / lasso UI | ✅ not built | No map / Leaflet / Mapbox / Google Maps imports; route_stops still updated by ordered-list pick |
| Route cooldown filtering | ✅ not built | RPC never reads `last_completed_at` for filtering; documented as deferred |
| Jobs / invoices / scheduling / appointments / payments | ✅ not built | No new tables / routes / actions |
| Full game economy (revenue / expenses / hiring / competitors) | ✅ not built | Out of scope; only cash field on `simulation_runs` and no mutations of it in Phase 7 |
| Plugin builder / plugin marketplace | ✅ not built | Plugin registry unchanged |
| Data import / export | ✅ not built | No importer / exporter code |
| AI / context-engine expansion | ✅ not built | No model imports |
| Edit / delete / archive on `simulation_runs`, sessions, routes, designs, campaigns, or `simulation_activity` | ✅ not built | Server actions exposed: `createSimulationRunAction`, `markSimulationRunActiveAction`, `startDoorHangerSimulationSessionAction`, `hangOneAction`, `hangCustomAction`, `hangRouteAction`, plus Phase 5B create flows. No edit/delete/archive endpoints |
| Multi-active sessions / multi-worker / parallel routes | ✅ not built | Start raises `SESSION_ALREADY_ACTIVE`; RPC `select for update` serialises concurrent calls |
| Real → simulation data copying | ✅ not built | Simulation workspace populated by direct operator work; no cloning from real Crystal Bear |
| Public `/q` changes | ✅ not built | `/q` route unchanged; build size identical (6.54 kB) |
| Operator-initiated Finish-route control | ✅ not built | Auto-finish only when a Hang exhausts the route; documented as deferred to Phase 7D-3+ |

The Phase 1 + 2 + 3 + 4 + 5 + 6 Do-Not-Build lists also remain in
force; nothing in Phase 7 touched any of those items.

---

## 8. Regression checks

| Surface | Status |
|---|---|
| `/admin` loads in real + simulation workspaces | ✅ — build green; nav active-state fix (`resolveActiveNavHref`) verified by 7 new unit tests |
| `/admin/simulation` (Saves) still works | ✅ — Phase 6C UI unchanged |
| Workspace switcher still works | ✅ — Phase 6D code unchanged |
| Simulation Mode banner still works | ✅ — Phase 6D code unchanged; reads same `getActiveSimulationRun` Phase 7 mutates via Hang RPC |
| `/admin/marketing/door-hangers` still works | ✅ — manual create flows untouched; only the door-hangers route revalidates on Hang RPC completion |
| Manual Door Hanger create / session logging still works | ✅ — `createDistributionSession` write path unchanged; new session columns are all NULLable so real-mode rows continue to insert cleanly |
| RentCast route generation code remains intact | ✅ — `src/core/door-hanger/rentcast-*` untouched |
| `/admin/contacts` + `/admin/quotes` load | ✅ |
| `/admin/message-automations` loads; Phase 3E engine intact | ✅ |
| `/q` loads + builds | ✅ — 6.54 kB unchanged from Phase 6 |
| Sidebar highlights one nav item per page (no double-highlight on `/admin/simulation/play`) | ✅ — fixed in Phase 7C; pinned by `resolveActiveNavHref` tests |

---

## 9. Known issues / accepted limitations

None of these block Phase 7 sign-off.

1. **Hang actions and Start session do not share a transaction.**
   Start session writes (insert session + flip route + append
   activity) are ordered in TS code without a DB transaction —
   matches the existing Phase 5B `createDistributionSession` posture
   and is documented inline. Hang actions, which are the
   atomicity-critical path, do use a single PG function transaction.
2. **`route_has_stops` heuristic in the play-page progress preview**
   uses `routeTotalStops > 0` as a proxy for "stops exist". For
   Phase 7's 1:1 mapping (one hanger = one stop completion), this is
   correct. If a future phase introduces partial / skipped /
   non-1:1 stops, the preview will diverge from the RPC's exact
   pending-stops count. The RPC remains authoritative; the preview
   is best-effort.
3. **`anon` + `authenticated` had to be explicitly revoked** from the
   Hang RPC because Supabase's default privileges grant EXECUTE on
   `public.*` functions to those roles, overriding `revoke from
   public`. Future Phase 7+ functions need the same lockdown.
4. **No operator-initiated Finish-route control.** Auto-finish only
   when a Hang action exhausts the route. Manual Finish-early
   (paused-session state) is deferred to a follow-up sub-phase.
5. **No automated browser tests** for the play surface, start form,
   or Hang controls. The build + lint + 518-test suite covers the
   data layer + pure helpers + nav slot wiring; browser-level
   confirmation was done manually during Phase 7D-1 and Phase 7D-2
   rollout and is captured here, not in CI.
6. **No automated integration test for the Hang RPC.** A PG-side
   test would need either pgTAP or a test DB harness; neither is in
   the project. The Phase 7B pure helpers (40 tests) cover the
   equivalent decision rules in TS, and the end-to-end Hang
   sequence in §4.4 verifies the RPC's behaviour against the linked
   Supabase project.
7. **Cap-by-inventory and cap-by-stops branches were not exercised
   in the manual end-to-end run** because the request never exceeded
   the cap. They are pinned by `computeEffectiveHangCount` unit
   tests (Phase 7B) and by RPC §7 conditional branches that mirror
   the TS helper.

---

## 10. Readiness verdict

**Phase 7 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 518 / 518, `lint`, `build`).
- All Definition-of-Done criteria pass.
- DB-side verification confirms the Phase 7B columns, the
  `simulation_activity` table + RLS posture, the Hang RPC's
  `security definer` posture, and the lockdown of EXECUTE to
  `service_role` + owner.
- End-to-end Hang sequence (1 + 25 + 74 = 100) exercised against the
  linked Supabase project: inventory, clock, session, route, route
  stops, and activity rows all updated atomically; zero CRM rows
  created.
- The Do-Not-Build audit is clean.
- The security / schema review is clean.
- Phase 1 / 2 / 3 / 4 / 5 / 6 regression checks pass.
- Known issues are minor and documented.

Next-phase work should start from a new source-of-truth doc — Phase 7
deliberately stops at "first playable simulation loop, no CRM
outcomes." Future scope candidates (Phase 8+, exact naming TBD):

- Operator-initiated Finish-route (early end with paused session).
- Simulation outcomes — delayed quote-request / contact / lead /
  task generation from completed Door Hanger routes, flowing through
  the same Phase 3 automation engine real `/q` submissions use.
- Route cooldown filtering on RentCast route generation, using
  `door_hanger_route_stops.completed_at` (added in Phase 7B).
- A real plugin framework / plugin builder that codifies the
  simulation adapter contract Phase 7 implemented by hand.
- Cash mutation as gameplay progresses (Hang actions could debit
  `current_cash_cents` by `material_cost_cents` once a real
  economy lands).
