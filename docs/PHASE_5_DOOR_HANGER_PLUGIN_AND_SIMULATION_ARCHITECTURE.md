# Phase 5 — Door Hanger Plugin + Simulation Architecture

**Status:** source-of-truth design doc for Phase 5.
**Created:** 2026-05-25.
**Updated:** 2026-05-25 (Phase 5A-2 product / design addendum — see
**Appendix A** at the end of this file).
**Scope:** docs only (Phase 5A + 5A-2). No app code, business logic,
or schema changes in either step.

> The original §§1–15 below capture the architecture for plugin-backed
> simulation and the long-term Door Hanger model.
> **Appendix A** layers product / design decisions on top and **supersedes
> earlier sections where they conflict** — most notably scope (§§9–10),
> implementation plan (§14), and the Do-Not-Build list (§13). The
> simulation loop has been pushed out of Phase 5; Phase 5 now focuses on
> the real Door Hanger Plugin + address-based RentCast route generation.

This document defines the long-term direction for plugin-backed
business simulation, the first concrete plugin that will support it
(Door Hanger), and what Phase 5 actually builds vs. defers.

> Required reading before starting Phase 5 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md`
> - `docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`
> - `docs/PHASE_4_QA_REPORT.md`
> - existing plugin registry under `src/core/plugin-registry/*`
> - existing plugins under `src/plugins/{customer-quote-sales-page,window-cleaning-auto-quote}/*`

---

## 1. Phase 5 Purpose

Phase 5 is an architecture / planning phase for three threads that
share a foundation:

1. **Door Hanger Plugin** — the first real marketing-channel plugin
   that produces inventory, campaigns, routes, and distribution
   sessions.
2. **Plugin-backed simulation architecture** — a model where every
   simulated business action is backed by a real plugin's
   capabilities, not by simulator-only fakery.
3. **Simulation time model** — a clock the simulator advances when
   actions are executed.

The long-term vision is a realistic business simulator that produces
realistic CRM data because the *real* plugins were exercised
(simulated, but exercised through the real adapters).

**Phase 5A is docs only.** No new app code, no new schema, no new
business logic. Even within later sub-phases the simulator itself is
mostly architecture — see §10 for the recommended build scope.

---

## 2. Core Principle — Simulation only uses real capabilities

**If a marketing method or business action can appear in the
simulator, it must be backed by a real plugin or a real core
capability.**

The simulator is the *operator* of plugins, not a separate parallel
business engine. It calls plugin simulation adapters; it does not
invent its own actions.

### Examples

| Simulated action | Required real plugin / capability |
|---|---|
| Door hanger distribution | Door Hanger Plugin (Phase 5B) |
| Facebook ads | Facebook Ads Plugin (future) |
| Google ads | Google Ads Plugin (future) |
| Hiring decisions | Hiring / HR Plugin (future) |
| Send customer SMS | Existing messaging engine + a customer-SMS plugin (post-Phase 3) |
| Schedule a job | Scheduling plugin + Jobs core (future) |

### Forbidden

- Simulator-only marketing actions that have no real plugin equivalent.
- Hardcoded "fake" outcomes inside the simulator (response rates etc.
  belong to the plugin's assumption model, not the simulator).
- Synthetic data injection that bypasses the plugin's normal write
  path.

This keeps the simulator honest: anything you can do in the simulator,
you (or a real worker) could also do in the real product.

---

## 3. Realistic Until Physical Execution

The simulator should be realistic **up to the point of physical
execution**. The only thing being simulated is the human / physical
action; everything else (inventory, time, decisions, downstream
records) is real.

### Door hangers — real life

1. Design + print door hangers.
2. Maintain inventory.
3. Plan a route.
4. Start the route.
5. Physically walk the route, hanging door hangers.
6. Some homeowners later call / request quotes.

### Door hangers — simulation

- **Inventory** — same model. The simulator decrements real inventory
  rows.
- **Routes / campaigns** — same models. The simulator selects a real
  route.
- **Time** — simulated time advances by the same per-action duration
  the plugin would use in real life.
- **Physical hanging** — replaced by:
  - "Hang 1 door hanger" button (single distribution event)
  - "Hang route" / fast-forward action (loops until route or inventory
    is exhausted)
- **Outcomes** — generated downstream by the same response-rate model
  the plugin would use to forecast real campaigns. Not Phase 5.

The simulator never side-steps the plugin's data model.

---

## 4. Plugin + Simulation Adapter Model

Every plugin that participates in the simulator exposes two surfaces:

### Real surface

- Owns the real business capability.
- Reads / writes plugin data through normal core paths
  (action registry, event bus, activity logger).
- Usable in real business operations.

### Simulation adapter

- Registered by the plugin (lives next to its real code).
- Knows how to simulate the plugin's real-world actions.
- Reads the plugin's assumptions + models.
- Generates simulated outcomes via the same write paths the real
  surface uses (no separate "simulated record" tables).
- Never bypasses the plugin's data model.

### Engine contract (sketch)

The simulator engine, when it lands, should consume a tiny
adapter-agnostic interface, e.g.:

```
type SimulationAdapter = {
  pluginKey: string;
  availableActions(state): Array<{ key, label, estimatedDurationSeconds }>;
  performAction({ actionKey, state, simulationContext }): Promise<{
    durationSeconds: number;
    deltas: { inventory?, sessions?, events?, ... };
  }>;
};
```

Phase 5A only **documents** this — it is not built.

### Where simulation adapters live

- For Phase 5: alongside the plugin in `src/plugins/<plugin>/simulation/*`.
- Long term: same place, kept structurally identical to the rest of
  the plugin so the plugin can be extracted as a package later.

---

## 5. Door Hanger Plugin — Long-Term Concepts

These are the entity shapes the Door Hanger Plugin will eventually
need. **Listed here for planning only — Phase 5A does not add schema.**

Naming follows the existing platform conventions
(`door_hanger_*` prefix, snake_case columns, `business_id` on every
row).

### `door_hanger_designs` (inventory line-item)

- `id` (uuid)
- `business_id`
- `name` / `version`
- `cost_per_hanger`
- `quantity_received`
- `quantity_used`
- `quantity_remaining` (derived or maintained)
- `received_at` / `created_at` / `updated_at`

### `door_hanger_campaigns`

- `id` / `business_id`
- `name`
- `message` / `offer_summary`
- `target_area`
- `goal` (text or structured)
- `assumptions` (jsonb — response rate, ideal density, etc.)
- `status` (`draft` | `active` | `paused` | `complete`)
- `created_at` / `updated_at`

### `door_hanger_routes`

- `id` / `business_id` / `campaign_id` (nullable)
- `name`
- `area` / `neighborhood`
- `estimated_doors`
- `route_type` (e.g. `single_family`, `townhomes`, `condos`)
- `density_label` (`low` | `medium` | `high`)
- `status` (`draft` | `ready` | `in_progress` | `completed` | `paused`)
- map / pin / GPS fields **deferred**.

### `door_hanger_distribution_sessions`

- `id` / `business_id` / `route_id`
- `started_at` / `ended_at`
- `user_id` (worker, nullable)
- `hangers_distributed`
- `time_spent_seconds`
- `notes`
- `mode` (`real` | `simulated`) — see §8 alternatives.

### `door_hanger_distribution_events`

- `id` / `business_id` / `session_id` / `route_id`
- `placed_at` (real or simulated timestamp)
- `property_id` (nullable, deferred)
- `mode` (`real` | `simulated`)

The plugin keeps `quantity_used` in sync with distribution events. The
exact write path (trigger vs. application code) is a Phase 5B design
decision.

---

## 6. Simulation Time Model

Document a single conceptual clock:

- The simulator has a **current simulated date/time** per
  simulation run.
- **Every action consumes simulated time.** No instant outcomes.
- The plugin's simulation adapter declares the per-action duration
  (`estimatedDurationSeconds`).
- "Fast-forward" actions are not free — they advance the clock by
  the sum of the underlying per-action durations (plus an optional
  variance the plugin owns).
- Future plugins compete for the same time budget (you can either
  hang door hangers OR clean windows OR design new hangers in a given
  simulated hour).

### Starter durations (door hangers — see §11)

| Action | Default duration |
|---|---|
| Hang 1 door hanger | 30 s |
| Hang 150-door route (uniform) | ~75 min |
| Design a door hanger | ~2 h (future) |
| Clean windows | future plugin |

These are **initial assumptions**, not hardcoded truth. The plugin
owns the assumption model and the simulator reads it.

---

## 7. First Playable Simulation Concept (forward-looking)

This is what the **first playable** simulation loop will eventually
feel like. Not committed to Phase 5 build — written here so the
plugin model in §4 + the time model in §6 stay aligned.

1. Operator picks a starting cash + scenario.
2. Operator picks a day / available actions.
3. Operator selects a door hanger route.
4. Operator clicks **Start Route** (creates a distribution session).
5. Operator clicks **Hang 1** or **Hang Route**.
6. Inventory decreases (real `door_hanger_designs.quantity_remaining`
   drops on the simulation workspace).
7. Simulated time advances per action.
8. The route / session progress updates as events accumulate.
9. **Later phase:** response-rate model generates delayed quote
   requests / leads / tasks in the CRM (still via the existing
   submit-contact + automation engines).

The simulator never injects records by hand — it walks the same
business code paths a real operator would.

---

## 8. Dataset Separation (real vs. simulation)

Operators must never see simulated rows mixed with real Crystal Bear
data, and resetting simulation must never risk real data.

### Options

**A — Separate simulation business / workspace (recommended)**

- Spin up a parallel `businesses` row (e.g. `crystal-bear-sim`) with
  its own full data tree.
- All existing RLS, scoping, admin shell, and active-business
  switching already work — no schema change.
- Easy reset: drop / recreate the workspace.
- Risk: identical UI, easy to mis-switch — must surface a clear
  "Simulation mode" banner.

**B — Same business with `is_simulation` flags everywhere**

- Add `is_simulation boolean` to every business-owned table.
- Pros: shared assumptions, single dashboard view.
- Cons: every existing query needs the filter; risk of leaking
  simulated rows into real queries; non-trivial migration.

**C — Simulation runs with `simulation_run_id` attached to records**

- Each simulation session/run gets an id; generated records reference
  it.
- Pros: many runs side-by-side, deletable per run.
- Cons: requires every plugin to consistently attach the id; the same
  every-query-needs-the-filter risk as B.

### Recommendation

**Option A as the primary mechanism**, optionally combined with
`simulation_run_id` metadata on plugin-owned records so a single
simulation workspace can host multiple historical runs without losing
provenance.

Reasons:
- Zero schema risk on existing core tables.
- Existing nav switching + RLS already make it safe.
- Operators get one-click safety (you are looking at the sim
  workspace, not Crystal Bear).
- If multi-run history matters later, layer C on top as plugin metadata.

**Phase 5A does not implement any of this.** Just documents the
options + recommendation.

---

## 9. Door Hanger Plugin — First Build Slice

If Phase 5B happens, this is the smallest meaningful slice:

### Real / plugin data only

- Plugin manifest + registration (matches existing
  `customer-quote-sales-page` / `window-cleaning-auto-quote` structure).
- Admin page: install / view plugin.
- Inventory list (`door_hanger_designs`).
- Campaign list.
- Route list.
- Manual distribution session entry (operator records what they did).
- Distribution events flow from sessions.

### Explicit deferrals

- No map / GPS / pin UI.
- No automated route generation.
- No CRM lead generation from door hangers.
- No worker mobile app.
- No commissions / pay.
- No customer messaging triggers.

This is the smallest slice that makes the Door Hanger Plugin **real**
(matters whether it is installed, has inventory, has routes) before
any simulation logic is wired.

---

## 10. Phase 5 Recommended Scope

Phase 5 is large in principle but the deliverables should stay narrow:

### Phase 5A — Docs only ✅ (this file)

### Phase 5B — Door Hanger Plugin Foundation

- Plugin manifest + registration.
- Admin page surface (under existing `/admin/plugins` detail patterns
  or a small dedicated area).
- Inventory / campaign / route / distribution-session models.
- Schema migration **only if approved**; otherwise rough out the data
  shapes in TypeScript and seed alongside future schema work.
- No simulation yet.

### Phase 5C — Door Hanger Simulation Loop Foundation

- Simulated route + simulated session.
- Start route → Hang 1 → Hang Route actions.
- Inventory decreases per simulated event.
- Simulated time advances per action.
- **No CRM outcome generation.** No leads, no quotes, no tasks
  produced from simulated distribution events.
- A "Simulation mode" badge wherever simulated workspace data is
  visible.

### Phase 6 — Simulation Outcomes (post-Phase 5)

- Completed routes generate delayed quote requests / leads / tasks
  via response-rate assumptions.
- Outcomes flow through the same `submitContactAndConvert` / Phase 3E
  automation paths as real `/q` submissions.
- Configurable response-rate model on the plugin.

### Out of scope for Phase 5 (any sub-phase)

- CRM lead generation from door hangers (Phase 6 earliest).
- GPS / maps / route optimization.
- Worker mobile app.
- Payments / commissions.
- Data import.
- Full simulation "game" (multi-day, AI competitors, growth loops).
- Production deployment of simulation mode.

---

## 11. Door Hanger Assumptions (initial, not locked)

Documented as **starter assumptions** for the future simulator. The
plugin will own these; the simulator only reads them.

| Assumption | Initial value | Notes |
|---|---|---|
| Time per door hanger | 30 s | uniform single-family default |
| Hangers per hour | ~120 | derived from 30 s |
| Response rate | configurable, deferred | per-campaign |
| Outcome delay | days to weeks | not instant |
| Density / route type modifiers | deferred | townhomes / condos / large homes affect per-hanger time |
| Weather / season / time-of-day modifiers | deferred | affect outcomes |

These numbers will be revisited once real-world data exists. Phase 5
must not lock them in code as immutable constants — they live in
plugin assumption JSON / config.

---

## 12. Admin / App Surface Placement

### Admin (in Phase 5)

- Plugin installation + config (existing `/admin/plugins`).
- Inventory / campaign / route management if added in Phase 5B
  (likely under a small dedicated `/admin/plugins/door-hanger` area or
  similar — finalize during 5B design).

### Future plugin app surface

- Dedicated **Door Hanger App** for route execution + simulation
  mode + (eventually) map / GPS.
- Not built in Phase 5.

### Future simulator app

- Picks actions from each plugin's simulation adapter.
- Advances time.
- Generates outcomes via the plugin's own write paths.
- Not built in Phase 5.

**Phase 5A creates no new app surfaces.**

---

## 13. Phase 5 Do Not Build

Pinned for clarity. These remain off-limits for Phase 5:

- GPS / maps / route-optimization
- Door-by-door property pins
- Worker mobile app
- Commissions / pay
- **CRM lead generation from door hangers** (Phase 6 earliest)
- Customer SMS triggers
- Jobs / invoices / scheduling
- Data import / export
- Full simulation outcomes / game loop
- AI / context-engine expansion
- New database schema in Phase 5A
- Production deployment of simulation mode

The full Phase 1 + Phase 2 + Phase 3 + Phase 4 Do-Not-Build lists
remain in force. If a Phase 5 task touches any of the above, **stop
and ask before changing code.**

---

## 14. Implementation Plan

### Phase 5A — Docs (this file) ✅

- Source-of-truth doc.
- Pointers in `CLAUDE.md` + `README.md`.

### Phase 5B — Door Hanger Plugin Foundation

- Plugin manifest under `src/plugins/door-hanger/`.
- Register via existing plugin registry path.
- Admin views (likely under the plugins detail page or a small
  dedicated `/admin/plugins/door-hanger/*` area; finalise in 5B).
- Real (non-simulated) inventory / campaign / route / distribution
  models. Schema migration only if explicitly approved.
- Manual distribution session entry.

### Phase 5C — Door Hanger Simulation Loop Foundation

- Simulation adapter for Door Hanger.
- Simulated route + session.
- Hang 1 + Hang Route actions.
- Inventory decrements + simulated time advances.
- Simulation-mode banner where simulated data is visible.
- **No CRM outcome generation.**

### Phase 5D — Phase 5 QA report

- Mirror of `docs/PHASE_4_QA_REPORT.md`.
- Definition-of-Done checklist (§15).
- Do-Not-Build audit.
- Security / schema check.

### Out of scope for Phase 5

- Anything in §13.
- Schema migrations beyond what 5B explicitly approves.
- Any change to the public `/q` flow.
- Any change to Phase 3 automations or Phase 4 CRM behavior.

If a fork requires anything above, **stop and ask.**

---

---

## Appendix A — Phase 5A-2 Product / Design Addendum

**Status:** addendum to the Phase 5 source-of-truth doc.
**Added:** 2026-05-25.
**Supersedes:** §§9, 10, 13, 14 where they conflict. The simulation
loop has been pushed to Phase 6+. Phase 5 now ships the real Door
Hanger Plugin plus address-based RentCast route generation.

### A.1 Revised Phase 5 scope

Phase 5 focuses on **two** deliverables:

1. **Door Hanger Plugin Foundation** — a real marketing tool with
   campaigns, inventory, routes, and distribution sessions.
2. **Address-Based RentCast Route Generation** — generate route stops
   from real property data given a center address + filters.

**Phase 5 does NOT build the simulation loop.** Simulation moves to
Phase 6+, after the real plugin + real route objects exist.

The plugin-backed simulation principle (§2) **still holds**: the Door
Hanger Plugin must exist as a real marketing tool before the
simulator uses its adapter.

### A.2 Marketing nav group

Door Hanger usage lives under a new **business-facing Marketing nav
group**, not only under Plugins.

```
Marketing
  └── Door Hangers              → /admin/marketing/door-hangers
```

Documented distinction:

| Layer | Purpose |
|---|---|
| **Plugins** (existing) | Technical capability layer — install / config / version / permissions / status. |
| **Marketing** (new) | Business workflow layer — how the operator actually uses the capability day-to-day. |

The Plugins detail page for Door Hanger continues to surface technical
status. Marketing → Door Hangers is where the operator does work.

### A.3 Door Hanger main page design

`/admin/marketing/door-hangers` is a **single dashboard page** with
four sections — not a multi-page module:

- **Campaigns** — active + recent.
- **Inventory** — designs / quantity remaining.
- **Routes** — recently created routes.
- **Recent distribution sessions** — last N logged sessions.

Sub-pages (campaign detail, route detail, etc.) are added only as
needed.

### A.4 Campaign-first workflow

Campaigns are the organizing object. The primary flow:

```
Create campaign
   ↓
Attach / use inventory design
   ↓
Create or generate route
   ↓
Log distribution session
```

Every other artefact (inventory, route, session) optionally references
a campaign so the operator can see "what came of this campaign?" in
one place.

### A.5 Create-only first

Phase 5B allows **create** for every object. **No edit / delete /
archive flows yet** unless a tiny correction is unavoidable (e.g. a
typo on an empty record).

- ✅ Create campaign
- ✅ Create inventory / design
- ✅ Create route (manual shell + RentCast-generated in 5C)
- ✅ Create distribution session
- ❌ Edit any record
- ❌ Delete any record
- ❌ Archive / status workflow management

Reads, lists, and filters are allowed and expected.

### A.6 Inventory / design model

Track quantity + cost from the operator's real printer price sheet
(manual entry — no price-sheet importer in Phase 5).

| Field | Notes |
|---|---|
| `name` | Required. |
| `version` / `offer` | Optional version label or short offer summary. |
| `quantity_received` | Required, integer. |
| `quantity_used` | Maintained by distribution sessions; starts at 0. |
| `quantity_remaining` | Derived (`received - used`) or maintained — Phase 5B picks the simpler path. |
| `total_print_cost` | Required, decimal — what the operator paid the printer. |
| `cost_per_hanger` | **Derived:** `total_print_cost / quantity_received`. Stored or computed; not user-entered. |
| `received_at` | Required, date. |
| `notes` | Optional. |

No support yet for partial restocks, multi-printer lots, or per-batch
costs — those are future iterations.

### A.7 Campaign model

Lightweight enough to start without locking long-term assumption
shapes:

| Field | Notes |
|---|---|
| `name` | Required. |
| `offer_summary` / `message` | Required. |
| `target_area` | Free-form text in Phase 5; structured later. |
| `status` | `draft` \| `active` \| `paused` \| `complete`. |
| `response_rate_assumption` | Optional decimal (e.g. 0.005 = 0.5%). |
| `quote_to_booking_assumption` | Optional decimal. |
| `average_job_value_assumption` | Optional decimal. |
| `notes` | Optional. |

The three assumption fields support future ROI + simulation but stay
optional so a campaign is usable without them.

### A.8 Distribution session model

The first form stays simple:

| Field | Notes |
|---|---|
| `campaign_id` | Required (campaign-first workflow). |
| `route_id` | Required when a route is being walked; optional for ad-hoc sessions. |
| `inventory_id` | Required — which design was used. |
| `date` | Required. |
| `hangers_distributed` | Required, integer. |
| `time_spent_minutes` | Required, integer. |
| `notes` | Optional. |

Optional calculated **display** (not form fields):

- material cost used (`hangers_distributed * cost_per_hanger`)
- expected quote-request range (campaign assumption × hangers)

Calculations stay read-only and never block the submit.

### A.9 Route + route-stops model

Routes are anchored to real property data. Manual route shells are
allowed as a fallback; the long-term primary path is RentCast-backed.

#### Route

| Field | Notes |
|---|---|
| `campaign_id` | Optional but encouraged. |
| `name` | Required. |
| `center_address` | Required for generated routes; optional for manual shells. |
| `radius_meters` (or `_miles`) | Required for generated routes. |
| `target_home_count` | Required for generated routes. |
| `property_filters` | jsonb — Phase 5C keeps these minimal (see §A.10). |
| `generated_from_source` | `manual` \| `rentcast`. |
| `status` | `draft` \| `ready` \| `in_progress` \| `completed` \| `paused`. |
| `total_route_stops` | Maintained from route_stops. |
| `estimated_time_minutes` | Derived from total_route_stops × per-hanger assumption (see §11). |

#### Route stop

| Field | Notes |
|---|---|
| `route_id` | Required. |
| `address` | Required. |
| `city` / `state` / `postal_code` | When known. |
| `latitude` / `longitude` | When RentCast returns coordinates. |
| `property_type` | When known. |
| `square_footage` | When known. |
| `estimated_value` | When known. |
| `rentcast_snapshot` | jsonb — safe subset of the RentCast response. |
| `stop_status` | `pending` \| `placed` \| `skipped`. |
| `sort_order` | Integer. |

Route stops mirror what Phase 1's property-data provider already
returns; reuse the existing core property-data abstraction.

### A.10 Address-based RentCast route generation

User flow (Phase 5C):

1. Enter a **center / start address**.
2. Choose **target number of homes**, **radius**, and basic
   **property filters** (property type, optionally sqft / value range
   if easy).
3. Generate candidate homes from RentCast.
4. **Preview** candidates — count, sample, totals.
5. Remove obvious bad fits if supported (deselect rows).
6. Save → create route + route stops in one transaction.

### Hard rules

- **Preview before save.** A bad generated route must never auto-save.
- Filters in Phase 5C stay small: target count, radius, property type,
  optional sqft / value range only if trivial.
- **No map / GPS / drawing / pin UI.**
- **No route optimization** (ordering, TSP, etc.).
- **No door-by-door mobile worker app.**

The existing core property-data provider (`src/core/property-data/*`)
is the integration point. The plugin must not call RentCast directly
— it goes through the core abstraction, same as the Auto-Quote /
Customer Quote flow.

### A.11 Revised Phase 5 implementation plan

Supersedes §14.

| Step | Scope |
|---|---|
| **Phase 5A** | Original architecture doc (this file, §§1–15). |
| **Phase 5A-2** | This product / design addendum. Docs only. |
| **Phase 5B** | Door Hanger Plugin Foundation. Plugin manifest + registration. Schema migration **if explicitly approved**. New Marketing nav group. `/admin/marketing/door-hangers` dashboard with four sections (campaigns / inventory / routes / recent sessions). Create flows for campaign, inventory, manual route shell, distribution session. **No RentCast generation yet.** |
| **Phase 5C** | Address-Based RentCast Route Generation. Center-address input + filter form, RentCast preview, save → route + route_stops. No map, no GPS, no route optimization. |
| **Phase 5D** | Phase 5 QA report. |
| **Phase 6+** | Simulation loop (real plugin → simulation adapter), then simulation outcomes (delayed CRM leads). |

### A.12 Revised Do-Not-Build list

Supersedes §13. Phase 5 still does not build:

- **Simulation loop** (moved to Phase 6).
- **CRM lead generation from door hangers** (Phase 6 earliest).
- Response / outcome generation.
- GPS / maps / route optimization.
- Door-by-door property pin UI.
- Worker mobile app.
- Commissions / pay.
- Customer SMS triggers.
- Jobs / invoices / scheduling.
- Data import / export (including printer price-sheet importer).
- Full simulation game loop.
- AI / context-engine expansion.
- Production deployment of any simulation surface.
- Edit / delete / archive flows for the records introduced in 5B.
- Multi-page sub-modules under `/admin/marketing/door-hangers` beyond
  the single dashboard (sub-pages added only as need is demonstrated).

**Phase 5 MAY include new schema for the Door Hanger Plugin** — but
only inside Phase 5B and only if explicitly approved. Phase 5A and
Phase 5A-2 add no schema.

The full Phase 1 + 2 + 3 + 4 Do-Not-Build lists remain in force.



Phase 5A is complete when:

- Source-of-truth doc exists (this file).
- The plugin-backed simulation principle is documented (§2).
- The realistic-until-physical-execution rule is documented (§3).
- The plugin + simulation adapter model is documented (§4).
- Door Hanger plugin concepts are documented (§5).
- The simulation time model is documented (§6).
- The first playable simulation concept is documented (§7).
- Dataset separation options + recommendation are documented (§8).
- The recommended Phase 5 build scope is documented (§§9–10).
- Door hanger assumptions are documented as initial / unlocked (§11).
- Admin / app surface placement is documented (§12).
- The Phase 5 Do-Not-Build list is documented (§13).
- The implementation plan is documented (§14).
- `CLAUDE.md` and `README.md` carry a Phase 5 pointer.
- **No app code, no business logic, no database schema changes** in
  Phase 5A.

---

## Appendix B — Phase 5B-1 schema + plugin registration (delivered)

**Status:** schema + plugin registration only. Migration created but
**not applied**.
**Added:** 2026-05-25.

Phase 5B-1 ships the database foundation + plugin registration for
the Door Hanger Plugin. **No admin UI, no RentCast generation, no
simulation, no CRM lead generation from door hangers.** Files:

| File | Purpose |
|---|---|
| `src/plugins/door-hanger/manifest.ts` | Plugin identity + status / mode / source taxonomies that mirror the migration CHECKs. |
| `src/plugins/door-hanger/index.ts` | Barrel. |
| `src/plugins/door-hanger/manifest.test.ts` | Pins the constants to the migration's CHECK values. |
| `supabase/migrations/20260525120000_phase_5_door_hanger.sql` | 5 tables + indexes + CHECK constraints + RLS enable + members-SELECT policies. |
| `supabase/seed/phase_5_seed.sql` | `plugin_definitions` row + `installed_plugins` row for Crystal Bear. **No demo records.** |
| `supabase/seed/run_seed.sh` | Adds a third phase to the runner via a `apply_seed_plain` helper (no env placeholders). |
| `schema.md` §22b | Documents the five new tables. |

### Tables introduced

`door_hanger_designs`, `door_hanger_campaigns`, `door_hanger_routes`,
`door_hanger_route_stops`, `door_hanger_distribution_sessions`. See
`schema.md` §22b for column-level reference. All money is stored as
`bigint` cents. Money / quantity columns carry CHECK ≥ 0; status /
source / mode columns carry CHECK enums that mirror the TypeScript
constants in `manifest.ts`.

### RLS posture

Pattern B (matches Phase 1 contacts/leads/quotes/tasks/events and the
Phase 3 notification tables): authenticated business members may
`SELECT`; `INSERT / UPDATE / DELETE` go through controlled admin
server actions using the service-role client (added in Phase 5B-2).

### Not applied

The migration and seed are **created but not yet applied**. The
operator runs `supabase db push` (or equivalent) and
`supabase/seed/run_seed.sh` when ready. Re-applying is safe: the seed
is idempotent and the migration uses `DROP POLICY IF EXISTS` for all
RLS policies.

---

## Appendix C — Phase 5C RentCast route generation (delivered)

**Status:** address-centered route generation. UI lives at
`/admin/marketing/door-hangers` under the existing **Routes** section.

### Files

| File | Purpose |
|---|---|
| `src/core/door-hanger/rentcast-candidates.ts` (+ test, 16 cases) | Pure helpers: target clamp (≤500), search-query builder, candidate safe-subset normaliser, dedup + cap, Haversine distance, generation-input validator, `RENTCAST_PREVIEW_REQUEST_COUNT = 1`. |
| `src/core/property-data/rentcast-search.ts` | Server-only `searchPropertiesByRadius` — ONE `GET /v1/properties?latitude=…&longitude=…&radius=…&limit=…&propertyType=…` per call. |
| `src/core/door-hanger/rentcast-route.ts` | Server-only orchestrator: `generateRoutePreview` (validate → Google `getPlaceDetails`+`normalizeAddress` → clamp → ONE RentCast call → normalise) and `saveRentcastRoute` (insert route + route_stops; zero RentCast calls). |
| `src/app/admin/marketing/door-hangers/actions.ts` | `previewRentcastRouteAction` + `saveRentcastRouteAction`. |
| `src/app/admin/marketing/door-hangers/rentcast-route-form.tsx` | Client component: settings → preview → save. |
| `src/app/admin/marketing/door-hangers/page.tsx` | Wires the generator into the Routes section above the manual route form. |

### Behaviour

- **Address-centered.** Operator picks a center address via
  `GoogleAutocomplete`; we geocode through the existing core geo
  provider, so RentCast receives `latitude` / `longitude` / `radius`
  rather than a string address.
- **One batch RentCast request per preview.** UI surfaces
  "Estimated RentCast requests: 1" before generation. The save path
  uses the preview payload only — **zero additional RentCast calls**.
- **Target capped at 500.** RentCast's batch limit. Requests above
  that surface a friendly `OVER_BATCH_LIMIT` message; pagination is
  out of scope for Phase 5C.
- **Safe subset only.** Each candidate is normalised through
  `normalizeRentcastCandidate`; persisted `rentcast_snapshot` mirrors
  the existing property-data safe-subset shape (eight basic
  dimensions). Owner info / sale history / tax data are dropped.
- **Preview before save.** Operator sees candidate list with
  checkboxes (default all selected), can deselect bad fits, then
  saves. Save button label includes "(N stops, 0 RentCast requests)".
- **Route persistence.** `door_hanger_routes.generated_from_source =
  'rentcast'`; `center_address`, `center_lat`, `center_lng`,
  `radius_miles`, `target_home_count`, `total_route_stops`, optional
  `campaign_id`, status (`draft` or `ready`). One `door_hanger_route_stops`
  row per selected candidate.
- **No CRM, no simulation, no maps, no GPS, no optimization, no edit/delete.**

### Tests

40 new pure tests covering: preview-request-count constant = 1,
clamp ≤ 500, query-string shape, candidate dedup + cap, safe-subset
projection (asserts owner / sale-history fields are absent), Haversine
~0 self-distance, and form-input validation.
