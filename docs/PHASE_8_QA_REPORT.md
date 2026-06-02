# Phase 8 QA Report

**Date:** 2026-06-02
**Step:** Phase 8F — Phase 8 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md`
(Appendix A — Phase 8B schema + helpers, Appendix B — Phase 8C map
workspace shell, Appendix C — Phase 8D overlays + selected-route
pins).

This pass closes out Phase 8 (Door Hanger Route Map + Cooldown
Foundation). **No new features were added in this step.** Phase 8E
(Generate Route overlay) was **intentionally skipped** — see §10
below.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **579 / 579** tests across 53 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/marketing/door-hangers/routes` at 5.55 kB. |

DB-side verification (via `supabase db query --linked`):

| Check | Result |
|---|---|
| `door_hanger_routes.cooldown_days` column shape | ✅ `integer`, NOT NULL, default `60` |
| `door_hanger_routes_cooldown_days_nonneg` CHECK | ✅ present (`CHECK (cooldown_days >= 0)`) |
| Existing routes back-filled to 60 | ✅ 4/4 routes; min = max = 60 |

---

## 2. What shipped in Phase 8 (recap)

- **Phase 8A** — source-of-truth doc + Phase 8 pointer paragraphs in
  `CLAUDE.md` / `README.md`.
- **Phase 8B** — two migrations:
  `20260602120000_phase_8_door_hanger_cooldown.sql` adds the
  `cooldown_days` column; `20260602120100_phase_8_door_hanger_cooldown_check.sql`
  is a small follow-up that landed the CHECK constraint after the
  original guarded `DO $$` block silently no-op'd against Supabase.
  Pure helpers in `route-map-geometry.ts` (`computeConvexHull`,
  `computeRouteShape`), `cooldown.ts` (`computeCooldownStatus`,
  `summarizeRouteCooldown`, `getDoorHangerRouteMapReferenceTime`,
  `DOOR_HANGER_DEFAULT_COOLDOWN_DAYS = 60`), and the server-only
  `loadRouteMapData` loader. 40 unit tests across three files.
- **Phase 8C** — `/admin/marketing/door-hangers/routes` map
  workspace shell, shared `use-google-maps-bootstrap` hook,
  `<RouteMap>` client component (polygons / lines / points /
  circles, click-to-select with a placeholder details panel),
  dashboard **Open Route Map →** card. 4 new unit tests for
  `resolveSelectedRouteId`. Includes the Phase 8C bug fix that
  added `mapReady` to the shape-drawing effect's deps so shapes
  actually render after the asynchronous Map mount.
- **Phase 8D** — full `<RouteDetailsOverlay>`, floating Routes
  button + `<RoutesTableOverlay>` with per-row Focus-on-map,
  selected-route stop pins (tinted by status + cooldown via
  `pinStatusForStop` / `STOP_PIN_COLORS`), selected shape
  emphasis, focus-token bounds-fit, and a small `<MapLegend>`.
  17 new pure tests for the presentation helpers
  (`route-map-display.ts`).
- **Phase 8E** — **intentionally skipped** (see §10).

---

## 3. Phase 8 Definition of Done — checklist

Drawn from §16 of the Phase 8 doc + each appendix's "What did NOT
ship" section.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | Phase 8 doc + Appendices A / B / C. |
| `/admin/marketing/door-hangers/routes` exists | ✅ | Built page at 5.55 kB. |
| Existing dashboard links to it | ✅ | "Route map" SectionCard with **Open Route Map →** Link. |
| Saved routes show on Google Maps as polygons / circles when possible | ✅ | Convex hull for RentCast routes, circle for manual routes with center + radius, point/line for degenerate stops, none → table-only badge. |
| Route details overlay works | ✅ | `<RouteDetailsOverlay>` shows route name, campaign, source, status, total stops, all 5 cooldown counts, last completed, cooldown days, next eligible, center + radius, latest session. Read-only. |
| Routes table overlay works | ✅ | Floating button → `<RoutesTableOverlay>`. Per-row **Focus on map** selects + closes table + opens details + refits bounds; disabled for table-only routes. |
| Cooldown status / counts display correctly | ✅ | `cooling_down + eligible = completed` invariant pinned by `summarizeRouteCooldown` tests; rendered via `routeCooldownHeadline` + `formatRouteCountsLine`. |
| Cooldown uses real `now()` or simulation save time correctly | ✅ | `getDoorHangerRouteMapReferenceTime` returns `real_now` / `simulated_clock` / `fallback_now_no_active_save`; surfaced in a page-header status pill. |
| No forbidden Phase 8 items built | ✅ | Do-Not-Build audit §8 below. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_8_QA_REPORT.md` exists | ✅ | This file. |
| `CLAUDE.md` Phase 8 pointer | ✅ | Added in Phase 8A. |
| `README.md` Phase 8 status block | ✅ | Added in Phase 8A. |

Phase 1+2+3+4+5+6+7 Definition-of-Done items remain in force;
nothing in Phase 8 regressed them. See §9 below.

---

## 4. Manual test checklist

### 4.1 Schema + helpers

| Step | Status |
|---|---|
| `door_hanger_routes.cooldown_days` exists (integer NOT NULL DEFAULT 60) | ✅ DB-verified |
| `door_hanger_routes_cooldown_days_nonneg` CHECK ≥ 0 exists | ✅ DB-verified |
| Existing routes back-filled to 60 | ✅ 4/4 routes at 60 |
| `computeConvexHull` returns `none / point / line / polygon` correctly | ✅ pinned by 14 hull tests |
| `computeRouteShape` falls back hull → circle → none | ✅ pinned by 6 shape tests |
| `computeCooldownStatus` covers `cooling_down / eligible / not_completed` + edge cases | ✅ pinned by 8 cooldown tests |
| `summarizeRouteCooldown` invariant `cooling + eligible = completed` | ✅ pinned by 5 summary tests |
| `getDoorHangerRouteMapReferenceTime` covers all 3 sources | ✅ pinned by 5 ref-time tests |
| `loadRouteMapData` is server-only + service-role + no external API calls | ✅ — no `fetch` / `lookupPropertyByAddress` / Google calls in the loader |
| No RentCast calls in map loader | ✅ — `searchPropertiesByRadius` call site still only in `rentcast-route.ts` (Phase 5C preview path) |
| No Google calls on the server | ✅ — Google Maps JS only loads in the client `<RouteMap>` |

### 4.2 Dashboard link

| Step | Status |
|---|---|
| `/admin/marketing/door-hangers` still loads | ✅ |
| Existing dashboard sections intact (Campaigns / Inventory / Routes / Recent distribution sessions) | ✅ unchanged |
| **Open Route Map →** Link appears in a "Route map" `<SectionCard>` near the top | ✅ |
| Link goes to `/admin/marketing/door-hangers/routes` | ✅ |
| Existing create flows still work (campaigns, designs, manual routes, RentCast generation, distribution sessions) | ✅ none of their code touched in Phase 8 |

### 4.3 Route map workspace

| Step | Status |
|---|---|
| `/admin/marketing/door-hangers/routes` loads | ✅ (5.55 kB / 153 kB First Load JS) |
| Google Maps base layer mounts via the shared bootstrap hook | ✅ |
| RentCast routes with valid stops render as convex-hull polygons | ✅ |
| 1-stop / 2-stop / collinear cases render as point / line | ✅ |
| Manual routes with `center_lat / center_lng / radius_miles > 0` render as circles | ✅ |
| Routes with no usable geometry are counted as "table-only" (warning pill + footer note + table row with disabled Focus) | ✅ |
| `fitBounds` runs on initial render (no selection) and on Focus-on-map | ✅ — Phase 8C bug fix added `mapReady` to deps; focus token decoupled from selection |
| Only Google Maps provider used (no Mapbox / Leaflet added) | ✅ — grep finds zero `mapbox` / `leaflet` references |

### 4.4 Route details overlay

| Step | Status |
|---|---|
| Clicking a route shape opens the overlay | ✅ |
| Shows route name + campaign (when set) + source + status | ✅ |
| Shows total stops + pending / completed / skipped counts | ✅ |
| Shows cooling-down + eligible counts | ✅ |
| Shows last completed | ✅ |
| Shows cooldown days | ✅ |
| Shows next eligible (route-level earliest) | ✅ |
| Shows center + radius when present | ✅ |
| Shows latest distribution session summary when present | ✅ |
| Overlay is read-only — no edit / delete / archive / manual completion | ✅ — exposes Close only |
| Closing the overlay clears selection + tears down pins | ✅ |

### 4.5 Routes table overlay

| Step | Status |
|---|---|
| **Routes (N)** button toggles the table overlay | ✅ |
| Table lists **all** routes including table-only ones | ✅ — page forwards all routes; table renders both |
| Columns: name + campaign + source + status + counts line + cooldown headline + last/next dates + cooldown days | ✅ |
| Per-row **Focus on map** action | ✅ |
| Focus selects route → closes table → opens details overlay → refits bounds | ✅ — `focusToken` bump triggers the bounds-fit effect |
| Table-only routes show a warning footnote + disabled Focus | ✅ |
| No advanced filters / saved views / multi-select | ✅ — none in code |
| No navigation away from the workspace | ✅ — table closes in place |

### 4.6 Selected route pins

| Step | Status |
|---|---|
| Selecting a route shows only that route's pins | ✅ — pins effect filters by `selectedRouteId` |
| Pin tints reflect status + cooldown via `pinStatusForStop` | ✅ — `pending / completed_cooling / completed_eligible / skipped` |
| Tooltip (`title`) shows address + status + completed date + next eligible date when present | ✅ |
| Closing the details overlay clears selection → pins unmount | ✅ |
| No manual pin completion / drawing / lasso added | ✅ — pins are display-only |
| Bottom-right `<MapLegend>` pins colors → labels | ✅ |

### 4.7 Cooldown behavior

| Step | Status |
|---|---|
| Cooldown driven by `route.cooldown_days` (not a hardcoded 2 months) | ✅ — `normalizeCooldownDays(v_cooldown)` reads the column |
| `next_eligible_at = completed_at + cooldown_days` | ✅ pinned by `computeCooldownStatus` tests |
| Real workspace uses `now()` | ✅ — `getDoorHangerRouteMapReferenceTime({isSimulation:false})` returns `real_now` |
| Simulation workspace + active save uses `simulated_current_at` | ✅ — pinned by `simulated_clock` test |
| Simulation workspace + no active save falls back to `now()` + notice | ✅ — pinned by `fallback_now_no_active_save` test; page header surfaces a warning pill |
| `cooling_down + eligible = completed` invariant holds | ✅ — pinned by summary test |
| `pending` + `skipped` are independent of cooldown | ✅ — same |

---

## 5. Security / schema check

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` only read in client modules | ✅ — `use-google-maps-bootstrap.ts` + `google-autocomplete.tsx`; never on the server |
| Service-role client confined to `import "server-only"` modules | ✅ — `route-map-data.ts`, `simulation-start.ts`, `simulation-hang.ts`, etc., all still server-only |
| Phase 8 schema changes | ✅ one column on `door_hanger_routes`: `cooldown_days integer NOT NULL DEFAULT 60` (Phase 8B migration + small follow-up CHECK migration) |
| New external API calls from Phase 8 code | ✅ none — RouteMap only loads the Maps JS library client-side; loader is pure DB reads |
| RLS posture unchanged | ✅ — Phase 8B touched no RLS policies |

---

## 6. Skipped Phase 8E (Generate Route overlay)

Phase 8E was **intentionally skipped**.

- Reason: the existing Phase 5C RentCast Generate Route flow needs
  deeper improvements (richer filters, candidate culling, optional
  cooldown-aware exclusion, possibly per-stop preview) before it's
  worth embedding into the map workspace as an overlay.
- Embedding the current form unchanged would have re-exposed a
  workflow the operator already has at
  `/admin/marketing/door-hangers` without adding meaningful value.
- The Phase 5C RentCast cost guardrail (1 preview = 1 RentCast
  request, save = 0 RentCast requests) **remains untouched**. The
  existing form continues to be the canonical generator.
- The map workspace already shows freshly-generated routes (the
  loader is read-after-write) — the operator generates from the
  dashboard, then revisits the map.

**Phase 8E moves to a separate future phase** focused on Generate
Route improvements. That phase should consider cooldown filtering at
generation time (Phase 8 only displays cooldown), richer property
filters, and the optional in-workspace overlay placement once the
underlying flow is worth re-skinning.

The Phase 8 doc's §10 "Generate Route Overlay" section remains
accurate as a forward-looking note.

---

## 7. Phase 8 closes after route map / cooldown foundation

The shipped scope is exactly what the Phase 8 doc §1 promised:

> Phase 8 is **Door Hanger Route Map + Cooldown Foundation**. Goal:
> make saved Door Hanger routes **visible** as geographic assets,
> and make per-stop completion history **legible** as a cooldown
> signal.

What did **not** land (and was either deferred to a follow-up or
explicitly out of scope):

- Generate Route overlay (Phase 8E, deferred).
- Cooldown filtering inside route generation (§11 deferred).
- Cross-route property dedupe (§12 deferred).
- GPS, lasso, manual pin completion, route optimization, etc.
  (§15 do-not-build).

---

## 8. Do-Not-Build audit

Audited against §15 of the Phase 8 doc + each appendix's "What did
NOT ship" section. Every item is confirmed **NOT** present in
Phase 8 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Generate Route overlay | ✅ not built | No `generate-route-overlay.*` files in `/admin/marketing/door-hangers/routes/`; `<RentcastRouteGenerator>` is only mounted on the existing dashboard. |
| Route generation redesign | ✅ not built | `src/core/door-hanger/rentcast-*` and `src/app/admin/marketing/door-hangers/rentcast-route-form.tsx` untouched in Phase 8. |
| Cooldown filtering inside route generation | ✅ not built | `loadRouteMapData` reads cooldown but does not exclude rows; RentCast preview path does not filter on cooldown. |
| GPS tracking | ✅ not built | No `geolocation` / `watchPosition` / `navigator.geolocation` calls in Phase 8 code. |
| Live worker app | ✅ not built | Web only; no PWA / mobile-specific surface added. |
| Route optimization | ✅ not built | No TSP / ordering code; map renders shapes in their stored order. |
| Turn-by-turn directions | ✅ not built | No Directions API / waypoint UI added. |
| Manual polygon drawing / editing | ✅ not built | No `DrawingManager` import; polygons are pure render from convex hull. |
| Lasso / bulk completion | ✅ not built | No drawing / selection UI; pins are click-tooltip only. |
| Manual pin completion | ✅ not built | Pins have no click handlers beyond the native title tooltip. |
| CRM lead / job / outcome generation | ✅ not built | Loader writes nothing; no contacts/leads/quotes/tasks/notifications writes anywhere in Phase 8. |
| Simulation outcomes | ✅ not built | Map workspace makes no simulation_activity / simulation_runs / Hang-RPC calls. |
| Message-automation outcomes | ✅ not built | Phase 3 automation engine untouched. |
| Jobs / invoices / scheduling / appointments / payments | ✅ not built | No new tables / routes / actions. |
| Full game economy | ✅ not built | Out of scope. |
| Plugin builder / plugin marketplace | ✅ not built | Plugin registry unchanged. |
| Data import / export | ✅ not built | No importer / exporter code. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Public `/q` changes | ✅ not built | `/q` route unchanged; build size still 6.54 kB. |
| Edit / delete / archive on routes / stops / designs / campaigns / sessions | ✅ not built | Phase 8 exposes only Close + Focus-on-map controls. |

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 Do-Not-Build lists also remain
in force; nothing in Phase 8 touched any of those items.

---

## 9. Regression checks

| Surface | Status |
|---|---|
| `/admin/marketing/door-hangers` still works | ✅ — only the new "Route map" SectionCard was added; existing sections + forms untouched |
| Manual Door Hanger create / session logging still works | ✅ — `createCampaign / createDesign / createManualRoute / createDistributionSession` unchanged |
| RentCast route generation from existing dashboard still works | ✅ — `<RentcastRouteGenerator>` + `rentcast-route.ts` untouched |
| `/admin/simulation/play` still works | ✅ — 3.41 kB, unchanged |
| Phase 7 Door Hanger simulation Hang actions still build | ✅ — `simulation-hang.ts` + RPC paths untouched |
| `/admin/simulation` (Saves) still works | ✅ — 1.66 kB, unchanged |
| Workspace switcher still works | ✅ — Phase 6D code unchanged |
| Simulation Mode banner still works | ✅ — Phase 6D code unchanged |
| `/admin/contacts` + `/admin/quotes` load | ✅ |
| `/admin/message-automations` loads | ✅ |
| `/q` loads / builds | ✅ — 6.54 kB, unchanged |
| Sidebar nav highlight still single-route correct on `/admin/marketing/door-hangers/routes` | ✅ — Phase 7C `resolveActiveNavHref` longest-prefix fix matches "Door Hangers" once |

---

## 10. Known issues / accepted limitations

None of these block Phase 8 sign-off.

1. **Phase 8B CHECK constraint required a follow-up migration.**
   The guarded `DO $$` block in the original Phase 8B migration
   silently no-op'd against the Supabase project; the small
   `20260602120100_phase_8_door_hanger_cooldown_check.sql`
   follow-up added the CHECK directly. Pattern noted in the Phase
   8B verification step — future Phase 8+ migrations that need
   guarded constraints should either run the ALTER directly or
   verify the `pg_constraint` insert path after apply.
2. **Generate Route overlay deferred to a follow-up phase.**
   Documented in §6 above. The Phase 5C RentCast cost guardrail
   (1 preview = 1 RentCast request, save = 0) remains the only
   route-generation contract.
3. **Cooldown filtering at generation time is still deferred.**
   `door_hanger_route_stops.completed_at` (Phase 7B) and
   `cooldown_days` (Phase 8B) are both readable, but the RentCast
   generator does not consult them. Documented as a known
   limitation since Phase 7B; Phase 8 only **displays** cooldown.
4. **Pin tooltips are native-title-only.** Phase 8D shipped the
   cheap surface — Google Maps `Marker.title` shows the browser's
   native tooltip on hover. A richer pin popover (InfoWindow with
   formatted layout) can land in a future phase if operator
   feedback demands it.
5. **Convex hull is a static visualization.** When the operator
   completes a few stops, the hull does not redraw to exclude
   completed stops — the polygon stays static. That matches the
   operator's mental model ("the route covers this neighborhood")
   but is a known visual simplification.
6. **No automated browser tests for the map workspace.** The
   build + lint + 579-test suite covers the data layer + pure
   helpers + DTO wiring; browser-level confirmation (Google Maps
   render, click-to-select, Focus-on-map, pin tints, table
   overlay) is done manually during rollout.
7. **`computeRouteShape` shape-resolution priority is hull first,
   circle second.** A route that has both stops AND a center+radius
   prefers the polygon, never the circle. This is per design (§6
   of the Phase 8 doc); documented here so a future ROI / coverage
   feature knows where to look.

---

## 11. Readiness verdict

**Phase 8 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 579 / 579, `lint`,
  `build`).
- All Definition-of-Done criteria pass.
- DB-side verification confirms the `cooldown_days` column shape,
  the CHECK constraint, and the 4-route back-fill to 60.
- The Do-Not-Build audit is clean.
- The security / schema review is clean.
- Phase 1 / 2 / 3 / 4 / 5 / 6 / 7 regression checks pass.
- Phase 8E (Generate Route overlay) is intentionally skipped per
  the operator brief; documented as a separate follow-up phase.
- Known issues are minor and documented.

Next-phase work should start from a new source-of-truth doc.
Likely candidates (exact naming TBD):

- **Generate Route v2** — the deeper RentCast / generation rework
  that justifies an in-workspace overlay, plus cooldown filtering
  at generation time using the Phase 7B / 8B foundation.
- Cross-route property dedupe (property-level completion history
  feeding new-route construction).
- A real worker / field-execution surface (manual pin completion,
  GPS pause, drawing / lasso completion).
- ROI- / season- / campaign-aware cooldown rules layered on top of
  the per-route `cooldown_days` default.
- Plugin framework / plugin builder that codifies the simulation
  adapter contract (Phase 7) and the map provider contract (Phase 8)
  for future plugins.
