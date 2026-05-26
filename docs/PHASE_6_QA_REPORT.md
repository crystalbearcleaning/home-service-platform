# Phase 6 QA Report

**Date:** 2026-05-26
**Step:** Phase 6E — Phase 6 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md`
(Appendix A — Phase 6B-1 simulation workspace seed, Appendix B —
Phase 6C simulation_runs schema + admin UI, Appendix C — Phase 6D
switcher + banner + first guardrail).

This pass closes out Phase 6 (Simulation Workspace + Save Files
Foundation). **No new features were added in this step.** Gameplay
(Hang 1 / Hang Route / clock advance / CRM outcomes), plugin
simulation adapters, and the full plugin builder all remain deferred
to Phase 7+.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **447 / 447** tests across 45 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/simulation` at 1.66 kB. |

DB-side verification (via `supabase db query --linked`):

| Check | Result |
|---|---|
| `businesses.is_simulation` shape | `boolean`, NOT NULL, default `false` |
| `crystal-bear` workspace | `is_simulation=false`, status `active` |
| `crystal-bear-simulation` workspace | `is_simulation=true`, status `active` |
| `simulation_runs` RLS + policy + checks + indexes | RLS on; 1 policy; 5 CHECKs; 4 indexes (3 + pkey) |
| Zero CRM / Door Hanger rows on sim workspace | contacts / leads / quotes / tasks / door_hanger_* all **0** |
| Door Hanger plugin install on sim workspace | `door_hanger` `status=enabled` |
| Admin membership on sim workspace | `role_key=owner_admin`, `status=active` |
| `simulation_runs` active count on sim workspace | **1** (operator created one during Phase 6D manual testing — proves create + mark-active wired end-to-end; not a regression) |

---

## 2. What shipped in Phase 6 (recap)

- **Phase 6A** — source-of-truth doc + Phase 6 pointer paragraphs in
  `CLAUDE.md` / `README.md`.
- **Phase 6B-1** — `businesses.is_simulation` boolean (migration
  `20260526120000_phase_6_simulation_workspace.sql`) and the Crystal
  Bear Simulation workspace seed (`phase_6_seed.sql`) with Door Hanger
  plugin install + admin membership. No CRM / Door Hanger demo data.
- **Phase 6C** — `simulation_runs` table (migration
  `20260526130000_phase_6_simulation_runs.sql`), the
  `/admin/simulation` admin page (active-save card + list + create
  form, or "switch to simulation workspace" empty state on a real
  workspace), pure validation helpers + 25 unit tests, server-only
  create / mark-active helpers with single-active-save enforcement,
  controlled server actions.
- **Phase 6D** — workspace switcher in the admin topbar (HTTP-only
  cookie, RLS-gated membership list, "Sim" pill), Simulation Mode
  banner rendered for every admin page when the active workspace is a
  simulation workspace, GHL SMS adapter guardrail
  (`SIMULATION_NO_OP` skipped log when active business is simulation;
  fail-safe to existing send path on lookup failures). 25 admin pages
  updated mechanically to render the new shell slots.

---

## 3. Phase 6 Definition of Done — checklist

Drawn from §11 of the Phase 6 doc + Appendices A / B / C.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md` + Appendices A / B / C. |
| Simulation workspace approach documented | ✅ | §§2–3 + Appendix A. |
| Save / run model documented | ✅ | §4 + Appendix B + `schema.md` §22c. |
| Side-effect guardrails documented | ✅ | §7 + Appendix C. |
| Plugin simulation framework direction documented | ✅ | §8. |
| Implementation plan documented | ✅ | §9. |
| `CLAUDE.md` carries a Phase 6 pointer | ✅ |
| `README.md` carries a Phase 6 pointer | ✅ |
| Crystal Bear Simulation workspace exists | ✅ | DB-verified §1. |
| User can tell real vs simulation workspace at a glance | ✅ | Topbar workspace name + "Sim" pill + persistent banner. |
| User can create / list / open simulation saves | ✅ | `/admin/simulation` create form + list with `Make active` button. |
| Active save shows starting / current cash + simulated start / current date | ✅ | Active-save card + banner. |
| No gameplay or outcome generation was built | ✅ | Do-Not-Build audit §6 below. |
| No real external side effects from simulation workspace | ✅ | GHL guardrail; lookup-driven short-circuit verified in unit tests. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_6_QA_REPORT.md` exists | ✅ | This file. |

Phase 1+2+3+4+5 Definition-of-Done items remain in force; nothing in
Phase 6 regressed them.

---

## 4. Manual test checklist

The seven QA groups from the Phase 6E task brief, audited against
code + the linked Supabase project. Browser/runtime steps are noted
when the operator confirmed them during Phase 6D rollout.

### 4.1 Simulation workspace foundation

| Step | Status |
|---|---|
| `businesses.is_simulation` exists (boolean, NOT NULL, default false) | ✅ |
| Real Crystal Bear workspace `is_simulation=false` | ✅ |
| Crystal Bear Simulation workspace exists, `is_simulation=true` | ✅ |
| Admin user has active Owner / Admin membership on simulation workspace | ✅ |
| Door Hanger plugin installed/enabled on simulation workspace | ✅ |
| No CRM records seeded into simulation workspace | ✅ |
| No `door_hanger_*` records seeded into simulation workspace | ✅ |

### 4.2 Simulation saves / runs

| Step | Status |
|---|---|
| `simulation_runs` table exists | ✅ |
| RLS enabled | ✅ |
| `simulation_runs_members_select` policy exists | ✅ (SELECT, `authenticated`) |
| Indexes present (3 + pkey) | ✅ |
| CHECK constraints present (5: name non-empty, starting/current cash ≥ 0, status enum, simulated_current ≥ start) | ✅ |
| `/admin/simulation` route compiles | ✅ (1.66 kB) |
| Real workspace shows "switch to simulation workspace" state | ✅ — gated by `business.isSimulation`; render path tested |
| Simulation workspace shows save UI | ✅ — confirmed during Phase 6D rollout (1 active save observed on the linked project) |
| Create save works | ✅ — confirmed by `simulation_runs` row presence |
| Make active works | ✅ — confirmed by `status='active'` row |
| Only one active save per simulation workspace | ✅ — `statusesAfterMarkingActive` pure helper + 6 unit tests; DB-side check shows active count = 1 |
| No edit / delete / archive save UI exists | ✅ — `actions.ts` only exports `createSimulationRunAction` + `markSimulationRunActiveAction`; no edit/delete/archive endpoints anywhere |

### 4.3 Workspace switcher

| Step | Status |
|---|---|
| Switcher appears in admin topbar | ✅ — `renderWorkspaceSwitcher(shell)` wired in `AdminTopbar` for all 25 admin pages |
| Lists real + simulation workspaces for the active user | ✅ — `listMembershipBusinessesForUser` (RLS-gated) returns both |
| Clearly marks simulation workspace | ✅ — "Sim" pill in both the topbar trigger and the dropdown |
| Real → simulation switch works | ✅ — operator confirmed during Phase 6D rollout |
| Simulation → real switch works | ✅ — operator confirmed during Phase 6D rollout |
| Active workspace persists/refreshes | ✅ — HTTP-only cookie `admin_active_business_id`, 30-day lifetime; `revalidatePath('/admin', 'layout')` + `window.location.reload()` |
| Bad workspace ids rejected server-side | ✅ — `isValidBusinessIdCandidate` UUID shape + membership re-verification in `setActiveWorkspaceAction` (`NO_MEMBERSHIP`) |
| No workspace creation / membership management UI exists | ✅ — switcher is read-only over `business_memberships` |

### 4.4 Simulation Mode banner

| Step | Status |
|---|---|
| No banner on real workspace | ✅ — `resolveAdminShellContext` only populates `simulationBanner` when `business.isSimulation` |
| Banner appears on simulation workspace | ✅ — operator confirmed during Phase 6D rollout |
| "Simulation Mode" label visible | ✅ |
| Workspace name visible | ✅ |
| Active save name / simulated current time / current cash visible when one is active | ✅ |
| "No active save selected" state with link to `/admin/simulation` when none selected | ✅ |
| Banner warns "Real external effects are disabled" | ✅ |

### 4.5 Side-effect guardrail (GHL SMS)

| Step | Status |
|---|---|
| `sendInternalSmsNotification` checks `businesses.is_simulation` before the GHL config / pending-log path | ✅ — guardrail inserted after basic-input validation; verified by code reading |
| Simulation workspace returns skipped / `SIMULATION_NO_OP` | ✅ — single skipped `notification_logs` row + `{ ok: false, status: 'skipped', error: { code: 'SIMULATION_NO_OP' } }` |
| Simulation workspace does **not** call GoHighLevel | ✅ — guardrail returns before `getSmsProviderAdapter(input.providerKey)` is reached |
| Skipped notification log clearly indicates `SIMULATION_NO_OP` | ✅ — `error_code='SIMULATION_NO_OP'`, `error_message='Active business is a simulation workspace — real SMS sends are disabled.'` |
| Real workspace SMS behavior unchanged | ✅ — guardrail only triggers when `lookup.ok === true && lookup.isSimulation === true`; failed lookups fall through to existing path |
| Pure decision helper `shouldSkipForSimulation` covered by tests | ✅ — 4 unit tests pin the four outcomes (true→skip, false→no-skip, lookup error→no-skip, CLIENT_INIT_FAILED→no-skip) |

### 4.6 Regression checks

| Surface | Status |
|---|---|
| `/admin` loads in real workspace | ✅ — build green; codemod kept page logic intact |
| `/admin` loads in simulation workspace | ✅ — same render path, banner slot added |
| `/admin/marketing/door-hangers` loads in real workspace | ✅ — Phase 5 logic unchanged |
| `/admin/marketing/door-hangers` loads in simulation workspace | ✅ — Door Hanger plugin installed on simulation workspace; same dashboard renders |
| `/admin/contacts` + `/admin/quotes` still load in real workspace | ✅ |
| `/admin/message-automations` still loads | ✅ — page rendered through the same shell; no automation engine logic changed |
| `/q` still loads / builds | ✅ — Phase 1 customer-quote flow untouched |
| Phase 5 RentCast route generation code unchanged | ✅ — `src/core/door-hanger/*`, `src/core/property-data/rentcast-*` untouched; only the door-hangers **page** got the codemod's slot props |

---

## 5. Workspace switcher verification (deep dive)

- **Persistence:** HTTP-only cookie, `sameSite=lax`, `secure` in
  production, path-scoped to `/admin`, 30-day `maxAge`. Carries only a
  business UUID; the server re-verifies active membership every
  request.
- **Authorization re-check:** `setActiveWorkspaceAction` validates the
  UUID shape (`isValidBusinessIdCandidate`), then queries
  `business_memberships` for `(user_id, business_id, status='active')`
  before writing the cookie. Returns `NO_MEMBERSHIP` otherwise.
- **Resolver:** `getActiveBusinessForUser` reads the cookie; if it
  points to a workspace the user is no longer a member of (e.g.
  cookie left over after access removed), it falls back to the
  first-active-membership default — no errors, no leakage.
- **UI:** dropdown is read-only over the user's memberships. No
  affordance to create / invite / manage memberships.
- **Single-membership users:** see a static label instead of a
  dropdown trigger.

## 6. Simulation Mode banner verification (deep dive)

- **Server-rendered** so the active-save data comes straight from the
  shell-context fetch — no client state, no flicker.
- **Always-on across the admin** because the slot is wired in every
  page via the `resolveAdminShellContext` → `renderSimulationBanner`
  helper pair, not via `layout.tsx`. 25 pages updated mechanically.
- **Active-save data** sourced from `getActiveSimulationRun` (Phase
  6C); the banner reflects the single-active-save rule from §5 of the
  doc.
- **Real workspace** never sees the banner: `simulationBanner` is
  `null` when `business.isSimulation === false`.

## 7. Side-effect guardrail verification (deep dive)

Inserted at the top of `sendInternalSmsNotification` (after the basic
input checks, before the `MISSING_CONFIG` config check):

```
const simLookup = await lookupBusinessIsSimulation(input.businessId);
if (shouldSkipForSimulation(simLookup)) {
  // → write SIMULATION_NO_OP skipped log; return without calling GHL.
}
```

- **Fail-safe:** `shouldSkipForSimulation` only short-circuits when
  `lookup.ok === true && lookup.isSimulation === true`. Lookup
  failures (`DB_ERROR`, `CLIENT_INIT_FAILED`, etc.) fall through to
  the existing send path so real-workspace behavior is never affected
  by transient DB issues.
- **Log integrity:** a single skipped `notification_logs` row is
  written with `error_code='SIMULATION_NO_OP'`. No pending row is
  created, so retry / sent / failed paths never observe the skipped
  send.
- **No secret exposure:** `RENTCAST_API_KEY`, GHL bearer token, and
  GHL location id are never read in the guardrail path. The skipped
  log carries only the skip reason text.

Pure decision helper `shouldSkipForSimulation` covered by 4 unit
tests (`src/core/business/is-simulation-business.test.ts`). The
DB-write paths are exercised against the linked Supabase project.

---

## 8. Do-Not-Build audit

Audited against §10 of the Phase 6 doc. Every item is confirmed
**NOT** present in Phase 6 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Door Hanger Hang 1 / Hang Route gameplay | ✅ not built | No `/admin/marketing/door-hangers` gameplay actions; `door_hanger_distribution_sessions.mode` only ever set to `real`. |
| Simulated quote requests | ✅ not built | No new code paths to `submitContactAndConvert` from anywhere in `src/core/simulation/*` or `/admin/simulation/*`. |
| CRM lead / quote / task generation from simulation | ✅ not built | Grep shows zero `contacts` / `properties` / `leads` / `quotes` / `tasks` inserts in any simulation-related path. |
| Delayed customer responses | ✅ not built | No timer / delayed-job / queue code. |
| Message automation simulation outcomes | ✅ not built | Phase 3 automation engine unchanged; the only message-engine edit is the SMS guardrail short-circuit. |
| GPS / maps / route execution | ✅ not built | Phase 5C constraint still holds — no map / GPS / pin UI. |
| Route optimization | ✅ not built | No TSP / ordering code. |
| Worker mobile app | ✅ not built | Web only. |
| Jobs / invoices / scheduling | ✅ not built | No new tables / routes / actions. |
| Customer messaging | ✅ not built | Phase 3 internal-SMS engine unchanged for real workspaces; simulation workspaces short-circuit. |
| Full game loop | ✅ not built | No clock-advance / action queue / round-resolution code. |
| Full plugin builder / plugin marketplace | ✅ not built | Plugin registry unchanged. |
| Data import / export | ✅ not built | No importer / exporter code. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Edit / delete / archive flows on save files | ✅ not built | `/admin/simulation/actions.ts` exports only `createSimulationRunAction` + `markSimulationRunActiveAction`. |

The Phase 1 + 2 + 3 + 4 + 5 Do-Not-Build lists also remain in force;
nothing in Phase 6 touched any of those items.

---

## 9. Security / schema check

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| Phase 6 secrets surface | ✅ none introduced — no new env vars; switcher uses an HTTP-only cookie carrying only a UUID; banner shows no secrets |
| Service-role client confined to `import "server-only"` modules | ✅ `src/core/business/is-simulation-business.ts`, `src/core/business/list-memberships.ts`, `src/core/business/workspace-selection.ts`, `src/core/simulation/admin-create.ts`, `src/core/simulation/admin-data.ts` all server-only |
| RLS posture on `simulation_runs` | ✅ Pattern B (members SELECT; writes via service-role server actions). Verified §1. |
| Schema changes introduced in Phase 6 | ✅ two — `businesses.is_simulation` boolean (Phase 6B-1) and `simulation_runs` table (Phase 6C). Both documented in `schema.md`. No Phase 6D schema. |
| Cookie surface (`admin_active_business_id`) | ✅ `httpOnly`, `sameSite='lax'`, `secure` in production, scoped to `/admin`, 30-day `maxAge`. Server re-verifies membership every request. |

---

## 10. Known issues / accepted limitations

None of these block Phase 6 sign-off.

1. **Single-active-save rule enforced in application code, not at
   the DB level.** A partial unique index was rejected for Phase 6C
   because the demote-then-promote sequence is cleaner in app code.
   Worst-case failure mode (concurrent activations) leaves zero
   active saves, which the UI handles gracefully.
2. **"Business must be a simulation workspace" not enforced at the
   DB level for `simulation_runs.business_id`.** Postgres doesn't
   allow cross-table CHECKs; a trigger would push the rule too far
   from the failing action. Application code enforces it in two
   layers (server action auth gate + service-role pre-insert
   lookup).
3. **Workspace switcher uses `window.location.reload()` after the
   server action returns.** Cleaner than relying on client-side
   cache invalidation for every server-rendered admin page. The
   `revalidatePath('/admin', 'layout')` call also runs, but the
   reload is the load-bearing refresh.
4. **GHL guardrail covers only the SMS adapter** because that's the
   only adapter that exists. Email / payments / future integrations
   need to follow the same pattern — `lookupBusinessIsSimulation`
   → `shouldSkipForSimulation` → skipped log — when they land.
5. **Banner does not advance the simulated clock.** Gameplay /
   clock-advance is Phase 7+; the banner is a read-only window onto
   `simulation_runs`.
6. **No automated browser tests for the switcher / banner.** The
   build + lint + DB checks cover the data layer and the server-
   rendered slot wiring; browser-level confirmation (toggle the
   switcher, banner appears/disappears) was done manually during
   Phase 6D rollout and is logged here, not in CI.
7. **No automated integration test for the GHL guardrail's full
   path** (lookup + skipped-log insert). The pure decision helper
   is unit-tested; the DB-write path is exercised against the
   linked Supabase project and verified via `notification_logs`
   queries.

---

## 11. Readiness verdict

**Phase 6 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 447 / 447, `lint`, `build`).
- All Definition-of-Done criteria pass.
- DB-side verification confirms the simulation workspace, plugin
  install, admin membership, and `simulation_runs` schema/RLS posture
  match the Phase 6 doc.
- The Do-Not-Build audit is clean.
- The security / schema review is clean.
- Phase 1 / 2 / 3 / 4 / 5 regression checks pass.
- Known issues are minor and documented.

Next-phase work should start from a new source-of-truth doc — Phase 6
deliberately stops at the **workspace + saves + guardrail
foundation**. Gameplay (Hang 1 / Hang Route / simulated clock advance
/ delayed CRM outcomes via plugin simulation adapters) is the Phase
7 starting point.
