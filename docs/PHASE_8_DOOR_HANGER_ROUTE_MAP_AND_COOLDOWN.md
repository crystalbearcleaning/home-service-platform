# Phase 8 — Door Hanger Route Map + Cooldown Foundation

**Status:** source-of-truth design doc for Phase 8.
**Created:** 2026-06-02.
**Scope:** docs only (Phase 8A). **No app code, no business logic,
no schema changes** in this step.

This document defines the next deepening of the Door Hanger Plugin:
turning saved routes into a real, geographic, map-first route
management workspace, and laying down the route-level **cooldown**
foundation that Phase 7B's per-stop `completed_at` was put in place
to feed.

Phase 8 is additive in both senses: a new `/admin/marketing/door-hangers/routes`
page sits *alongside* the existing dashboard (no replacement), and a
single nullable column on `door_hanger_routes` carries the cooldown
window without touching any other table.

> Required reading before starting Phase 8 implementation work:
> - `CLAUDE.md`
> - `schema.md` (especially §22b Door Hanger and §22d Phase 7B
>   additions — `door_hanger_routes.last_completed_at`,
>   `door_hanger_route_stops.completed_at`)
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
>   (Appendix A — Phase 5A-2 product/design, Appendix B — Phase 5B-1
>   schema, Appendix C — Phase 5C RentCast generation)
> - `docs/PHASE_5_QA_REPORT.md`
> - `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md`
>   (especially §§2, 7, 8 + Appendix C — simulation workspace
>   boundary, side-effect guardrail, simulated clock)
> - `docs/PHASE_6_QA_REPORT.md`
> - `docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md`
>   (Appendix B — `/admin/simulation/play` shell, Appendix D —
>   Hang RPC + completion fields)
> - `docs/PHASE_7_QA_REPORT.md`
> - existing Door Hanger plugin code:
>   - `src/plugins/door-hanger/manifest.ts`
>   - `src/core/door-hanger/admin-data.ts`,
>     `src/core/door-hanger/admin-create.ts`,
>     `src/core/door-hanger/rentcast-route.ts`,
>     `src/core/door-hanger/rentcast-candidates.ts`,
>     `src/core/door-hanger/simulation-start.ts`,
>     `src/core/door-hanger/simulation-hang.ts`
>   - `src/app/admin/marketing/door-hangers/page.tsx`,
>     `actions.ts`, `forms.tsx`, `rentcast-route-form.tsx`
> - existing Google Maps bootstrap in
>   `src/components/google-autocomplete.tsx` (the bootstrap can be
>   reused for the map provider)
> - simulation active-save helper:
>   `src/core/simulation/admin-data.ts` (`getActiveSimulationRun`)

---

## 1. Phase 8 Purpose

Phase 8 is **Door Hanger Route Map + Cooldown Foundation**.

Goal: make saved Door Hanger routes **visible** as geographic
assets, and make per-stop completion history **legible** as a
cooldown signal.

Phase 7B added `door_hanger_route_stops.completed_at` and
`door_hanger_routes.last_completed_at` precisely so a future phase
could read them. Phase 8 is that future phase — but Phase 8 only
**reads** + **displays** cooldown state. It does **not** filter
RentCast candidates by cooldown at generation time (that remains a
later improvement).

Phase 8 improves the real Door Hanger Plugin and also helps
simulation by:

- letting the operator scroll around a map and see every saved
  route as a polygon or circle,
- exposing per-stop status (pending / completed / skipped) and
  per-stop cooldown status (cooling down / eligible) at a glance,
- consolidating route stats (counts, last completed, next eligible)
  into a single overlay,
- reusing — where clean — the existing Phase 5C RentCast generation
  flow under the same RentCast cost guardrail (1 preview request,
  0 save requests).

Phase 8A is **docs only**. No app code, no schema, no business
logic change in this step. Later sub-phases (8B–8F) progressively
land the schema, helpers, page shell, overlays, optional reused
generation overlay, and QA.

---

## 2. Product Direction

The Door Hanger Plugin should become a real route management tool,
not a table of nameable rows. Routes are inherently spatial — the
operator's daily mental model is "the Boca Intercoastals route" as a
shape on a map, not "row 3 in the routes table."

Phase 8 commits to:

- Routes shown geographically as primary representation.
- Existing tabular routes view remains available, but as an overlay
  on top of the map, not a parallel page.
- Click-to-inspect interaction: click the polygon → details overlay.
- Cooldown as a first-class status, not buried in metadata.

Long-term (post-Phase 8) the same map workspace becomes the entry
point for:

- GPS-driven worker / field execution (Phase 9+).
- Drawing / lasso / bulk-completion controls.
- Cross-route property dedupe (don't add the same house to two
  routes within a cooldown window).
- ROI- / season- / campaign-aware cooldown.

**None of those land in Phase 8.** Phase 8 stops at "see the routes,
see the cooldown, click for stats." The map is the foundation.

---

## 3. Main Route Workspace

Phase 8 introduces a single new admin route:

```
/admin/marketing/door-hangers/routes
```

This is the **map-first route workspace**. The map is the page; the
header / overlays / table are chrome.

The existing dashboard at `/admin/marketing/door-hangers` **stays
exactly as it is**. Phase 8 adds a clear "Open Route Map →" card or
button on the dashboard pointing at the new workspace. The
dashboard continues to host:

- Campaigns section
- Inventory / designs section
- Routes section (the existing tabular view + the existing
  RentCast generation form from Phase 5C)
- Recent distribution sessions section

Phase 8 does not move, replace, or rebuild any of those sections.

### Why "alongside" instead of "instead of"

- The existing dashboard is the operator's familiar entry point and
  already handles create-only flows (campaigns, designs, manual
  routes, distribution sessions). Replacing it would risk losing
  Phase 5B/5C behavior the QA report signed off.
- A new map workspace can iterate independently without rewiring
  the dashboard's plumbing on every change.
- Phase 9+ may consolidate, but only once the map workspace earns
  its keep.

---

## 4. Map-First UI Model

The route workspace should feel like a field-ops / map tool, not a
standard admin CRUD page.

Page model (Phase 8C will finalize layout):

- **Base layer:** large Google Maps surface (the visible body of
  the page, below the standard `AdminShell` chrome + workspace
  switcher + simulation banner).
- **Overlays / panels:** floating, dismissible. Each appears in
  response to an explicit affordance (button or click). Closing an
  overlay returns the operator to the map.
- **Floating controls:** small, top-right or bottom-right buttons
  to "Open routes table" and (when 10E ships) "Generate route."
  No global toolbar.

First overlays (in order they ship):

| Overlay | When | Source-of-truth phase |
|---|---|---|
| Route details | Click on a route polygon / circle | Phase 8D |
| Routes table | Click "Routes" floating button | Phase 8D |
| Generate route (optional) | Click "Generate" floating button | Phase 8E if reuse is clean |

Constraints:

- Overlays are **independent** — opening one does not require
  closing another (but two are enough to be usable; multi-panel
  layout is not Phase 8 work).
- Overlays do not navigate. The URL stays at
  `/admin/marketing/door-hangers/routes`.
- No modal that blocks the map. Operators must always be able to
  scroll the map while an overlay is open.

---

## 5. Map Provider — Google Maps

Phase 8 uses **Google Maps**. Reasons:

- The project already loads the Maps JS bootstrap for
  `GoogleAutocomplete` (`src/components/google-autocomplete.tsx`).
  Reuse it — no second provider, no second bootstrap, no second
  cache busting.
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is already documented +
  required in `.env.example` and already domain-restricted for the
  customer-facing surface.
- Google Maps fits the future GPS / mobile / field-execution
  direction without a provider swap.
- Avoids introducing Mapbox / Leaflet primitives, license review,
  and a second JS bundle.

**Do not** introduce Mapbox / Leaflet / OpenStreetMap unless
Google Maps is unavailable for a concrete operator-blocking
reason.

### What "use Google Maps" actually requires

- Enable the **Maps JavaScript API** (already enabled for the
  autocomplete bootstrap).
- A small client component that mounts a `google.maps.Map` instance
  on a div, similar in shape to `GoogleAutocomplete` but loading
  the `maps` library via `importLibrary('maps')` (and `marker` for
  pins, `geometry` if we want server-side hull check later — pure
  TS hull is preferred, see §6).
- Browser key restriction stays the same (HTTP-referrer restricted
  to the admin domains).

---

## 6. Route Areas / Shapes

Routes should appear as **areas / shapes**, not only as individual
pins. The operator's mental model is "the route covers this
neighborhood," not "the route is 100 pins."

### Per route type

| Route source | Shape | Source data |
|---|---|---|
| RentCast (Phase 5C) with route stops carrying `lat`/`lng` | **Convex hull polygon** over the stops' coordinates | `door_hanger_route_stops.lat`/`lng` |
| Manual route with `center_lat`/`center_lng` + `radius_miles` | **Circle** centered at the address, sized by `radius_miles` | `door_hanger_routes.center_*` |
| Manual route with no usable location | **No map shape** — appears in the routes table overlay only | n/a |

### Convex hull

- Compute with a small **pure TypeScript** helper (Andrew's
  monotone chain or similar). Keeps the calculation deterministic,
  cacheable, and unit-testable. No Google Geometry dependency.
- Hull is computed at render time from the route's stops in the
  loader (Phase 8B). Phase 8 does **not** persist the hull —
  recompute is cheap for ≤ 500 stops (RentCast cap).
- Degenerate cases:
  - 0 stops → no shape (table only).
  - 1 stop → render a single pin at that lat/lng.
  - 2 stops → render a thin polyline (or a small circle around
    each — Phase 8B picks the cleaner option).
  - 3+ collinear stops → hull collapses to a line; treat as
    polyline.

### Polygon / circle behavior

- **Clickable.** Opens the route details overlay (§8) with the
  route's id.
- **Default styling:** soft brand-tone fill + border. Selected
  route gets a stronger fill + border.
- **Hover state** is optional and not load-bearing.

### Out of scope

- Manual polygon drawing.
- Polygon editing (move vertices, resize circle, etc.).
- Heatmaps / clustering / route optimization / turn-by-turn.
- Concave hulls / α-shapes. Convex hull is the simplest stable
  primitive and matches the door-hanger field-walk pattern well
  enough for Phase 8.

---

## 7. Route Stops / Pins

When a route is **selected** (polygon clicked or table-row
focused), Phase 8D shows the route's stops on the map.

For each stop with `lat`/`lng`:

- Render a small pin.
- Pin tint should encode `status`:
  - `pending` → default tint
  - `completed` → success tint
  - `skipped` → muted tint
- If `completed_at` is set, the cooldown signal further refines:
  - `cooling_down` (still inside `cooldown_days` window) →
    cooler success tint
  - `eligible` (past the window) → warm "ready again" tint
- Pin click **may** open a small inline stop card if cheap, but
  the main Phase 8 surface is the route details overlay (§8). The
  inline stop card is **not required** for Phase 8 sign-off.

### Out of scope (still)

- GPS-pause completion.
- Manual pin-click completion (operator marking a stop done by
  clicking it).
- Lasso / drawing / bulk completion.
- Per-pin photo / note attachments.

These all belong to the future field-execution phase.

---

## 8. Route Details Overlay

Clicking a route polygon / circle opens the route details overlay.

Contents (read-only):

| Field | Source |
|---|---|
| Route name | `door_hanger_routes.name` |
| Campaign | joined `door_hanger_campaigns.name` |
| Source | `generated_from_source` (`manual` \| `rentcast`) |
| Route status | `door_hanger_routes.status` |
| Total stops | `total_route_stops` |
| Pending stops | count from `door_hanger_route_stops.status='pending'` |
| Completed stops | count from `status='completed'` |
| Skipped stops | count from `status='skipped'` |
| Cooling-down stops | completed stops where `completed_at + cooldown_days > reference_time` |
| Eligible stops | completed stops where `completed_at + cooldown_days <= reference_time` |
| Last completed | `door_hanger_routes.last_completed_at` |
| Cooldown days | `door_hanger_routes.cooldown_days` (new, §11) |
| Next eligible date | min `completed_at + cooldown_days` across cooling-down stops, or "now" if all eligible / none completed |
| Route eligible summary | one-line text: "Eligible," "Cools down through 2026-08-04," etc. |
| Center address / radius | when present (manual + RentCast both store them) |
| Estimated time | `estimated_time_seconds` (display in human form) |
| Recent session summary | optional: latest `door_hanger_distribution_sessions` row for this route (date + hangers_distributed + status). Skip if it adds risk. |

### Not in Phase 8

- Edit / delete / archive route.
- Manual "force complete," "reopen route," or "extend cooldown."
- Per-stop detail list inside the overlay (the pins on the map
  are the per-stop view).

---

## 9. Routes Table Overlay

A floating "Routes" button opens a tabular overlay listing all
saved routes for the active business.

Columns:

- Name
- Campaign
- Source (`manual` / `rentcast`)
- Status (`draft` / `ready` / `in_progress` / `completed` /
  `paused`)
- Total stops
- Counts: completed / pending / cooling down / eligible (compact)
- Last completed date
- Cooldown days
- Next eligible date
- Action: **Focus on map** — closes the overlay, centers + zooms
  the map to the route, opens the route details overlay.

Rules:

- Sorted newest-first by default. No saved views or advanced
  filters in Phase 8.
- No edit / delete / archive controls.
- No multi-select.
- Selecting a row from the overlay must not navigate.

---

## 10. Generate Route Overlay (optional, Phase 8E)

If the Phase 5C RentCast generation flow can be reused cleanly,
Phase 8E may expose it inside the map workspace as a "Generate"
overlay. Reuse pattern:

- Same form fields: center address (Google autocomplete), radius
  (miles), target count, optional property type.
- Same "Estimated RentCast requests: 1" badge.
- Same preview + save split:
  - **Preview** = exactly **one** RentCast batch request
    (`RENTCAST_PREVIEW_REQUEST_COUNT = 1`).
  - **Save** = **zero** RentCast requests (consumes the preview
    payload).
- Same target cap (`OVER_BATCH_LIMIT` above 500).
- Same candidate safe-subset filtering.

Phase 8 additions to the form:

- `cooldown_days` input (default 60, integer ≥ 0).

After save, the new route appears on the map (page revalidates,
new convex hull renders).

### Hard rules (do not change)

- One preview = one RentCast request.
- Save = zero RentCast requests.
- No per-property RentCast lookup.
- No pagination.
- No cooldown-based candidate filtering (that's deferred).
- No drawing on the map to seed the generator.

### If reuse is not clean

If extracting the existing form for embed in an overlay introduces
risk (the form is tightly coupled to the dashboard's surrounding
context, or revalidation paths diverge), **skip Phase 8E**. The
dashboard's existing RentCast generation flow remains the canonical
generator; the new workspace only displays routes. Document the
decision in the Phase 8 QA report.

---

## 11. Cooldown Foundation

Phase 8 introduces a single route-level cooldown setting.

### Schema (Phase 8B)

Add **one** column to `door_hanger_routes`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `cooldown_days` | `integer` NOT NULL | `60` | CHECK `cooldown_days >= 0`. Existing routes back-fill to 60. |

That's the only schema change in Phase 8. No new tables.

### Why route-level (and only route-level)

- Mirrors the operator's mental model: "we walked the Boca
  Intercoastals route, give it two months."
- Avoids needing campaign / plugin / business cascade settings
  before we know the operator's real preference.
- Keeps Phase 8 narrow. Plugin- and campaign-level defaults can
  layer on later without a migration to undo this column.

### Default of 60 days

- Sits between the Phase 7 doc's documented "2 months" default
  and a more aggressive 30-day re-tag. 60 days matches the
  operator's stated intent (no double-tagging the same house
  within a season) without being so conservative that brand-new
  RentCast routes look "cooling down" for too long.
- Operator can override per-route at generation/creation time
  (Phase 8E) or — if generation overlay is skipped — by editing
  via the existing dashboard's create form (Phase 8E will decide
  whether to expose the field on the dashboard form as well).
- Do **not** hardcode "2 months" anywhere. Cooldown is a
  configurable per-route field from Phase 8B onward.

### Cooldown calculation model

For each route stop with `completed_at IS NOT NULL`:

```
next_eligible_at = completed_at + (route.cooldown_days || 60) days
if reference_time < next_eligible_at:
    stop is "cooling down" (with `daysUntilEligible`)
else:
    stop is "eligible" (re-walkable)
```

For each route, summary counts:

- `pending_count`        — `status='pending'`
- `completed_count`      — `status='completed'`
- `skipped_count`        — `status='skipped'`
- `cooling_down_count`   — completed stops where `next_eligible_at > reference_time`
- `eligible_count`       — completed stops where `next_eligible_at <= reference_time`

Note: `cooling_down_count + eligible_count = completed_count`.
Pending and skipped are independent of cooldown.

Route-level **next eligible date** = `min(next_eligible_at)` across
`cooling_down_count > 0` stops, else null (route is fully eligible
or has no completed stops).

### Reference time

The cooldown calculation needs a "now." Per workspace:

| Workspace | `reference_time` |
|---|---|
| Real | `now()` |
| Simulation, active save exists | `simulation_runs.simulated_current_at` for the active save |
| Simulation, no active save | fall back to `now()` and show a soft banner explaining cooldown is using wall-clock |

Rationale: the simulation workspace must read the simulated clock
when one is active so cooldown matches the operator's play state.
When no save is active, we still want the page to render — so
fall back to wall-clock + a small notice.

### Not in Phase 8

- Plugin- or campaign-level cooldown defaults / overrides.
- ROI-/season-/weather-aware cooldown.
- Per-stop cooldown override.
- Cooldown filtering inside RentCast route generation (it can
  *display* cooldown but cannot *exclude* cooldown-blocked
  addresses from new routes).
- Cross-route property dedupe.

---

## 12. Completion History

Phase 8 displays the completion fields Phase 7B added:

- `door_hanger_route_stops.completed_at` — per-stop completion
  timestamp.
- `door_hanger_routes.last_completed_at` — route-level summary
  (set when a route is auto-finished by the simulation Hang RPC).

### Long-term direction (documented; not Phase 8)

- Property-level completion history should eventually be the
  source of truth: "this address was last hung 2026-04-01," even
  if the route that did it was later deleted.
- Cooldown filtering at route generation should consult this
  property-level history to prevent newly generated routes from
  re-tagging recently-walked properties.
- Route-level `last_completed_at` remains a summary.

Phase 8 only **displays** cooldown status from per-stop
`completed_at` + the new `cooldown_days`. Cross-route dedupe and
filter-at-generation belong to a follow-up phase.

---

## 13. Simulation Awareness

The map workspace must work in **both** the real workspace and the
simulation workspace.

### Real workspace

- `reference_time` = `now()`.
- Routes shown belong to the real business.
- No simulation banner is rendered (existing Phase 6D banner is
  workspace-gated).

### Simulation workspace

- `reference_time` = active save's `simulated_current_at` when one
  exists; otherwise `now()` (see §11).
- Routes shown belong to the simulation business. The same
  `business_id` scoping that gates Phase 7B's `simulation_activity`
  reads gates Phase 8's route reads.
- No real external side effects. The existing Phase 6D guardrail
  is not reached from the map workspace — Phase 8 makes no calls
  to the message engine, payment surfaces, or any future
  outbound adapter.
- The Phase 6D Simulation Mode banner continues to render above
  the map workspace.
- No new simulation actions land in Phase 8. The map workspace
  does not start sessions, hang door hangers, or finish routes —
  those remain on `/admin/simulation/play`.

### Why the map workspace lives under Marketing, not Simulation

- The map workspace is a Door Hanger Plugin surface, not a
  simulation surface. It exists in both workspaces and uses the
  same code in both.
- Putting it under `/admin/simulation/*` would force a real
  Crystal Bear operator to switch workspaces to see their own
  routes, which would be confusing.

---

## 14. Recommended Implementation Plan

Phase 8 splits into six sub-phases. Each is gated on the previous
one passing review.

### Phase 8A — Docs only ✅ (this file)

- Source-of-truth doc (this file).
- Phase 8 pointer in `CLAUDE.md` and `README.md`.
- **No code, no schema, no business-logic change.**

### Phase 8B — Schema + core helpers (no UI)

- Single additive migration:
  `door_hanger_routes` + `cooldown_days integer not null default 60`
  with `CHECK >= 0`. Idempotent (`add column if not exists`).
- Pure helpers (all unit-tested):
  - `computeConvexHull(points)` — Andrew's monotone chain.
  - `computeCooldownStatus({completedAt, cooldownDays, referenceTime})`
    returning `{status: 'cooling_down' | 'eligible', nextEligibleAt, daysUntilEligible}`.
  - `summarizeRouteCooldown({stops, cooldownDays, referenceTime})`
    returning counts + route-level `nextEligibleAt`.
- Server-only loader:
  - `loadRouteMapData(businessId, referenceTime)` returning
    `{routes: RouteWithGeometry[], stopsByRoute: …}` for the map.
- No UI yet.

### Phase 8C — Map workspace shell

- New route `/admin/marketing/door-hangers/routes`.
- Google Maps base layer via a new `<GoogleMap>` client component
  (mirroring `GoogleAutocomplete`'s bootstrap pattern).
- Render route polygons (convex hull) and manual-route circles.
- Polygon click opens a placeholder overlay (real overlay in 8D).
- Dashboard adds an "Open Route Map →" card / link.
- No generation overlay yet.

### Phase 8D — Overlays + cooldown counts

- Route details overlay with the §8 fields.
- Routes table overlay with the §9 columns + "Focus on map"
  action.
- Selected-route pin rendering with status + cooldown tints.
- Cooldown counts reading `reference_time` per §11.

### Phase 8E — Optional: reused Generate Route overlay

- If the Phase 5C `<RentcastRouteForm>` extracts cleanly, render
  it inside a "Generate" overlay on the map workspace and add the
  `cooldown_days` input.
- If reuse is not clean, skip the overlay and link to the
  existing dashboard form.
- Either way: no change to the RentCast cost guardrail.

### Phase 8F — QA report

- Mirror of `docs/PHASE_7_QA_REPORT.md`.
- Definition-of-Done checklist (§16).
- Do-Not-Build audit (§15).
- Security / schema check.

If the existing architecture surfaces a safer order during
implementation review, adjust.

---

## 15. Phase 8 Do Not Build

Pinned for clarity. Phase 8 must not build any of:

- GPS tracking / live device location.
- Live worker / field-execution mobile app.
- Route optimization (TSP, density routing, etc.).
- Turn-by-turn routing or directions integration.
- Manual polygon drawing / editing.
- Lasso / bulk completion controls.
- Real-time location updates / presence.
- Manual pin completion (operator clicks a pin to mark a stop
  done). Stop completion remains driven by the simulation Hang
  RPC (Phase 7D-2) only.
- Cooldown filtering / exclusion **inside** RentCast route
  generation (display only in Phase 8).
- Cross-route property dedupe.
- CRM lead / job / outcome generation from door hangers.
- Simulation outcomes (delayed quote requests, etc.).
- Message-automation outcomes.
- Jobs / invoices / scheduling / appointments / payments.
- Full game economy.
- Plugin builder / plugin marketplace.
- Data import / export.
- AI / context-engine expansion.
- Any change to the public `/q` flow.
- Edit / delete / archive flows on routes, route stops, designs,
  campaigns, or distribution sessions.
- New simulation actions on `/admin/simulation/play`.

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 Do-Not-Build lists remain in
force. If a Phase 8 task touches any of the above, **stop and
ask first.**

---

## 16. Success Definition

Phase 8 is successful when:

- The source-of-truth doc exists. ✅ (this file).
- The route map / workspace model is documented. ✅ (§§3–4).
- The Google Maps provider decision is documented. ✅ (§5).
- The convex-hull route-area decision is documented. ✅ (§6).
- The route-level `cooldown_days` decision is documented. ✅ (§11).
- The cooldown calculation model + reference-time rule is
  documented. ✅ (§11).
- Map-first overlays are documented. ✅ (§§8–10).
- The implementation plan is documented. ✅ (§14).
- The Do-Not-Build list is documented. ✅ (§15).
- `CLAUDE.md` carries a Phase 8 pointer paragraph.
- `README.md` Status section names Phase 8 and links to this doc.
- **No app code, no business logic, no database schema changes**
  in Phase 8A.

If implemented in later Phase 8 sub-phases:

- `/admin/marketing/door-hangers/routes` exists.
- The existing dashboard links to it.
- Saved routes render on Google Maps as polygons (RentCast routes
  with stops) or circles (manual routes with center + radius), and
  table-only when neither shape is available.
- Route details overlay shows the §8 fields including cooldown
  counts.
- Routes table overlay shows the §9 columns and the "Focus on
  map" action.
- Cooldown status uses real `now()` in real workspaces and active
  save's `simulated_current_at` in simulation workspaces.
- The optional Generate Route overlay either ships with reused
  Phase 5C plumbing + `cooldown_days` input, or is explicitly
  skipped per §10.
- No Phase 8 Do-Not-Build items are implemented.
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass.
- `docs/PHASE_8_QA_REPORT.md` exists and signs off the
  Definition-of-Done above + the Do-Not-Build audit.

---

## Appendix A — Phase 8B schema + helpers (delivered)

**Status:** schema applied (`cooldown_days` column + CHECK via a tiny
follow-up migration). Pure helpers + server-only loader landed with
40 unit tests.
**Added:** 2026-06-02.

See `schema.md` §22e for the column-level reference. Two migrations
were applied:
`20260602120000_phase_8_door_hanger_cooldown.sql` (column) and
`20260602120100_phase_8_door_hanger_cooldown_check.sql` (CHECK
follow-up — the guarded `DO $$` block in the first migration did
not land the constraint on Supabase, so the second migration added
it directly under a fresh existence guard).

Files:
- `src/core/door-hanger/route-map-geometry.ts` — pure
  `computeConvexHull` (Andrew's monotone chain), `isValidPoint`,
  `computeRouteShape` (hull → circle → none).
- `src/core/door-hanger/cooldown.ts` — pure
  `computeCooldownStatus`, `summarizeRouteCooldown`,
  `getDoorHangerRouteMapReferenceTime`, default 60.
- `src/core/door-hanger/route-map-data.ts` — server-only loader
  `loadRouteMapData({businessId, referenceTime})` returning
  `{referenceTime, routes[]}` with shape + cooldown summary +
  per-stop cooldown + latest session per route.
- 40 unit tests across `route-map-geometry.test.ts`,
  `route-map-shape.test.ts`, `cooldown.test.ts`.

---

## Appendix B — Phase 8C map workspace shell (delivered)

**Status:** `/admin/marketing/door-hangers/routes` ships with the
Google Maps base layer, all four shape kinds (polygon / line /
point / circle), bounds fitting, click-to-select with a placeholder
route details overlay, and an "Open Route Map →" card on the
existing dashboard. **No route table overlay yet, no selected-route
pins, no Generate Route overlay.**
**Added:** 2026-06-02.

### Files

| File | Purpose |
|---|---|
| `src/components/use-google-maps-bootstrap.ts` | Shared client hook that injects Google's inline Maps JS bootstrap loader once per page and reports `{kind: 'pending' \| 'ready' \| 'error'}`. Mirrors the strategy in `google-autocomplete.tsx`; both coexist (Google's loader guards against double-bootstrap). |
| `src/app/admin/marketing/door-hangers/routes/route-map.tsx` | Client component. Imports the `maps` library on bootstrap-ready, mounts a `google.maps.Map`, rebuilds shape overlays on `routes` changes, fits bounds, and surfaces a placeholder `<SelectedRoutePanel>` on shape click. Pure helper `resolveSelectedRouteId` is unit-tested. |
| `src/app/admin/marketing/door-hangers/routes/route-map.test.ts` | 4 unit tests for `resolveSelectedRouteId`. |
| `src/app/admin/marketing/door-hangers/routes/page.tsx` | Server component. Resolves auth + active business + active simulation save, computes the cooldown reference time via `getDoorHangerRouteMapReferenceTime`, loads route map data via `loadRouteMapData`, and renders the page shell (status pills + map area + reference-time footer). |
| `src/app/admin/marketing/door-hangers/page.tsx` | Adds a "Route map" `<SectionCard>` immediately under the page header with an **Open Route Map →** Link. The existing Campaigns / Inventory / Routes / Recent distribution sessions sections are unchanged. |

### Map / route shape behavior

- **`polygon`** — `google.maps.Polygon`, brand-tone fill, click → `onSelect(route.id)`.
- **`line`** — `google.maps.Polyline`, brand-tone stroke, clickable.
- **`point`** — `google.maps.Marker` titled with the route name, clickable.
- **`circle`** — `google.maps.Circle` centered at `center_lat/lng`, sized as `radiusMiles * 1609.344` meters, clickable.
- **`none`** — not rendered; counted in the "table-only" status pill instead.

Bounds-fit logic walks every shape's points (polygon vertices, line
endpoints, point coordinates, circle bbox derived from radius via
the standard 111,320 m/deg approximation). With at least one bounded
shape the map calls `fitBounds(..., 48)`; otherwise it falls back to
the Boynton Beach / Crystal Bear area center (lat 26.5, lng -80.1)
at zoom 11.

Selected route opens an inline `<SelectedRoutePanel>` overlay (top-left,
80-rem max, dismissible). The panel shows: route name, campaign name
(when set), source, status, total stops, cooldown days, pending /
completed / skipped / cooling-down / eligible counts, last completed,
next eligible. Phase 8D replaces this placeholder with the full
overlay.

### Cooldown reference-time wiring

The server page resolves `referenceTime` via Phase 8B's
`getDoorHangerRouteMapReferenceTime`:

- Real workspace → `real_now`.
- Simulation workspace + active save → `simulated_clock`
  (active save's `simulated_current_at`).
- Simulation workspace + no active save → `fallback_now_no_active_save`
  (wall-clock, with a warning status pill rendered on the page).

The selected pill in the header strip surfaces the active source so
the operator can tell at a glance which clock is driving the counts.

### Dashboard card behavior

The existing `/admin/marketing/door-hangers` dashboard now renders a
"Route map" SectionCard immediately under the page header. The card
shows either "Once you create a manual route or generate one from a
center address, it will show up on the map." (when no routes exist)
or "N saved route(s) ready to view." Both states render the
**Open Route Map →** Link. No existing dashboard section, form, or
flow was touched.

### Tests

- `route-map.test.ts` — 4 cases pinning `resolveSelectedRouteId`
  (null / hit / miss / empty list).
- All Phase 8B helper tests (40) continue to pass.

### What Phase 8C deliberately does NOT do

- No route table overlay (Phase 8D).
- No selected-route stop pins (Phase 8D).
- No Generate Route overlay (Phase 8E, optional).
- No drawing, lasso, manual pin completion, GPS, route optimization,
  turn-by-turn, or live worker features.
- No edit / delete / archive on routes.
- No cooldown filtering inside RentCast route generation.
- No CRM / simulation outcome generation, no message-engine calls.
- No public `/q` changes.

---

## Appendix C — Phase 8D overlays + selected-route pins (delivered)

**Status:** route details overlay, routes table overlay, selected-
route stop pins (status + cooldown tinted), shape emphasis, and a
focus-on-map control all ship. **No Generate Route overlay yet, no
GPS / lasso / manual completion / route optimization / outcomes.**
**No schema changes.**
**Added:** 2026-06-02.

### Files

| File | Purpose |
|---|---|
| `src/core/door-hanger/route-map-display.ts` | Pure presentation helpers: `pinStatusForStop`, `STOP_PIN_COLORS`, `routeCooldownHeadline`, `formatRouteCountsLine`, `selectedRouteFromList`. |
| `src/core/door-hanger/route-map-display.test.ts` | 17 unit tests covering every pin-status branch, all three headline kinds, the counts line (singular / plural / skipped omission), and selection lookup. |
| `src/app/admin/marketing/door-hangers/routes/routes-table.tsx` | New client overlay. Floating right-anchored panel listing every saved route with the compact counts line, the cooldown headline (tinted), last-completed / next-eligible dates, cooldown days, and a per-row "Focus on map" button. Disabled for table-only routes. |
| `src/app/admin/marketing/door-hangers/routes/route-map.tsx` | Replaces the placeholder selected-route panel with the full `<RouteDetailsOverlay>` (route name, campaign, source, status, total stops, all five cooldown counts, last completed, next eligible, cooldown days, estimated time, center address + radius, latest session). Adds selected-route stop pins tinted via `pinStatusForStop` + `STOP_PIN_COLORS`. Selected route shape gets a heavier stroke + deeper fill. Adds the floating "Routes (N)" button + `<RoutesTableOverlay>` wiring. Adds a small `<MapLegend>` in the bottom-right. Introduces a `focusToken` counter so Focus-on-map refits bounds to one route without yanking the camera on every selection change. |
| `src/app/admin/marketing/door-hangers/routes/page.tsx` | Now forwards the **full** `MapRouteFull` DTO (route metadata + cooldown summary + per-stop with status + cooldown + latestSession). Table-only routes are forwarded too so the table overlay can list them. |

### Route details overlay behavior

- Opens on shape click **or** via the table's Focus action.
- Headline line shows one of three states (color-coded):
  - "Not walked yet" — grey, when no completed stops.
  - "Eligible" — success-tone, when every completed stop is past
    its cooldown.
  - "Cooling down until {date}" — warning-tone, when at least one
    completed stop is still in the cooldown window. The date is
    the earliest `next_eligible_at` across cooling stops.
- Two-column KV grid: source / status / total stops / cooldown
  days / pending / completed / skipped / cooling / eligible / last
  completed / next eligible / estimated time.
- Conditional sub-cards: center address + radius (when present),
  latest distribution session (one summary row with date + hangers
  + mode + status).
- Close button returns to "no selection" — the shape unhighlights,
  pins disappear, overlay dismisses.
- Read-only — no edit / delete / archive / force-complete /
  manual-completion controls.

### Routes table overlay behavior

- Floating button top-right: "Routes (N)" / "Hide routes" toggles
  the panel.
- Right-anchored, max-height scrollable, dismissible Close button.
- Each row: route name + source + status + (optional) campaign
  name, the headline cooldown line (tinted), the compact counts
  line ("100 stops · 26 done · 74 pending · 0 cooling · 26
  eligible · cooldown 60d"), last completed / next eligible dates,
  and a per-row **Focus on map** button. Table-only routes show
  the warning footnote and disable Focus.
- Focus on map → selects route, closes the table, opens the
  details overlay, and bumps the focus token so the map fits
  bounds to that route's shape.
- Read-only: no filters, no saved views, no multi-select, no
  edit/delete/archive.

### Selected route pins behavior

- When a route is selected, every stop with `lat`/`lng` renders as
  a `google.maps.Marker` using `SymbolPath.CIRCLE` (6 px scale,
  90 % fill opacity).
- Pin tint per `pinStatusForStop`:
  - `pending` → blue (`#3b82f6`)
  - `completed_cooling` → amber (`#f59e0b`)
  - `completed_eligible` → green (`#10b981`)
  - `skipped` → grey (`#9ca3af`)
- Pin `title` exposes a native browser tooltip with address +
  status + (when present) completed date + next eligible date.
  Per §7 of the doc, the cheap title tooltip is the Phase 8D
  surface; no rich pin card.
- Pins for non-selected routes are **not** rendered — the map
  stays uncluttered.
- A small `<MapLegend>` in the bottom-right pins the four colors
  to their labels.

### Map focus / selection behavior

- Selected polygon: heavier stroke (4 px), deeper fill (32 %
  opacity), `zIndex` 5 so it sits on top of other shapes.
- Selected line: 5 px stroke.
- Initial render auto-fits bounds across all shapes (only when
  no selection + no prior focus).
- Focus on map (from the table) bumps a `focusToken`; an effect
  refits bounds to that route's shape. Selecting via shape click
  does **not** refit (the user already sees it).
- Closing the details overlay clears the selection; the
  pins unmount and the polygon returns to default styling.

### Cooldown display

- Real workspace → `now()`.
- Simulation workspace + active save → save's
  `simulated_current_at` (existing Phase 8C status pill in the
  page header surfaces "Cooldown: simulated clock").
- Simulation workspace + no active save → wall-clock fallback
  (existing Phase 8C warning pill).
- The cooldown headline + counts in the details overlay + table
  use the same reference time the page computed.

### Tests

- 17 new pure tests for `route-map-display.ts` (pin status branches
  including the defensive "completed + not_completed → eligible"
  case, every headline kind, counts singular/plural/skipped
  inclusion, selection lookup edge cases).
- All 4 existing Phase 8C route-map helper tests continue to pass.
- All 40 Phase 8B helper tests continue to pass.

### What Phase 8D deliberately does NOT do

- No Generate Route overlay (Phase 8E, optional).
- No GPS / live worker / route optimization / turn-by-turn.
- No manual polygon drawing or editing.
- No lasso / bulk completion.
- No manual pin completion (clicking a pin shows tooltip only).
- No cooldown filtering inside RentCast route generation.
- No CRM / simulation outcomes, no message-engine calls.
- No edit / delete / archive on routes, route stops, designs,
  campaigns, or distribution sessions.
- No public `/q` changes.
- No schema changes.

---

## 17. Phase 8A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [ ] `CLAUDE.md` carries a Phase 8 pointer paragraph.
- [ ] `README.md` Status section names Phase 8 and links to this doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 8A ends at docs only. Phase 8B is the first step that touches
code, and it only ships after this doc is reviewed and approved.
