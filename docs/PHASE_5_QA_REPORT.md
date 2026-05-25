# Phase 5 QA Report

**Date:** 2026-05-25
**Step:** Phase 5D — Phase 5 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
(including Appendix A — Phase 5A-2 product/design addendum,
Appendix B — Phase 5B-1 schema + plugin registration, and
Appendix C — Phase 5C RentCast route generation).

This pass closes out Phase 5 (Door Hanger Plugin Foundation +
Address-Based RentCast Route Generation). **No new features were added
in this step.** The simulation loop remains deferred to Phase 6+.

---

## 1. Commands run

| Command            | Result    | Notes                                                  |
| ------------------ | --------- | ------------------------------------------------------ |
| `npx tsc --noEmit` | **pass**  | 0 errors.                                              |
| `npm run test`     | **pass**  | **412 / 412** tests across 42 test files.              |
| `npm run lint`     | **pass**  | No ESLint warnings or errors.                          |
| `npm run build`    | **pass**  | All routes compile green; `/admin/marketing/door-hangers` at 7.64 kB. |

---

## 2. What shipped in Phase 5 (recap)

- **Phase 5A** — original architecture doc (plugin-backed simulation
  principle, plugin + simulation adapter model, simulation time model,
  dataset separation).
- **Phase 5A-2** — product/design addendum: Marketing nav, single
  dashboard, campaign-first workflow, create-only first, model
  details, address-based RentCast generation requirements, **simulation
  pushed to Phase 6+**.
- **Phase 5B-1** — Door Hanger schema (5 tables) + RLS + plugin
  registration (`plugin_definitions` + `installed_plugins` for
  Crystal Bear). No demo records seeded.
- **Phase 5B-2** — Marketing nav + `/admin/marketing/door-hangers`
  dashboard + create-only flows for campaigns, inventory, manual
  routes, and distribution sessions. Inventory `quantity_used`
  maintained app-level in the session action.
- **Phase 5B-2 bugfix** — Session form `<select>` staleness: fixed via
  `useEffect` sync when parent picker arrays change.
- **Phase 5C** — Address-based RentCast route generation: ONE batch
  `/v1/properties` request per preview, candidate selection UI, save
  with zero additional RentCast calls.

---

## 3. Phase 5 Definition of Done — checklist

Drawn from Phase 5 doc §15 (success definition) augmented by
Appendix A (revised scope), Appendix B (schema deliverable), and
Appendix C (RentCast generation deliverable).

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md` + Appendices A / B / C. |
| Plugin-backed simulation principle documented | ✅ | §2 of the source doc; Appendix A clarifies that the Door Hanger plugin must exist as a real tool before any simulator uses it. |
| Door Hanger schema applied | ✅ | 5 tables present on the linked project; Phase 5B-1 verification logged. |
| `door_hanger` plugin registered + installed for Crystal Bear | ✅ | `plugin_definitions` row + `installed_plugins` row verified in Phase 5B-1. |
| Marketing nav group exists | ✅ | `nav-config.test.ts` pins order + Marketing → Door Hangers entry. |
| Dashboard at `/admin/marketing/door-hangers` exists | ✅ | One page, four sections (Campaigns / Inventory / Routes / Recent sessions). |
| Create flows for campaign / inventory / manual route / session work | ✅ | All four use the shared admin server-action pattern; pre-flight + DB CHECKs both enforce the rules. |
| Inventory `quantity_used` increments on session insert | ✅ | App-level update in `createDistributionSession`; DB CHECK `quantity_used <= quantity_received` provides the safety net. |
| `material_cost_cents` derived when `cost_per_hanger_cents` is set | ✅ | Pure `computeMaterialCostCents` + 4 unit tests. |
| Insufficient-inventory rejected with a friendly error | ✅ | `hasEnoughInventory` + `INSUFFICIENT_INVENTORY` field error. |
| Address-based RentCast generation lives under Routes | ✅ | "Generate route from address" toggle above the manual route form. |
| **Preview = exactly one RentCast request** | ✅ | `RENTCAST_PREVIEW_REQUEST_COUNT = 1` constant; pinned by test. UI badge shows "Estimated RentCast requests: 1". |
| **Save = zero RentCast requests** | ✅ | `saveRentcastRoute` takes the preview payload only; `grep` confirms one `searchPropertiesByRadius` call site (in `generateRoutePreview`). |
| Target capped at 500 | ✅ | `clampTargetToBatchLimit(target)` returns `OVER_BATCH_LIMIT` with a friendly message > 500. |
| Candidate safe subset only | ✅ | `normalizeRentcastCandidate` projects 8 known-safe fields; owner / sale-history / tax fields stripped (tested). |
| Preview before save (no auto-save) | ✅ | Preview state is required to render the save UI. |
| No edit / delete / archive flows | ✅ | None present in code or UI. |
| No new schema after Phase 5B-1 | ✅ | `supabase/migrations/` shows only the four pre-existing migrations. |
| No simulation loop / CRM lead generation / maps / GPS | ✅ | None present in code; Do-Not-Build audit §5 below. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_5_QA_REPORT.md` exists | ✅ | This file. |

Phase 1+2+3+4 Definition-of-Done items remain in force; nothing in
Phase 5 regressed them.

---

## 4. Manual test checklist

Each of the seven groups requested by Phase 5D, exercised against the
linked Supabase project during the corresponding sub-phase.

### 4.1 Plugin registration + schema

| Step | Status |
|---|---|
| `door_hanger` plugin definition exists | ✅ |
| Crystal Bear `installed_plugins` row exists + `status=enabled` | ✅ |
| 5 `door_hanger_*` tables present | ✅ |
| RLS enabled on all 5 tables (Pattern B; members-SELECT only) | ✅ |
| No demo data seeded — only plugin registration | ✅ |
| No secrets visible in source / UI / logs | ✅ |

### 4.2 Marketing navigation

| Step | Status |
|---|---|
| Marketing nav group appears | ✅ |
| Door Hangers appears under Marketing | ✅ |
| Nav order: `Overview / CRM / Tasks / Marketing / Automations / Plugins / Observability / Tools` | ✅ pinned by `nav-config.test.ts` |
| No placeholder marketing pages (Facebook / Google / Referrals / SEO) | ✅ pinned by nav test |

### 4.3 Door Hanger dashboard

| Step | Status |
|---|---|
| `/admin/marketing/door-hangers` loads | ✅ |
| Campaigns / Inventory / Routes / Recent sessions sections render | ✅ |
| Friendly empty states work for each section | ✅ |

### 4.4 Create-only flows

| Step | Status |
|---|---|
| Create campaign works | ✅ |
| Create inventory / design works | ✅ |
| Create manual route works | ✅ |
| Log manual distribution session works | ✅ |
| `quantity_used` increases after session | ✅ |
| `quantity_remaining` decreases | ✅ |
| Material cost calculated when `cost_per_hanger_cents` set | ✅ |
| Insufficient inventory rejected safely (`INSUFFICIENT_INVENTORY`) | ✅ |
| No edit / delete / archive flows present | ✅ |

### 4.5 RentCast route generation

| Step | Status |
|---|---|
| "Generate route from address" flow appears | ✅ |
| Center address uses `GoogleAutocomplete` | ✅ |
| UI badge reads "Estimated RentCast requests: 1" | ✅ |
| Preview fires exactly **one** RentCast batch request | ✅ — manually confirmed against the live RentCast token; preview consumed exactly **1** API request |
| Target count capped at 500 (`OVER_BATCH_LIMIT` otherwise) | ✅ |
| Zero per-property RentCast lookups | ✅ — only `searchPropertiesByRadius` call site is the preview |
| Candidate preview shows address / type / sqft / value / distance | ✅ |
| User can deselect candidates | ✅ |
| Save creates one `door_hanger_routes` row (`generated_from_source='rentcast'`) | ✅ |
| Save creates one `door_hanger_route_stops` row per selected candidate | ✅ |
| **Save makes 0 additional RentCast requests** | ✅ — manually confirmed: saving the preview did **not** consume another RentCast token |
| Route row shows `source=rentcast` badge + stop count | ✅ |
| `rentcast_snapshot` excludes owner / sale-history / tax fields | ✅ pinned by `normalizeRentcastCandidate` tests |

### 4.6 Regression checks

| Surface | Status |
|---|---|
| `/admin/marketing/door-hangers` still works after refresh | ✅ |
| `/admin/contacts` loads | ✅ |
| `/admin/quotes` loads | ✅ |
| `/admin/tasks` loads | ✅ |
| `/admin/message-automations` loads | ✅ |
| `/q` builds + loads | ✅ |
| Manual Door Hanger flows still work alongside RentCast generation | ✅ |

---

## 5. RentCast API usage / cost guardrail confirmation

This guardrail is the load-bearing constraint of Phase 5C and the
reason it shipped at all.

- **`RENTCAST_PREVIEW_REQUEST_COUNT = 1`** is a single source of truth
  consumed by:
  - the UI badge ("Estimated RentCast requests: 1"),
  - the server result payload (`estimatedRentcastRequests: 1`), and
  - a unit test that asserts the constant equals 1.
- **`clampTargetToBatchLimit`** rejects `target > 500` with
  `OVER_BATCH_LIMIT`, so the operator cannot accidentally provoke
  pagination.
- **`searchPropertiesByRadius` has one call site** in the entire
  codebase: `src/core/door-hanger/rentcast-route.ts` inside
  `generateRoutePreview`. The save path (`saveRentcastRoute`) takes
  the preview payload only and writes route + route_stops without
  another network call. Verified by `grep`.
- **No per-property `lookupPropertyByAddress` calls** were added in
  Phase 5C. The legacy `enrichProperty` path remains used only by the
  Phase 1 customer-quote flow.
- **Manual confirmation:** a real route preview was tested against
  the live RentCast token and used exactly **1** API request. Saving
  the same preview did **not** consume an additional RentCast
  request.

---

## 6. Do-Not-Build audit

Audited against §13 + Appendix A.12 of the Phase 5 doc. Every item is
confirmed **NOT** present in Phase 5 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Simulation loop / `Hang 1` / `Hang Route` | ✅ not built | No simulation routes, no adapter calls. Distribution sessions only record real activity (`mode='real'`). |
| CRM lead generation from door hangers | ✅ not built | No contact / lead / quote / task / event / activity inserts from any door-hanger code path. |
| Response / outcome generation | ✅ not built | No timers / delayed-job code; no response-rate scoring engine. |
| Maps / GPS / route optimization | ✅ not built | No map components; no TSP / ordering beyond RentCast's natural return order; candidates rendered as a simple list. |
| Worker mobile app | ✅ not built | Web only. |
| Edit / delete / archive flows | ✅ not built | Server actions are create-only. |
| Commissions / pay | ✅ not built | No commission tables or fields. |
| Customer messaging triggers from door hangers | ✅ not built | Phase 3 message automation engine remains tied to `task.created` only. |
| Jobs / invoices / scheduling | ✅ not built | No new tables / routes / actions. |
| Data import / export (incl. printer price-sheet importer) | ✅ not built | Printer total print cost is entered manually per Appendix A.6. |
| Full game loop | ✅ not built | Out of scope. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Production deployment of simulation | ✅ not built | Simulation surface does not exist. |

The Phase 1 + 2 + 3 + 4 Do-Not-Build lists also remain in force;
nothing in Phase 5 touched any of those items.

---

## 7. Security / schema check

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| `RENTCAST_API_KEY` ever rendered in UI | ✅ never — only `present` / `missing` style status would surface it, and even that is not exposed in Phase 5 admin pages |
| `RENTCAST_API_KEY` read only in server-only files | ✅ `src/core/property-data/rentcast-provider.ts` + `rentcast-search.ts` (both `import "server-only"`) |
| RLS posture on the 5 Phase 5 tables | ✅ Pattern B (members SELECT; writes via service-role server actions); verified in Phase 5B-1 verification |
| Business-scoping on Phase 5 admin actions | ✅ every action runs `requireBusiness()`; the create helpers re-verify FK ownership before inserts |
| Service-role client confined to `import "server-only"` modules | ✅ grep confirms no `"use client"` directive in `src/core/door-hanger/*`, `src/core/property-data/*`, or `src/plugins/door-hanger/*` |
| New schema added since Phase 5B-1 | ✅ none (`supabase/migrations/` shows only the four pre-existing migrations) |

---

## 8. Known issues / accepted limitations

None of these block Phase 5 sign-off. Each is documented in the
relevant sub-phase summary.

1. **No pagination on RentCast search.** Single 500-cap batch only.
   Pagination is deferred to a later phase that needs it.
2. **No route detail page.** The dashboard row exposes the source
   badge + stop count; opening a dedicated route page wasn't required
   for Phase 5.
3. **No edit / delete / archive on any door-hanger record.** Per
   "create-only first" rule (Appendix A.5). If the operator needs a
   correction, the workaround is a fresh record + ignoring the
   duplicate.
4. **App-level `quantity_used` maintenance.** The session create
   helper increments `door_hanger_designs.quantity_used` after
   inserting the session. The DB CHECK `quantity_used <=
   quantity_received` provides the safety net. If the update step
   fails after the session insert, the session is preserved and the
   error is surfaced (`INVENTORY_UPDATE_FAILED`). Documented inline.
5. **`distance` field on candidates** comes either from RentCast's
   response or from a local Haversine fallback; both are accurate
   enough for preview ordering, not for navigation.
6. **No live RentCast integration tests** — they'd leak quota and
   require a real token. Pure helpers (URL shape, limit clamp,
   candidate normalisation, safe subset, request count constant)
   are covered by 20 unit tests.
7. **Phase 5B-2 staleness bug** (session form picked the first option
   visually but submitted `""`) was fixed by `useEffect` sync; no
   pure helper exists to test it because the bug is a render-cycle
   interaction.

---

## 9. Readiness verdict

**Phase 5 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 412/412, `lint`, `build`).
- All Definition-of-Done criteria pass.
- The RentCast API guardrail is enforced in code + verified manually
  (1 request per preview, 0 per save).
- The Do-Not-Build audit is clean.
- The security / schema review is clean.
- Phase 1 / 2 / 3 / 4 regression checks pass.
- Known issues are minor and documented.

Next-phase work should start from a new source-of-truth doc — Phase 5
deliberately stops at "real Door Hanger plugin + RentCast-backed
routes." The Phase 6+ simulation loop (Hang 1 / Hang Route / time
advance / delayed CRM outcomes) remains documented in §§4, 6, 7 and
will be picked up as its own phase.
