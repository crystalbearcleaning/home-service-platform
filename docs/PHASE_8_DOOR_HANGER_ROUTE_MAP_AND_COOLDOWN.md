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
