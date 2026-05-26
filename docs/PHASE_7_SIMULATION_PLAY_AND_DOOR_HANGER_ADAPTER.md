# Phase 7 — Simulation Play Surface + Door Hanger Simulation Adapter

**Status:** source-of-truth design doc for Phase 7.
**Created:** 2026-05-26.
**Scope:** docs only (Phase 7A). **No app code, no business logic,
no schema changes** in this step.

This document defines the first playable simulation loop on top of the
Phase 6 simulation workspace + save-file foundation. Phase 7 wires the
Door Hanger Plugin's first **simulation adapter** so a user can
actually *operate* the plugin in simulation mode — start a simulated
route, hang door hangers, advance simulated time, and watch inventory
and progress drain — **without producing any CRM outcomes yet.**

> Required reading before starting Phase 7 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
>   (especially §§2–4, §6, §11 and Appendix A)
> - `docs/PHASE_5_QA_REPORT.md`
> - `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md`
>   (especially §§4–8 and Appendices B / C)
> - `docs/PHASE_6_QA_REPORT.md`
> - existing Door Hanger plugin: `src/plugins/door-hanger/manifest.ts`,
>   `src/core/door-hanger/*`, `src/app/admin/marketing/door-hangers/*`,
>   `supabase/migrations/20260525120000_phase_5_door_hanger.sql`
> - existing simulation workspace / save-file code:
>   `src/core/simulation/*`, `src/core/business/is-simulation-business.ts`,
>   `src/core/business/workspace-selection.ts`,
>   `src/components/admin/simulation-mode-banner.tsx`,
>   `src/components/admin/workspace-switcher.tsx`,
>   `src/app/admin/simulation/*`,
>   `supabase/migrations/20260526120000_phase_6_simulation_workspace.sql`,
>   `supabase/migrations/20260526130000_phase_6_simulation_runs.sql`

---

## 1. Phase 7 Purpose

Phase 7 is **Simulation Play Surface + Door Hanger Simulation Adapter**.

Goal: create the **first playable simulation loop** by letting the
operator:

- open a simulation play page,
- use an active simulation save (Phase 6C),
- operate the Door Hanger Plugin in simulation mode,
- start a simulated distribution route / session,
- hang door hangers (single, custom batch, or full route),
- advance simulated time per action,
- decrement inventory per action,
- update route / session progress per action,
- write simulation activity that is visible on the play page.

The question Phase 7 answers:

> Can the simulator safely operate a real plugin action through a
> plugin simulation adapter without creating fake CRM outcomes yet?

**Phase 7 must not produce CRM outcomes.** No simulated quote
requests, leads, contacts, tasks, jobs, automations, or customer
messages. Outcome generation is the *next* phase after Phase 7.

Phase 7 keeps the Phase 5 §2 principle: the simulator only operates
real plugin capabilities. It does not invent simulator-only actions.

---

## 2. Main Play Surface

Phase 7 introduces a single new admin route:

```
/admin/simulation/play
```

This is the **main simulation play page** — the operator's "game
board." It must feel like a play surface, not just another CRUD page.
Layout direction (final visual treatment lands in Phase 7C):

- **Header strip** — workspace name + "Simulation Mode" reinforcement,
  active save name, current simulated date/time, current cash. (Most
  of this is already on the persistent Simulation Mode banner shipped
  in Phase 6D; the play page surfaces a larger / richer version.)
- **Available plugin actions** — one card per plugin that exposes a
  simulation adapter and is installed on the simulation workspace.
  Phase 7 ships exactly one such card: **Door Hangers**.
- **Current work in progress** — when a Door Hanger simulated session
  is active, show the route name, total stops / remaining stops,
  hangers used / remaining inventory, elapsed simulated time,
  estimated finish time, and the four primary action buttons
  (Hang 1 / Hang custom / Hang route / Finish route).
- **Recent simulation activity** — reverse-chronological feed of the
  current save's `simulation_activity` rows (most recent N).

The page is gated (§3); when the gate fails it renders a small,
friendly empty state instead of any of the above.

Sibling page (`/admin/simulation`, Phase 6C) keeps its current
purpose: create / list / mark-active save files. `/admin/simulation/play`
is where the operator **uses** an active save. Both links live under
the existing Simulation nav group.

---

## 3. Active Save Required

`/admin/simulation/play` only renders the play surface when **both**
conditions are true:

1. The active business is a simulation workspace
   (`business.isSimulation === true`, sourced from the existing
   `ActiveBusinessSummary`).
2. There is exactly one `simulation_runs` row on that workspace with
   `status='active'` (sourced from `getActiveSimulationRun`,
   Phase 6C).

Failure states:

- **Active workspace is a real workspace** — render a friendly
  message: "Switch to a simulation workspace to play." Link to the
  topbar workspace switcher (Phase 6D). Do not auto-switch.
- **Simulation workspace has no active save** — render:
  "Create or select a simulation save first." Link to
  `/admin/simulation`. Do not auto-create.

Server actions Phase 7 introduces must independently enforce both
gates — the UI gate is informational, the server gate is
load-bearing. Reuse the Phase 6C / 6D guard pattern
(`NOT_SIMULATION_WORKSPACE`, `NO_ACTIVE_SAVE`).

Phase 7 does **not** auto-create saves, auto-mark a save active, or
allow editing / deleting a save from the play page. Those flows
remain Phase 6C's domain (create / mark-active only).

---

## 4. Plugin Simulation Adapter Principle

The Door Hanger simulation surface is **not** a separate plugin.
It is an **optional simulation adapter** that lives inside the real
Door Hanger Plugin (`src/plugins/door-hanger/simulation/*`).

Pinned rules:

- **Plugins may optionally expose a simulation adapter.** Most do
  not. A plugin without an adapter simply does not appear on the
  play page.
- The adapter is part of the same plugin package — same identity,
  same version, same install row, same `business_id` scoping, same
  manifest. It is *not* a separately installable thing.
- A future plugin framework / plugin builder will standardize the
  adapter contract (see Phase 5 §4 sketch and Phase 6 §8). Phase 7
  does not build the framework; it builds the **first** adapter by
  hand and documents what the framework will later codify.
- **Real surface and simulation adapter share data shapes.** A
  simulated distribution session is a row in
  `door_hanger_distribution_sessions` with `mode='simulated'` — not
  a row in a parallel `simulated_door_hanger_*` table. The workspace
  boundary (Phase 6 §2) is the safety boundary; `business_id` +
  `is_simulation` already prevent cross-workspace leakage.

What the Door Hanger Plugin will look like once Phase 7 is in:

```
src/plugins/door-hanger/
  manifest.ts                        (existing)
  index.ts                           (existing)
  manifest.test.ts                   (existing)
  simulation/
    adapter.ts                       (new in Phase 7B)
    assumptions.ts                   (new — default seconds_per_hanger etc.)
    adapter.test.ts                  (new)
```

Do **not** create a separate "Door Hanger Simulation" plugin
definition, separate `installed_plugins` row, or separate plugin key.
The single `door_hanger` plugin keeps both surfaces.

---

## 5. Door Hanger Simulation Actions

The Door Hanger simulation adapter supports exactly four operator
actions in Phase 7:

| Action | Operator intent |
|---|---|
| **Start simulated route** | Pick a route + inventory design + seconds-per-hanger; open one active simulated session. |
| **Hang 1** | Walk one door, hang one hanger. |
| **Hang custom** | Walk N doors, hang up to N hangers (bounded by remaining inventory + remaining stops / target). |
| **Hang route** | Walk the rest of the current route (bounded by remaining inventory). |

### 5.1 Start simulated route

Inputs:

- `route_id` — must belong to the active business and have
  `status` in (`draft` | `ready` | `paused`). `in_progress` and
  `completed` routes are not selectable in Phase 7.
- `design_id` — inventory line item with `quantity_remaining > 0`.
- `seconds_per_hanger` — integer ≥ 1. Default **30** (matches the
  Phase 5 §11 starter assumption and the Phase 5 §6 simulation
  time model). Operator can override per session.

Side effects:

- Create exactly one `door_hanger_distribution_sessions` row with
  `mode='simulated'`, the chosen route / design / campaign (resolved
  from the route's campaign), and the chosen `seconds_per_hanger`.
- Link the session to the active `simulation_runs.id` (see §9 +
  §12 schema needs).
- Set the route's `status='in_progress'`.
- Write a simulation_activity row: "Started route {route.name}".

If a session is already active for the current save (§9), reject
with a friendly error and link to the existing session.

### 5.2 Hang 1

- If the route has pending route stops
  (`door_hanger_route_stops.status='pending'`), mark the
  next-by-`stop_order` stop `status='completed'` and set its
  `completed_at` (see §12).
- If the route has no `route_stops` rows (manual-shell route), use a
  count-only fallback: increment the session's `hangers_distributed`
  against the route's `target_home_count` (or `total_route_stops`
  when set).
- Consume 1 unit of inventory: `door_hanger_designs.quantity_used += 1`.
  Reject (`INSUFFICIENT_INVENTORY`) when remaining inventory is 0.
- Increment the session's `hangers_distributed` by 1.
- Advance simulated time:
  `simulation_runs.simulated_current_at += seconds_per_hanger`.
- Write a simulation_activity row: "Hung 1 door hanger".

### 5.3 Hang custom

- Operator enters an integer `n ≥ 1`.
- Effective `n` is `min(n, remaining_inventory, remaining_stops_or_target)`.
  If the cap reduces the request, surface a non-blocking notice
  ("Capped to N — only N hangers left").
- If route stops exist: mark the next `effectiveN` pending stops
  `completed`, in `stop_order` ascending.
- If no route stops: count-only fallback, same as Hang 1.
- Consume `effectiveN` inventory.
- Increment `hangers_distributed` by `effectiveN`.
- Advance simulated time by `effectiveN * seconds_per_hanger`.
- Write a single aggregated simulation_activity row: "Hung N door
  hangers" (no per-hanger spam).

### 5.4 Hang route

- Effective `n` is `min(remaining_stops_or_target, remaining_inventory)`.
- If route stops exist: mark all remaining pending stops
  `completed`, in `stop_order` ascending.
- If no route stops: count-only fallback, same as Hang custom.
- Consume `effectiveN` inventory.
- Increment `hangers_distributed` by `effectiveN`.
- Advance simulated time by `effectiveN * seconds_per_hanger`.
- If the route is now exhausted (no pending stops left, or
  count-only target reached), call the §11 "Finish route" sequence.
- Otherwise, write a simulation_activity row: "Hung N door hangers"
  + a "Inventory used: N door hangers" follow-up.

### 5.5 Common rules

- Every action is a single server action that wraps all DB writes in
  one transaction. Partial commits are not acceptable — a
  half-decremented inventory with a half-advanced clock is a
  Phase 7 bug.
- Every action recomputes elapsed time as `effectiveN *
  session.seconds_per_hanger`, **not** wall-clock time. The
  operator's real wall-clock is irrelevant.
- Every action writes to `simulation_activity` (see §10).
- No action emits `events`, `activities`, `tasks`, `notifications`,
  `notification_logs`, or any other CRM-side row. Phase 7 must not
  call `publishEvent`, `createActivity`, or the message-engine SMS
  send path. Even via the Phase 6D guardrail, the SMS path is
  prohibited from Phase 7 — the play page must not trip it at all.

---

## 6. Route-Stop Based Execution

Phase 7's execution model is **route-stop based when route stops
exist**, **count-based fallback otherwise**.

Real-life Door Hanger execution will eventually involve:

- GPS auto-pause near a property,
- manual pin completion on a map,
- bulk completion by drawing or lasso-selecting pins.

**Phase 7 builds none of that.** No maps, no GPS, no pins, no
drawing UI. The simulator advances the same `door_hanger_route_stops`
rows that the future real-execution UI will eventually toggle from
`pending` → `completed`. By using the existing schema columns, we
guarantee the future real UI and the simulation adapter converge on
the same data shape.

When a route was created without route stops (manual-shell route,
no RentCast generation), the simulator falls back to a pure count:
`session.hangers_distributed` walks toward
`route.target_home_count ?? route.total_route_stops`. This keeps the
Phase 5B manual route fallback usable in simulation without forcing
the operator to invent stops.

---

## 7. Completion History + Cooldown

Door Hanger completion history matters in **both** real and simulation
modes. Phase 7 documents the intent and lays down the minimum
columns to support it (§12). Phase 7 does **not** build cooldown
filtering on route generation.

### Intent

- Each route stop / property should eventually show when it was
  **last completed** (across all routes). The property-level
  timestamp is the real targeting truth: "we hung a door hanger on
  this house 7 days ago — skip it."
- Each route should show when it was **last completed** (as a
  whole) — useful as a summary on the routes list.
- Default cooldown assumption: **do not hang another door hanger on
  the same property for at least 2 months.** Future cooldown values
  may vary by ROI, campaign performance, season, or marketing need.
- Property / stop-level last-completion is the targeting rule.
  Route-level last-completion is a convenience.

### Phase 7 scope

- Whenever the simulator marks a route stop `completed`, set its
  `completed_at` (see §12).
- Whenever a route is finished (§11), set the route's
  `last_completed_at`.
- **Do not** build cooldown filtering on route generation. That
  belongs to a future RentCast / route-generation improvement that
  joins against per-property history. Out of Phase 7 scope.

---

## 8. Time Model

The simulation clock is `simulation_runs.simulated_current_at`. Phase
7 introduces the first writes to that column (Phase 6C set it equal
to `simulated_start_at` at create time; nothing has advanced it yet).

### 8.1 Where seconds_per_hanger lives

- `seconds_per_hanger` is **session-level**. Set when the operator
  starts a simulated route; immutable for the life of that session.
- Stored on `door_hanger_distribution_sessions` (see §12). Default
  **30** seconds per hanger.
- The play page must display the active session's
  `seconds_per_hanger` and an operator-facing description of what it
  costs in simulated time per action:
  - "Hang 1 → +30 seconds"
  - "Hang custom 25 → +12 min 30 sec at 30 sec/hanger"
  - "Hang route → based on N remaining stops × 30 sec/hanger"
- Operator can change `seconds_per_hanger` only by starting a new
  session. (Phase 7 keeps "Start simulated route" as the only place
  this value is chosen.)

### 8.2 Advancing the clock

Every Hang action advances
`simulation_runs.simulated_current_at` by
`effectiveN * session.seconds_per_hanger`. The advance is part of the
same DB transaction as the inventory + session updates.

The clock advances monotonically. The `simulation_runs_simulated_current_ge_start`
CHECK (Phase 6C) means we never accidentally rewind it.

### 8.3 Future direction (not Phase 7)

- Route type / density / sqft modifiers may eventually suggest
  different per-hanger defaults (townhomes faster, large lots
  slower).
- Real-world GPS data can later inform per-route or per-stop
  durations.
- For Phase 7, all routes use the session-level default. Variance,
  pauses, and per-stop overrides are deferred.

---

## 9. One Active Door Hanger Session

Phase 7 allows **exactly one active Door Hanger simulation session
per active simulation save**. Meaning:

- At most one `door_hanger_distribution_sessions` row exists with
  `mode='simulated'`, `simulation_run_id = <active save id>`, and
  session status of `active` (see §12).
- Start simulated route fails (`SESSION_ALREADY_ACTIVE`) when one
  already exists. The play page should surface a "Resume current
  session" link instead of "Start" when this is true.
- No multiple workers, no parallel routes, no parallel campaigns in
  the same save. The current real-world Crystal Bear operation is
  one person — Phase 7 models exactly that.
- When the current session finishes (§11), the next Start is
  allowed.

If the existing schema cannot link a session to a save yet, Phase 7B
adds the minimum columns to make this rule enforceable (see §12).

---

## 10. Simulation Activity Log

Phase 7 adds a small **`simulation_activity`** table, separate from
the core `events` and `activities` tables.

Reason: simulation / game events must not pollute real CRM activity
streams, and the play page needs its own persistent, scoped feed.
Reusing `events` / `activities` would either leak simulated rows
into the existing observability pages or require every existing
query to add a simulation filter — both bad.

### 10.1 Shape (Phase 7B will land this)

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `business_id` | FK → `businesses(id)`, simulation workspace |
| `simulation_run_id` | FK → `simulation_runs(id)` ON DELETE CASCADE |
| `plugin_key` | text NULLABLE — `door_hanger` for Phase 7 |
| `action_type` | text NOT NULL — see §10.2 |
| `summary` | text NOT NULL — human-readable, one line |
| `simulated_at` | timestamptz NOT NULL — value of `simulation_runs.simulated_current_at` *after* the action |
| `created_at` | timestamptz NOT NULL default now() — real wall-clock |
| `metadata` | jsonb NULLABLE — optional structured payload |

RLS: Pattern B (members SELECT; writes via service-role admin server
actions). Mirrors `simulation_runs` and the Door Hanger tables.

### 10.2 Phase 7 action_type taxonomy

Pinned in TypeScript constants alongside the adapter. Initial set:

- `door_hanger.session_started` — "Started route {name}"
- `door_hanger.hang_one` — "Hung 1 door hanger"
- `door_hanger.hang_custom` — "Hung N door hangers"
- `door_hanger.hang_route` — "Hung N door hangers (route completion)"
- `door_hanger.time_advanced` — "Time advanced 12 minutes 30 seconds"
  (optional; may be folded into the hang-action summary)
- `door_hanger.inventory_used` — "Inventory used: N door hangers"
  (optional; may be folded into the hang-action summary)
- `door_hanger.route_completed` — "Route {name} completed"
- `door_hanger.session_completed` — "Session completed"

Final taxonomy is a Phase 7B decision; folding `time_advanced` and
`inventory_used` into the parent hang-action summary is the cleanest
default unless the play page demands the granularity.

### 10.3 Where the play feed reads from

`/admin/simulation/play` reads the most recent N (suggested: 50)
`simulation_activity` rows for the active save, ordered by
`created_at desc`. No pagination in Phase 7; if the feed grows past
50, the older rows are simply not shown.

---

## 11. Finish Route Behavior

When a Hang action exhausts the route (or the operator explicitly
clicks "Finish route" with stops remaining — see below), Phase 7
must:

- Mark the session **ended**: set `door_hanger_distribution_sessions`
  status / `ended_at` (see §12). `hangers_distributed` and
  `time_spent_seconds` reflect the final tallies.
- Mark the route `status='completed'` and set `last_completed_at`
  (see §12 + §7).
- Write a simulation_activity row: "Route {name} completed".
- Write a simulation_activity row: "Session completed".
- Show a placeholder copy block on the play page:
  > "Response / outcome generation will be handled in a future phase."

Phase 7 must **not**:

- Generate quote requests (no calls into
  `submitContactAndConvert` or any `/q` server action).
- Create `contacts`, `properties`, `leads`, `quotes`, `tasks`,
  `notes`, `issues`, or `notifications`.
- Trigger message automations (the Phase 3 GHL SMS path is already
  short-circuited by the Phase 6D guardrail; Phase 7 must not even
  call it).
- Create jobs, appointments, invoices, payments, recurring
  agreements, or any commerce record.

Operator-initiated "Finish route" (with stops still pending) is
permitted: it ends the session, marks the route `paused` (not
`completed`), and writes a "Session ended early" activity row.
Cooldown (§7) does **not** update on an early-end — `last_completed_at`
only sets when the route is genuinely complete.

---

## 12. Likely Schema Needs (Phase 7B Only)

Phase 7A does **not** add schema. The following gaps were identified
by reading the Phase 5 + Phase 6 migrations against §§5, 9, 10, 11.
Phase 7B will land them in a single migration, gated on explicit
approval.

### 12.1 `door_hanger_distribution_sessions` — new columns

| Column | Type | Notes |
|---|---|---|
| `simulation_run_id` | uuid NULLABLE FK → `simulation_runs(id)` ON DELETE SET NULL | NULL for `mode='real'`; required for `mode='simulated'` (enforced in application code). |
| `seconds_per_hanger` | integer NULLABLE | Required for `mode='simulated'` (enforced in application code); NULL for `mode='real'`. CHECK ≥ 1 when set. |
| `status` | text NOT NULL default 'completed' | CHECK in (`active`, `completed`, `paused`). Existing real-mode rows backfill to `'completed'` since they were logged after the fact. |
| `started_at` | timestamptz NULLABLE | Set when status flips to `active`; mirrors `distributed_at` for `mode='real'` historical rows. |
| `ended_at` | timestamptz NULLABLE | Set when status flips to `completed` or `paused`. |

Existing column behavior is unchanged for `mode='real'`. The four new
columns are NULL-allowed precisely so the existing Phase 5B-2
manual-log path keeps working without code changes.

### 12.2 `door_hanger_routes` — new column

| Column | Type | Notes |
|---|---|---|
| `last_completed_at` | timestamptz NULLABLE | Set when §11 "Finish route" succeeds. NULL until then. |

### 12.3 `door_hanger_route_stops` — new column

| Column | Type | Notes |
|---|---|---|
| `completed_at` | timestamptz NULLABLE | Set when status flips to `completed` (§5.2 / §5.3 / §5.4). NULL otherwise. Stays in sync with the existing `status` column. |

### 12.4 `simulation_activity` — new table

Shape per §10. Indexes: `(business_id)`, `(simulation_run_id, created_at desc)`,
`(business_id, created_at desc)`. RLS Pattern B.

### 12.5 What is **not** changing in Phase 7

- `simulation_runs` — no new columns. The active save already carries
  `current_cash_cents` and `simulated_current_at`, which is what
  Phase 7 mutates.
- `door_hanger_designs` — no new columns. `quantity_used` /
  `quantity_received` + the existing CHECK already enforce
  "no overdraft."
- `door_hanger_campaigns` — no new columns. Phase 7 does not change
  campaign-level state.
- `businesses` — no new columns. `is_simulation` already gates the
  workspace boundary.
- No new core CRM tables, no new automation tables, no new
  notification tables.

If implementation review surfaces a need for additional columns
(e.g. a `paused_at` on the session for accurate pause tracking),
fold them into the same Phase 7B migration rather than ship a
follow-up.

---

## 13. Recommended Implementation Plan

Phase 7 splits into five sub-phases. Each subsequent sub-phase is
gated on the previous one passing review. If the architecture
surfaces a safer order (for example, the activity table needing to
land before the play page so the feed renders empty-state-correctly),
adjust during implementation review.

### Phase 7A — Docs only ✅ (this file)

- Source-of-truth doc (this file).
- Phase 7 pointer paragraph in `CLAUDE.md`.
- Phase 7 status line in `README.md`.
- **No code, no schema, no business-logic change.**

### Phase 7B — Schema + adapter foundation (no UI gameplay)

- Single migration adding the §12 columns + `simulation_activity`
  table. RLS Pattern B on `simulation_activity`; new columns on
  existing tables inherit existing RLS posture.
- `simulation_activity` write helper + read helper (server-only,
  service-role for writes, user-context for reads).
- Door Hanger simulation adapter scaffold under
  `src/plugins/door-hanger/simulation/` (assumptions module +
  adapter shell + pure helper modules). No UI yet.
- Pure unit tests for clamp / cap / time-cost helpers.
- No `/admin/simulation/play` route yet.

### Phase 7C — `/admin/simulation/play` read-only shell

- Route exists, gated per §3.
- Renders active save header, "available plugin actions" list (with
  the Door Hanger card shown when the plugin is installed on the
  active simulation workspace), and the simulation_activity feed.
- "Start simulated route" / "Hang 1" / etc. buttons exist but are
  disabled with "Coming next" copy.
- No mutations from this page.

### Phase 7D — Gameplay actions

- Start simulated route action (§5.1) — server action + form on the
  Door Hanger card.
- Hang 1 / Hang custom / Hang route actions (§§5.2–5.4).
- Finish route handling (§11).
- Inventory decrement + simulated-time advance + simulation_activity
  write all in one transaction per action.
- Route-stop completion when stops exist; count-only fallback when
  not (§6).
- Completion timestamps on stops + routes (§7).
- Cap / clamp / friendly-error UX from §5.5 + §5.3.

### Phase 7E — Polish + QA report

- Manual + integration testing.
- Friendly empty / failure copy on the play page.
- `docs/PHASE_7_QA_REPORT.md` mirrors the Phase 6 QA report shape.
- Definition-of-Done checklist (§15).
- Do-Not-Build audit (§14).
- Security / schema review.

---

## 14. Phase 7 Do Not Build

Pinned for clarity. Phase 7 must not build any of:

- **CRM outcome generation from simulation** — no quote requests,
  contacts, properties, leads, quotes, tasks, jobs, notes, issues,
  notifications, or `notification_logs` writes from any Phase 7 code
  path.
- Delayed customer responses / timers / scheduled jobs that produce
  CRM rows later.
- Message automation outcomes (Phase 3 engine stays untouched).
- Customer messaging (real or simulated).
- Real worker mobile app or any field-execution UI.
- GPS / maps / pin / drawing / lasso UI.
- Route cooldown filtering (documented, deferred).
- Jobs / invoices / scheduling / appointments / payments.
- Full game economy (revenue model, expenses, hiring, retention,
  competitors, multi-day calendar planning).
- Plugin builder / plugin marketplace.
- Data import / export (including printer price-sheet importer).
- AI / context-engine expansion.
- Edit / delete / archive flows on simulation_runs, sessions,
  routes, designs, campaigns, or simulation_activity. Start +
  Finish + Pause-as-end are the only state transitions; the rest
  stays create-only.
- Multi-active sessions, multi-worker, parallel routes.
- Real → simulation data copying (the simulation workspace is
  populated by direct operator work or by Phase 6's seed, not by
  cloning real Crystal Bear data).
- Any change to the public `/q` flow.
- Any change to Phase 1 / 2 / 3 / 4 / 5 / 6 behavior beyond the
  additive columns in §12.

The Phase 1 + 2 + 3 + 4 + 5 + 6 Do-Not-Build lists remain in force.
If a Phase 7 task touches any of the above, **stop and ask first.**

---

## 15. Success Definition

Phase 7 is successful when:

- `/admin/simulation/play` exists and is reachable from the
  Simulation nav group.
- The play page renders only when the active workspace is a
  simulation workspace **and** an active save exists; otherwise
  it shows the §3 empty states.
- The Door Hanger simulation adapter is implemented and surfaces a
  card on the play page.
- The operator can **start exactly one** simulated Door Hanger
  session per active save.
- `seconds_per_hanger` is stored on the session and visible on the
  play page.
- The operator can run Hang 1 / Hang custom / Hang route, each as a
  single transactional server action.
- Inventory decrements correctly and overdrafts are rejected.
- Simulated time advances by `effectiveN * seconds_per_hanger`
  every action.
- Route-stop status flips `pending → completed` (in `stop_order`)
  when stops exist; count-only fallback advances when they do not.
- Route and session progress (remaining stops / used hangers /
  elapsed simulated time) update after every action.
- `simulation_activity` rows are written for every action and the
  feed updates on the play page.
- Finishing a route marks the session ended, the route completed,
  and sets `last_completed_at` (§§7, 11).
- **No CRM outcomes are generated** — `contacts`, `properties`,
  `leads`, `quotes`, `tasks`, `notes`, `issues`, `notifications`,
  `notification_logs` all show zero new rows from any Phase 7 code
  path.
- The Phase 6D GHL SMS guardrail is not even reached from Phase 7
  code (no SMS call attempts at all, simulated or otherwise).
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass.
- `docs/PHASE_7_QA_REPORT.md` exists and signs off the
  Definition-of-Done above + Do-Not-Build audit (§14).
- `CLAUDE.md` carries a Phase 7 pointer paragraph.
- `README.md` Status section names Phase 7 and links to this doc.

---

## 16. Phase 7A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [ ] `CLAUDE.md` carries a Phase 7 pointer paragraph.
- [ ] `README.md` Status section names Phase 7 and links to this doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 7A ends at docs only. Phase 7B is the first step that touches
code, and it only ships after this doc is reviewed and approved.

---

## Appendix A — Phase 7B schema + adapter scaffold (delivered)

**Status:** schema migration + simulation_activity helpers + Door
Hanger simulation adapter scaffold + pure unit tests created.
**Migration not applied** — the operator runs `supabase db push` (or
equivalent) when ready.
**Added:** 2026-05-27.

Phase 7B delivers the §§5, 7, 9, 10, 12 foundation: the additive
session / route / stop columns, the new `simulation_activity` table,
the server-only `appendSimulationActivity` / `listSimulationActivityForRun`
helpers, and the Door Hanger simulation adapter scaffold (assumptions
+ pure helpers + action / activity-type taxonomies). **No
`/admin/simulation/play` page, no gameplay UI, no CRM writes, no
message-engine calls.**

### Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260527120000_phase_7_simulation_play.sql` | Adds `simulation_run_id` / `seconds_per_hanger` / `status` / `started_at` / `ended_at` on `door_hanger_distribution_sessions`; adds `last_completed_at` on `door_hanger_routes`; adds `completed_at` on `door_hanger_route_stops`; creates `simulation_activity` table + indexes + RLS Pattern B (members SELECT). All `add column if not exists` / `create table if not exists` / guarded CHECK additions — idempotent. |
| `src/core/simulation/activity.ts` | Server-only `appendSimulationActivity` (insert via service-role; basic-input validation before DB round-trip) and `listSimulationActivityForRun` (read newest-first, limit-capped at 200, default 50). |
| `src/plugins/door-hanger/simulation/assumptions.ts` | `DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER = 30`, `[MIN, MAX] = [1, 600]`, pure `parseSecondsPerHanger` helper. |
| `src/plugins/door-hanger/simulation/helpers.ts` | Pure helpers: `computeEffectiveHangCount`, `computeTimeAdvanceSeconds`, `formatDurationSeconds`, `isRouteComplete`, activity-summary formatters. |
| `src/plugins/door-hanger/simulation/adapter.ts` | Action key taxonomy (`start_route` / `hang_one` / `hang_custom` / `hang_route` / `finish_route`), activity-type taxonomy (`door_hanger.session_started` / `.hang_one` / `.hang_custom` / `.hang_route` / `.route_completed` / `.session_completed` / `.session_ended_early`), `DOOR_HANGER_SIMULATION_ADAPTER` manifest, type guards. |
| `src/plugins/door-hanger/simulation/index.ts` | Barrel re-exporting the assumption + adapter + helper symbols. |
| `src/plugins/door-hanger/simulation/adapter.test.ts` | Pure unit tests for assumptions / taxonomies / manifest / `computeEffectiveHangCount` / `computeTimeAdvanceSeconds` / `formatDurationSeconds` / `isRouteComplete` / summary formatters. |
| `schema.md` §22d | Documents the additive columns + `simulation_activity` table. |

### Migration shape (§12)

The migration is additive and idempotent. Every alter uses `add
column if not exists`; every CHECK is wrapped in a guarded `do $$`
block; the new table uses `create table if not exists` plus `drop
policy if exists`. Re-applying in dev is safe.

- Existing Phase 5B-2 real-mode session rows backfill cleanly:
  `status` defaults to `'completed'`, the four other new columns
  default to NULL, and no application code change is needed for the
  Phase 5B-2 manual log path to keep working.
- "Simulated sessions must carry simulation_run_id + seconds_per_hanger"
  is enforced in application code (Phase 7D), not at the DB level,
  because Postgres cannot express the conditional cleanly without a
  trigger.
- `simulation_activity.simulation_run_id` cascades on delete to match
  the expected reset semantic — deleting a save wipes its gameplay
  feed.

### Adapter scaffold behavior

- `DOOR_HANGER_SIMULATION_ADAPTER` is a read-only manifest declaring
  the plugin key (`door_hanger`), version (matches the existing
  `DOOR_HANGER_PLUGIN.version`), the five Phase 7 action keys, the
  seven Phase 7 activity types, default seconds-per-hanger (30), and
  the parse range `[1, 600]`.
- No gameplay handlers are exported. Phase 7D wires the actual
  server actions; Phase 7C consumes the manifest to render the
  "available actions" card.
- `computeEffectiveHangCount` returns the smallest of `(requested,
  remainingInventory, remainingTargets)` with a `cappedBy` reason
  string (`REQUEST` / `INVENTORY` / `STOPS` / `ZERO`) so the play
  page can surface specific friendly errors.
- `computeTimeAdvanceSeconds` is `effectiveN * secondsPerHanger` with
  fail-safe defaults: non-finite `secondsPerHanger` falls back to
  `DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER`; `secondsPerHanger < 1`
  clamps to 1; negative `effectiveCount` clamps to 0.
- `isRouteComplete` covers both branches of §6: when route stops
  exist, completion means zero remaining; without stops, completion
  means `hangersDistributedSoFar >= targetCount` (and is never
  complete when `targetCount` is null).
- Activity summary formatters are deterministic strings that match
  §10.2 — Phase 7D writes these into `simulation_activity.summary`.

### simulation_activity helper behavior

- `appendSimulationActivity` validates required fields (businessId,
  simulationRunId, actionType, summary, valid `simulatedAt`
  timestamp) before the DB round-trip, then inserts via service-role
  and returns a structured `{ ok: true, data: { activityId } }` /
  `{ ok: false, error }` result. Never throws.
- `listSimulationActivityForRun` reads newest-first by `created_at`,
  scoped to `(business_id, simulation_run_id)`, default limit 50,
  hard-capped at 200. Returns `[]` on any error (read failures are
  not surfaced to the play page — the feed is best-effort).
- Neither helper writes to `events`, `activities`, `tasks`,
  `notifications`, `notification_logs`, or any other core CRM table.
  The only DB target is `simulation_activity`.

### Tests added

- `src/plugins/door-hanger/simulation/adapter.test.ts` — 26+ pure
  unit tests covering: default + range constants, `parseSecondsPerHanger`
  happy + EMPTY + NOT_A_NUMBER + NOT_AN_INTEGER + OUT_OF_RANGE,
  pinned action-key + activity-type taxonomies, type guards, manifest
  shape, `computeEffectiveHangCount` (uncapped / inventory-cap /
  stops-cap / multi-cap / ZERO / negative / non-finite / fractional),
  `computeTimeAdvanceSeconds` (normal / zero / non-finite fallback /
  clamp / negative), `formatDurationSeconds` (sec / min / hr / hr+min
  / non-positive), `isRouteComplete` (both branches + edge cases),
  activity summary formatters (singular / plural / route-name fallback
  / completion variants).

### What Phase 7B deliberately does NOT do

- No `/admin/simulation/play` route, no play-page UI components.
- No Start / Hang 1 / Hang custom / Hang route / Finish server
  actions wired anywhere.
- No DB writes from any new code path (the helper is exported but
  not yet called from any action).
- No edit / delete / archive flows.
- No CRM table writes; the GHL SMS adapter is not called from any
  Phase 7B code.
- No changes to `/q`, `/admin/marketing/door-hangers` manual flows,
  `/admin/simulation` saves page, or Phase 3 message automations.

### Not applied

The migration is **created but not applied**. The operator runs
`supabase db push` when ready. The migration is forward-only and
idempotent — re-applying in dev is safe.

---

## Appendix B — Phase 7C `/admin/simulation/play` read-only shell (delivered)

**Status:** play page route + Simulation nav entry + read-only shell
shipped. **No gameplay actions, no DB writes from this page.**
**Added:** 2026-05-27.

Phase 7C delivers §§2 + 3 of the Phase 7 doc: a real
`/admin/simulation/play` route with three rendered states (real
workspace empty / no active save empty / play shell), a Door Hanger
available-actions card with disabled "Coming next" buttons, a
read-only current-session card, and the persistent
`simulation_activity` feed (Phase 7B helper) plumbed into the page.

### Files

| File | Purpose |
|---|---|
| `src/components/admin/nav-config.ts` | Added **Play** → `/admin/simulation/play` to the existing Simulation group (Saves stays first; Play sits second). |
| `src/components/admin/nav-config.test.ts` | Updated to pin the new Simulation group order. |
| `src/core/simulation/play-page-gate.ts` | Pure decision helpers: `resolvePlayPageGate` (real / no-save / play) and `computeSessionProgress` (uses route stops when present, target count otherwise). |
| `src/core/simulation/play-page-gate.test.ts` | 13 pure unit tests pinning gate decisions + progress edge cases (zero total, overflow, negative / NaN inputs, no-stops + no-target → null). |
| `src/core/simulation/play-page-data.ts` | Server-only read helpers: `getActiveDoorHangerSimulationSession` (returns the single active simulated session for a save with joined route / campaign / design names + design remaining) and `isDoorHangerPluginEnabled` (resolves `plugin_definitions` then checks `installed_plugins.status = 'enabled'`). |
| `src/app/admin/simulation/play/page.tsx` | The page itself. Three gate branches; renders inside `AdminShell` with the existing workspace switcher + simulation banner slots; consumes `getActiveSimulationRun` (Phase 6C), the two new server-only loaders, and `listSimulationActivityForRun` (Phase 7B). |

### Page behavior (gate)

The gate runs after auth + active-business resolution:

- **Active workspace is real (`isSimulation === false`)** — renders
  the page header + a single `SectionCard` with an `EmptyState`
  titled "This is not a simulation workspace" and instructions to
  use the topbar switcher. Door Hanger / session / activity loaders
  are **not** called.
- **Simulation workspace, no active save** — same shell, with
  "Create or select a simulation save first" and a Link → `/admin/simulation`.
  Loaders are still not called.
- **Simulation workspace + active save** — the full play shell
  renders (header → available plugin actions → current Door Hanger
  work → recent simulation activity).

### Play shell sections

1. **Active save card** — name, status badge, workspace name,
   simulated current time, current cash, simulated start. Data
   sourced from `getActiveSimulationRun` (Phase 6C).
2. **Available plugin actions** — one Door Hanger card when the
   plugin is enabled on the active workspace; otherwise an
   `EmptyState`. The Door Hanger card renders four disabled buttons
   (Start simulated route / Hang 1 / Hang custom / Hang route) with
   `aria-disabled` + a "Coming next" pill + a footnote stating
   gameplay lands in Phase 7D. Hang buttons stay disabled regardless
   of active-session state; Start is the only one that *would*
   activate first in Phase 7D, but Phase 7C keeps all four disabled.
3. **Current Door Hanger work in progress** — read-only. When an
   active simulated session exists for the save, shows route name,
   campaign name, design name, design remaining, session status,
   hangers distributed, seconds per hanger (with a human-readable
   per-hanger duration via `formatDurationSeconds`), total route
   stops, target home count, percent progress, started timestamp,
   and a thin progress bar driven by `computeSessionProgress`. When
   no active session exists, shows an `EmptyState`.
4. **Recent simulation activity** — most recent 50 rows from
   `listSimulationActivityForRun` (Phase 7B helper). Each row shows
   the summary, the `plugin_key · action_type` line, and both the
   `simulated_at` (prefixed "sim") and `created_at` wall-clock
   stamps. Empty state when none.

### Strictly read-only

- The page calls no server actions and no `*_create` helpers. The
  only DB calls are `getActiveSimulationRun`, `isDoorHangerPluginEnabled`,
  `getActiveDoorHangerSimulationSession`, and
  `listSimulationActivityForRun` — every one is read-only.
- No CRM table writes occur from any new code path. No
  `notification_logs`, `events`, `activities`, `contacts`, `leads`,
  `quotes`, `tasks`, or `notes` rows are written.
- The persistent Simulation Mode banner (Phase 6D) still renders
  above the play page chrome via the existing
  `renderSimulationBanner` slot — no banner duplication.

### Tests

- `src/core/simulation/play-page-gate.test.ts` — 13 pure unit tests
  covering the three gate outcomes + edge cases (empty / undefined
  active id, real-workspace-wins-over-active-id) and
  `computeSessionProgress` (route-stops vs. target-count branch,
  no-data null, zero total, overflow cap, negative / NaN inputs).
- `src/components/admin/nav-config.test.ts` — existing "Simulation
  group" test updated to require both `/admin/simulation` and
  `/admin/simulation/play`.

### What Phase 7C deliberately does NOT do

- No Start simulated route action — the Phase 7D server action
  doesn't exist yet.
- No Hang 1 / Hang custom / Hang route mutations.
- No inventory decrements, no simulated-time advances, no
  simulation_activity inserts from clicking anything on this page
  (buttons are HTML-disabled).
- No CRM outcomes, no message-automation calls.
- No edit / delete / archive on simulation_runs, sessions, routes,
  designs, campaigns, or simulation_activity.
- No maps / GPS / pin / drawing UI.
- No route cooldown filtering.
- No new schema, no migration.
