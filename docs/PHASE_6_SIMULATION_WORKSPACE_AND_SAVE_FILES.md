# Phase 6 — Simulation Workspace + Save Files Foundation

**Status:** source-of-truth design doc for Phase 6.
**Created:** 2026-05-25.
**Scope:** docs only (Phase 6A). **No app code, no business logic,
no schema changes** in this step.

This document defines the foundation for realistic business
simulation by separating real data from simulated data and introducing
simulation save files / runs. Phase 6 does **not** build Door Hanger
gameplay, simulation outcomes, or any CRM-side generation from
simulated activity.

> Required reading before starting Phase 6 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
>   (especially §§2–8 and Appendix A)
> - `docs/PHASE_5_QA_REPORT.md`
> - `docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`
> - existing active-business code: `src/core/business/active-business.ts`,
>   `src/components/admin/admin-shell.tsx`,
>   `src/components/admin/admin-topbar.tsx`,
>   `src/components/admin/nav-config.ts`,
>   `src/components/admin/admin-shell-props.ts`
> - existing plugin manifest pattern under `src/plugins/door-hanger/manifest.ts`
>   and `src/core/plugin-registry/*`

---

## 1. Phase 6 Purpose

Phase 6 is **Simulation Workspace + Save Files Foundation**.

Goal: build the safe container for simulation **before** building
gameplay. Phase 5 shipped a real Door Hanger Plugin and
RentCast-backed route generation; Phase 6 makes it safe to *play*
with that plugin without polluting Crystal Bear's real customer data.

The long-term simulator (Phase 5 §§2, 4, 6, 7) should eventually let
business owners play out decisions using real platform plugins.
**Phase 6 only creates the workspace + saves foundation** —
gameplay (Hang 1, Hang Route, simulated outcomes, delayed CRM leads)
remains deferred to Phase 7+.

---

## 2. Core Principle — Simulation data must not mix with real data

Simulated records (door hangers, future jobs, future leads, etc.)
must never appear in Crystal Bear's real CRM. Resetting or replaying
a simulation must never risk real data.

**Preferred approach (matches Phase 5 §8 recommendation):**

- Use a **separate simulation business / workspace** (e.g.
  `Crystal Bear Simulation`).
- Existing `business_id` scoping + RLS already separate simulated
  records from real Crystal Bear records — no new schema needed on
  existing core tables.
- Avoid `is_simulation` flags on every business-owned table; that
  pattern requires touching every existing query and risks leakage
  into real dashboards.

The simulation workspace is just another row in `businesses`. The
existing admin shell, RLS, nav, and plugin registry continue to work
because the *workspace boundary* is already the safety boundary.

If later phases need multi-run history *inside* one simulation
workspace, layer a `simulation_run_id` foreign key onto
**plugin-owned** records — never onto core CRM tables.

---

## 3. Workspace Model

Two clearly-labelled workspace types, both backed by the existing
`businesses` table:

| Workspace | Example name | CRM / plugin data | External side effects |
|---|---|---|---|
| **Real** | Crystal Bear Window Cleaning | Real customers, contacts, leads, quotes, automations. | Allowed per normal config (Phase 3 GHL adapter, future email, etc.). |
| **Simulation** | Crystal Bear Simulation | Simulated CRM / plugin data only. | **Disabled / mocked by default** (see §7). Clear UI banner required. |

Differences are conventional, not schema-level. A workspace is
"simulation" iff it carries a sentinel value (see below) — Phase 6
does not add new tables.

### Sentinel options (decided in Phase 6B)

Two options for marking a workspace as simulation:

- **A — slug convention.** Workspaces ending in `-sim` or named
  `Crystal Bear Simulation` are simulation. Zero schema change. Risk:
  silently breaks if someone renames the workspace.
- **B — single boolean on `businesses`.** Add
  `is_simulation boolean not null default false` in Phase 6B. One
  column, one place to read, easy to extend later. Recommended.

The full `is_simulation`-everywhere model (Phase 5 §8 Option B) is
explicitly **not** adopted; the boolean lives only on `businesses`,
not on every business-owned table.

Phase 6A documents this; Phase 6B picks one when implementation starts.

---

## 4. Save File / Run Model

The workspace is the **container**. A save file / run is a
**playable timeline** inside that container.

Examples:

- "Starter save — $1,000 starting cash"
- "Growth save — $10,000 starting cash"
- "Door-hanger-heavy strategy, May 2026 start"

A save / run record should eventually track:

| Field | Notes |
|---|---|
| `id` | uuid PK |
| `business_id` | FK → simulation workspace (must be a simulation `businesses` row). |
| `name` | Required. Human-readable. |
| `starting_cash_cents` | Required, bigint. |
| `current_cash_cents` | Maintained by gameplay (Phase 7+). Starts at `starting_cash_cents`. |
| `simulated_start_at` | timestamptz — initial simulated date/time. |
| `simulated_current_at` | timestamptz — advanced by future actions. Starts equal to `simulated_start_at`. |
| `status` | `draft` \| `active` \| `paused` \| `archived`. |
| `notes` | Optional. |
| `created_at` / `updated_at` | timestamptz. |

Money is stored as `bigint` cents (matches the Door Hanger plugin
convention from Phase 5B-1). All times are `timestamptz`.

Phase 6C may build the save/run **records + admin UI** (create / list
/ open / show active). **No gameplay actions are built in Phase 6** —
no Hang 1, no Hang Route, no simulated quote requests, no clock
advance buttons. Cash and the simulated clock are created and read,
never mutated by gameplay code.

---

## 5. Multiple Save Files

- Users should be able to **create multiple saves** inside a single
  simulation workspace.
- **Exactly one save is active at a time per workspace.** "Active"
  is the save the Simulation Mode banner names; it gates which save
  receives future gameplay writes.
- Active save selection is a small UI-driven update (`status='active'`
  on the chosen row, `status='paused'` on others — or a separate
  `active_simulation_run_id` pointer on `businesses`; Phase 6C decides).
- Listing shows: name, starting cash, current cash, simulated start /
  current date, status, last updated.
- Duplicate / clone / reset / archive flows are **future**, not Phase 6.
  Create + open + mark-active is enough.

---

## 6. Workspace Switching / UI

### Today

`src/core/business/active-business.ts` resolves the user's active
business from `business_memberships` (first active membership wins,
ordered by `joined_at`). There is **no switcher UI** — a user with
two memberships gets whichever sorts first.

The admin shell (`src/components/admin/admin-shell.tsx` +
`admin-topbar.tsx`) already displays `workspaceName` and surfaces the
amber **Staging mode** pill when `stagingToolsEnabled = true`. That
pill is the closest existing precedent for the Simulation Mode banner.

### Phase 6 recommendation

- Add the **smallest safe workspace switcher** (likely in the admin
  topbar or a small dropdown under the workspace name).
- Switcher entries come from the user's `business_memberships`. No
  invite/membership flows are added — the user already has membership
  in both Crystal Bear (real) and Crystal Bear Simulation (seeded in
  Phase 6B).
- Persist the active workspace per-user (Phase 6D decides: cookie,
  `user_profiles.active_business_id`, or extending
  `getActiveBusinessForUser` with an explicit selection).
- Add a **Simulation Mode banner** that renders only when the active
  workspace is a simulation workspace. The banner must show:
  - The literal phrase "Simulation Mode".
  - The active simulation workspace name.
  - The active save/run name (when one exists).
  - A short warning that real external side effects are disabled.
- The banner sits above the topbar or replaces the existing
  Staging-mode pill region — Phase 6D picks the exact placement.
- Switching must be **obvious and safe**: the workspace name changes
  immediately, the banner appears/disappears, and no in-flight admin
  action silently leaks across workspaces.

Existing nav, sidebar, plugin registry, and active-business loaders
already scope by `business_id`. The switcher is the only piece that
needs to land — everything downstream "just works" because every
query is already business-scoped.

---

## 7. Side-Effect Guardrails

The simulation workspace must **not** trigger real customer-visible
side effects. Allowed and disallowed behavior:

### Allowed inside a simulation workspace

- Internal UI events (banners, in-app activity rows, internal
  notifications).
- Simulated logs and synthetic events on plugin-owned tables that
  *only* exist inside the simulation workspace.
- Plugin data writes against the simulation workspace
  (`door_hanger_*` tables, future plugin-owned tables).
- Fake / simulated notification logs (e.g. "SMS would have been sent
  to +1…") if a future plugin needs the visibility.

### Disallowed by default

- Real SMS through the Phase 3 GoHighLevel adapter or any future SMS
  provider.
- Real customer emails.
- Real payment actions (Stripe, etc., when they land).
- Production integrations firing webhooks to external systems.
- Any real customer messaging — including templated automations.

### Where the guardrail lives

The guardrail is **server-side**, at the adapter boundary:

- The GoHighLevel SMS adapter (Phase 3) is the first concrete
  case. It must short-circuit to a no-op + simulated log when the
  active business is a simulation workspace.
- Future adapters (email, payments, etc.) must follow the same
  pattern: check the active business's simulation flag, return a
  structured `simulated_no_op` result.
- The active-business loader becomes the source of truth for "are
  we in simulation?" — adapters read the flag, not the workspace
  name.

Phase 6 documents this requirement. Implementation may add **only
the first guardrail** that is needed in Phase 6B/D (likely the GHL
adapter short-circuit) so the rule is enforced before any simulation
plugin runs.

---

## 8. Plugin Simulation Framework Direction (long-term)

Plugins **may optionally** expose a simulation adapter — not every
plugin needs one. The Door Hanger Plugin (Phase 5) is the first
candidate; future plugins (Facebook Ads, Google Ads, Hiring,
Scheduling) decide individually.

A future official **plugin framework** (and eventual plugin builder)
should standardize the following per plugin:

| Surface | Purpose |
|---|---|
| Plugin metadata | key, version, identity, permissions (already exists). |
| Admin surfaces | technical install / config (already exists at `/admin/plugins`). |
| Business workflow surfaces | how operators use the capability day-to-day (Phase 5 added `Marketing → Door Hangers`). |
| Owned tables / data | plugin-owned schema with `business_id` scoping (existing convention). |
| Actions / events | declared via the action registry + event bus (existing). |
| Permissions | declared in the manifest (existing). |
| Health checks | structured status surfaced on the plugin detail page (future). |
| **Optional simulation adapter** | matches the §4 sketch from the Phase 5 doc — `availableActions(state)`, `performAction({state, ctx})`, returning `{ durationSeconds, deltas }`. Phase 7+. |
| **Simulation-safe side-effect declaration** | the plugin declares which of its actions have real-world side effects and how those are short-circuited under simulation (e.g. "GHL adapter logs only, never sends"). |
| Assumptions / config | response rates, time-per-action, density modifiers — plugin-owned JSON / rules (Phase 5 §11 documented starter values). |
| Output record types | what records the plugin writes and which are safe to generate under simulation. |

**Phase 6 does not build the plugin builder.** Phase 6A only
documents the framework direction so subsequent phases (the actual
Door Hanger simulation adapter in Phase 7, the plugin builder
sometime later) build against a known shape.

The Door Hanger Plugin should be the first plugin to ship a
simulation adapter — but that adapter is **Phase 7 work**, not
Phase 6.

---

## 9. Phase 6 Recommended Build Scope

Phase 6 splits into five sub-phases. Each subsequent sub-phase is
gated on the previous one passing review.

### Phase 6A — Docs only ✅ (this file)

- Source-of-truth doc.
- Pointers in `CLAUDE.md` and `README.md`.
- No code, no schema, no business-logic change.

### Phase 6B — Simulation Workspace Seed / Setup

- Decide §3 sentinel (slug convention vs. `businesses.is_simulation`
  boolean). Recommended: add the boolean column in a single small
  migration.
- Seed a `Crystal Bear Simulation` workspace with
  `is_simulation = true`.
- Ensure the existing Door Hanger Plugin (Phase 5) can be installed
  / enabled on the simulation workspace via the existing
  `installed_plugins` row pattern. No new plugin scaffolding.
- Ensure the user (`SEED_ADMIN_EMAIL`) has a `business_memberships`
  row on the simulation workspace.
- **No gameplay.** No simulation UI. No banner yet — that arrives in 6D.

### Phase 6C — Save / Run Schema + Admin UI

- New table (e.g. `simulation_runs`) with the §4 columns. Single
  migration, RLS Pattern B (members SELECT; writes via service-role
  admin server actions, mirroring `door_hanger_*`).
- Admin UI page (likely under a new nav group `Simulation → Saves`,
  only visible when the active workspace is a simulation workspace).
- Create / list / open flows. Mark-active flow.
- Active save card displays: name, starting cash, current cash,
  simulated start / current date, status.
- **No gameplay actions.** No Hang 1, no clock-advance buttons, no
  CRM writes.

### Phase 6D — Workspace Switcher + Simulation Mode Banner + First Guardrail

- Smallest safe workspace switcher (topbar dropdown sourced from
  user memberships).
- Persistence mechanism for active workspace (Phase 6D decides).
- Simulation Mode banner (§6 spec).
- Side-effect guardrail in the GHL adapter (§7): if the active
  business has `is_simulation = true`, short-circuit to a logged
  no-op.

### Phase 6E — Phase 6 QA Report

- Mirror of `docs/PHASE_5_QA_REPORT.md`.
- Definition-of-Done checklist (§11).
- Do-Not-Build audit (§10).
- Security / schema check (RLS posture on `simulation_runs`,
  service-role confinement, no secrets in source).

If the existing architecture surfaces a safer order (for example,
Phase 6D's switcher landing before Phase 6C's UI to give the saves
page a clear "you are in the simulation workspace" signal), adjust
during implementation review.

---

## 10. Phase 6 Do Not Build

Pinned for clarity. Phase 6 must not build any of:

- Door Hanger **Hang 1 / Hang Route** gameplay.
- Simulated quote requests.
- CRM lead / quote / task generation from simulation (Phase 7+).
- Delayed customer responses.
- Message automation simulation outcomes.
- GPS / maps / route execution / route optimization.
- Worker mobile app.
- Jobs / invoices / scheduling.
- Customer messaging (real or simulated).
- Full game loop.
- Full plugin builder / plugin marketplace.
- Data import / export.
- AI / context-engine expansion.
- Production deployment of any simulation surface beyond the
  workspace + saves UI.
- Edit / delete / archive flows on `simulation_runs` (create + open
  + mark-active only — same "create-only first" rule as Phase 5).

The Phase 1 + 2 + 3 + 4 + 5 Do-Not-Build lists remain in force.
If a Phase 6 task touches any of the above, **stop and ask first.**

---

## 11. Success Definition

Phase 6 is successful when:

- The simulation workspace approach is documented. ✅ (this file).
- The save / run model is documented. ✅ (§4).
- Side-effect guardrails are documented. ✅ (§7).
- The plugin simulation framework direction is documented. ✅ (§8).
- The implementation plan is clear. ✅ (§9).
- `CLAUDE.md` and `README.md` carry a Phase 6 pointer.
- **No app code, no business logic, no database schema changes** in
  Phase 6A.

If implemented in later Phase 6 sub-phases:

- A `Crystal Bear Simulation` workspace exists.
- The user can tell at a glance whether they are looking at the real
  or the simulation workspace.
- The user can create, list, and open simulation saves.
- The active save shows starting / current cash and simulated start
  / current date/time.
- No gameplay or outcome generation was built.
- No real external side effects (SMS, email, etc.) occur from the
  simulation workspace — the first guardrail in §7 is enforced.

---

## 12. Phase 6A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [ ] `CLAUDE.md` carries a Phase 6 pointer paragraph.
- [ ] `README.md` Status section names Phase 6 and links to this doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 6A ends at docs only. Phase 6B is the first step that touches
code, and it only ships after this doc is reviewed and approved.

---

## Appendix A — Phase 6B-1 simulation workspace seed (delivered)

**Status:** schema + seed created. Migration and seed **not applied** —
the operator runs `supabase db push` (or equivalent) and
`supabase/seed/run_seed.sh` when ready.
**Added:** 2026-05-25.

Phase 6B-1 delivers the §3 + §9 "Phase 6B" foundation: the
`is_simulation` sentinel and a Crystal Bear Simulation workspace with
the Door Hanger plugin installed. **No save-file schema, no
workspace switcher, no banner, and no gameplay.**

### Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260526120000_phase_6_simulation_workspace.sql` | Adds `businesses.is_simulation boolean not null default false`. Idempotent (`add column if not exists`). |
| `supabase/seed/phase_6_seed.sql` | Idempotent seed: Crystal Bear Simulation `businesses` row (`is_simulation=true`), Owner / Admin `business_roles` row, Door Hanger `installed_plugins` row (`status='enabled'`), and admin membership link via `__SEED_ADMIN_EMAIL__`. |
| `supabase/seed/run_seed.sh` | Wired to apply Phase 6 seed after Phase 5, reusing the existing `SEED_ADMIN_EMAIL` placeholder substitution. |
| `supabase/seed/PHASE_6_VERIFICATION.sql` | Read-only SQL checks: column exists, real Crystal Bear stays `false`, simulation workspace exists + `true`, Door Hanger installed/enabled, zero `door_hanger_*` and zero CRM records on the simulation workspace. |
| `schema.md` §1 | Documents the new `is_simulation` column. |

### Sentinel decision

The §3 sentinel decision lands on **Option B**: a single
`businesses.is_simulation boolean` column. Reasoning: one place to
read, no slug coupling, trivially queryable, future-proof for the
Phase 6D adapter guardrail and any future per-workspace UI.

The boolean **lives only on `businesses`**. No other table receives an
`is_simulation` flag — the workspace boundary is the safety boundary,
enforced by existing `business_id` scoping + RLS.

### Workspace seeded

| Field | Value |
|---|---|
| `slug` | `crystal-bear-simulation` |
| `name` | `Crystal Bear Simulation` |
| `primary_industry` | `window_cleaning` (matches the real workspace) |
| `timezone` | `America/New_York` |
| `currency` | `USD` |
| `status` | `active` |
| `is_simulation` | `true` |

The real Crystal Bear workspace (`slug=crystal-bear`) is **not
touched** by the Phase 6 seed; it keeps `is_simulation=false` via the
column default.

### What the seed deliberately does NOT do

- Does **not** seed `service_areas`, `services`, `service_plans`,
  `price_rules`, or `business_settings` on the simulation workspace.
  The Auto-Quote / Customer Quote plugins are not installed on the
  simulation workspace, so none of those settings are required yet.
- Does **not** seed `app_surfaces` for the simulation workspace —
  there is no `/q` flow for the simulation business and the admin
  shell resolves by membership, not by surface.
- Does **not** create any `simulation_runs` table or row — that lands
  in Phase 6C.
- Does **not** install the Window Cleaning Auto-Quote or Customer
  Quote / Sales Page plugins on the simulation workspace. Only
  Door Hanger is installed, matching the Phase 6 scope ("the Door
  Hanger Plugin should be the first plugin with a simulation
  adapter").
- Does **not** create any `door_hanger_designs`, `door_hanger_campaigns`,
  `door_hanger_routes`, `door_hanger_route_stops`, or
  `door_hanger_distribution_sessions` rows on the simulation workspace.

### Membership / RLS posture

The seed adds the `SEED_ADMIN_EMAIL` user as Owner / Admin on the
simulation workspace via the same pattern Phase 1 uses for the real
workspace: `user_profiles` + `business_memberships` +
`membership_roles`. Without this row, RLS would correctly hide the
simulation workspace from the admin user.

No RLS policies were changed. The existing `is_business_member()`
helper continues to gate all reads — it works on the simulation
workspace the same way it works on the real one.

### Not applied

The migration and seed are **created but not yet applied**. The
operator runs:

```
supabase db push           # apply Phase 6B-1 migration
supabase/seed/run_seed.sh  # apply seeds in order (Phase 1 → 3 → 5 → 6)
```

Re-applying is safe: the migration uses `add column if not exists`,
and the seed uses `on conflict … do update` for every insert.
