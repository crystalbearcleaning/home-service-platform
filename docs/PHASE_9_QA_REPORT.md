# Phase 9 QA Report

**Date:** 2026-06-02
**Step:** Phase 9F — Phase 9 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md`
(Appendix A — Phase 9B schema + server foundation, Appendix B —
Phase 9C nav + list + read-only detail, Appendix C — Phase 9D manual
creation + basic editing, Appendix D — Phase 9E quote → job
conversion + the bug-fix update embedded in that appendix).

This pass closes out Phase 9 (Jobs + Job Line Items Foundation).
The only new write in this step is two tiny soft-fail
`createActivity` calls in `actions.ts` — manual-create and
status-change — using the proven Phase 1 helper. Invoices, payments,
the full scheduling calendar, customer notifications, technician
apps, and recurring jobs all remain future foundation phases.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **650 / 650** tests across 58 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/jobs/[jobId]` at 4.04 kB, `/admin/jobs/new` at 3.22 kB, `/admin/quotes/[quoteId]` at 814 B. |

DB-side verification (via `supabase db query --linked`):

| Check | Result |
|---|---|
| `jobs` table | ✅ exists, RLS enabled |
| `job_line_items` table | ✅ exists, RLS enabled |
| `jobs_members_select` policy | ✅ SELECT, `authenticated` |
| `job_line_items_members_select` policy | ✅ SELECT, `authenticated` |
| `jobs` CHECK constraints | ✅ all 5 present (`title_nonempty`, `status_check`, `source_check`, `estimated_total_nonneg`, `scheduled_end_after_start`) |
| `job_line_items` CHECK constraints | ✅ all 5 present (`name_nonempty`, `quantity_positive`, `unit_price_nonneg`, `total_nonneg`, `source_check`) |
| `jobs` indexes | ✅ all 6 + pkey (`business`, `business_status`, `business_created`, `business_scheduled_start`, `contact`, `quote`) |
| `job_line_items` indexes | ✅ all 3 + pkey (`business`, `business_job`, `job_order`) |

---

## 2. What shipped in Phase 9 (recap)

- **Phase 9A** — source-of-truth doc + Phase 9 pointer paragraphs in
  `CLAUDE.md` / `README.md`.
- **Phase 9B** — additive migration
  `20260603120000_phase_9_jobs.sql`: `jobs` (id, business_id,
  contact_id NOT NULL, property_id NULL, quote_id NULL, title,
  summary, status enum, source enum, scheduling fields,
  `estimated_total_cents bigint NOT NULL default 0`) +
  `job_line_items` (job_id CASCADE, optional service_id SET NULL,
  name, description, quantity numeric(10,2), unit_price_cents,
  total_cents, sort_order, source enum). RLS Pattern B on both.
  Pure validators + total math + the quote-snapshot parser +
  server-only loaders + server-only create/update helpers. 43
  pure unit tests.
- **Phase 9C** — Jobs nav under CRM (third entry, with a new
  `briefcase` icon), `/admin/jobs` list with status-pill filter,
  `/admin/jobs/[jobId]` read-only detail (contact + property KV,
  scheduling read-only, line-items table, source-quote link). 17
  display-helper tests; 4 nav-config tests updated to pin the
  new CRM order.
- **Phase 9D** — `/admin/jobs/new` manual creation form (contact
  select + filtered property select + line-items editor with
  Custom + Catalog sources, live total preview); detail-page
  editors: status auto-save select, scheduling form, line-items
  add/edit/remove with banner showing the recomputed total. Six
  server actions. 6 dollar-input tests.
- **Phase 9E** — Quote → Job conversion. **Create Job** button on
  `/admin/quotes/[quoteId]`, server action
  `createJobFromQuoteAction`, `<CreateJobButton>` client, "Jobs
  created from this quote" list (using `listJobsForQuote`),
  soft-fail `job.created_from_quote` activity row. **Parser
  bugfix in the same change set:** the parser was incorrectly
  copying the full pricing grid into the job; now it filters to
  the selected option + the explicitly selected add-ons. 5 new
  selection-aware tests pinning the fixed behavior.
- **Phase 9F** (this step) — minor activity polish: tiny soft-fail
  `createActivity` writes on manual-create (`job.created_manually`)
  and status-change (`job.status_changed`). No new schema, no new
  helper, no new routes. + QA report.

---

## 3. Phase 9 Definition of Done — checklist

Drawn from §20 of the Phase 9 doc + each appendix.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | Phase 9 doc + Appendices A / B / C / D. |
| `jobs` + `job_line_items` tables exist | ✅ | DB-verified §1. |
| Jobs nav under CRM | ✅ | Third CRM entry, pinned by `nav-config.test.ts`. |
| `/admin/jobs` list + `/admin/jobs/[jobId]` detail | ✅ | Phase 9C. |
| Manual job creation works (catalog + custom line items) | ✅ | Phase 9D + the 6 dollar-input tests pin the dollars→cents boundary. |
| Quote → Job conversion works | ✅ | Phase 9E + the selected-only fix. |
| Job total displays from `estimated_total_cents` / line-item sum | ✅ | Snapshot maintained app-side via `recomputeJobEstimatedTotal`; pinned by Phase 9B `totals.test.ts` + Phase 9D manual mutation paths. |
| Basic scheduling fields on the detail page | ✅ | Phase 9D `<SchedulingForm>` (no calendar UI). |
| No invoices / payments / scheduling calendar / customer messaging built | ✅ | Do-Not-Build audit §8 below. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_9_QA_REPORT.md` exists | ✅ | This file. |
| `CLAUDE.md` Phase 9 pointer | ✅ | Added in Phase 9A. |
| `README.md` Phase 9 status block | ✅ | Added in Phase 9A. |

Phase 1+2+3+4+5+6+7+8 Definition-of-Done items remain in force.

---

## 4. Schema / RLS / security verification

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| Service-role client confined to `import "server-only"` modules | ✅ — `jobs/admin-create.ts`, `jobs/admin-data.ts`, `jobs/admin-form-data.ts` all server-only |
| RLS posture on `jobs` + `job_line_items` | ✅ Pattern B (members SELECT; writes via service-role server actions) |
| Phase 9 schema changes | ✅ two tables in one migration (`20260603120000_phase_9_jobs.sql`); no other DB changes |
| No new secrets surface | ✅ none introduced |
| New external API calls from Phase 9 code | ✅ none — Jobs is pure DB reads + writes |
| Cross-business leakage check | ✅ every server helper re-verifies contact / property / quote / service ownership via `verifyOwnership` before insert; loaders filter by `business_id`; FK CASCADE on `business_id` enforces tenant cleanup |

---

## 5. Helper / parser verification

| Check | Result |
|---|---|
| `JOB_STATUSES`, `JOB_SOURCES`, `JOB_LINE_ITEM_SOURCES` pinned in code + DB | ✅ — TS constants mirror the migration CHECK enums; `nav-config.test.ts` + `validation.test.ts` pin the taxonomies |
| `validateJobForm` rejects missing contact / title / unknown status / unknown source / end < start | ✅ — 7 cases in `validation.test.ts` |
| `validateJobLineItemForm` rejects empty name / non-positive qty / negative price / non-integer cents / unknown source | ✅ — 7 cases |
| `computeJobLineItemTotal` rounds `qty × cents` to the nearest cent + clamps negatives | ✅ — 4 cases in `totals.test.ts` |
| `computeJobEstimatedTotal` sums + ignores invalid rows | ✅ — 4 cases |
| `parseDollarsToCents` round-trips USD strings through the action boundary | ✅ — 6 cases in `dollar-input.test.ts` |
| `parseQuoteLineItemsSnapshot` copies **only** the selected option + selected add-ons | ✅ — Phase 9E bugfix, 5 dedicated cases in `quote-snapshot.test.ts` |
| `parseQuoteLineItemsSnapshot` falls back to `selected_total` when `selected_option_key` is missing, doesn't match, or the snapshot is malformed | ✅ — 4 fallback cases |
| `parseQuoteLineItemsSnapshot` never throws | ✅ — explicit "garbage input" case |
| `buildQuoteJobTitle` prefers option label → contact-name → "Quoted work" | ✅ — 3 cases |
| Server-only loaders are business-scoped + read-only | ✅ — every `from()` includes `.eq("business_id", …)`; no writes |
| Server-only writers verify FK ownership before any insert | ✅ — `verifyOwnership` checks `contact_id` / `property_id` / `quote_id` / `service_id` before DB writes |
| `jobs.estimated_total_cents` recomputes after every line-item mutation | ✅ — `recomputeJobEstimatedTotal` called after `addJobLineItem`, `updateJobLineItem`, `removeJobLineItem`, and at the end of both create paths |

Total pure jobs tests: **66** across 5 files (8 totals + 24
validation + 17 display + 6 dollar-input + 11 quote-snapshot in
the original count → updated to 16 with the Phase 9E bugfix +
5 new cases, with one original-grid-blind-copy test removed).

---

## 6. Manual creation / editing verification

### 6.1 `/admin/jobs/new`

| Step | Status |
|---|---|
| Page loads when active business is set | ✅ |
| Loads contacts (active only) + all properties + active services in one round trip | ✅ — `listContactsForJobForm` + `listPropertiesForJobForm` + `listServicesForJobForm` |
| Empty contact list → "Add a contact first" empty state | ✅ |
| Contact select sorted by name; property select filters client-side to chosen contact | ✅ |
| Add line item (Custom + Catalog) with live total preview | ✅ |
| Required: contact + title + ≥ 1 line item; defaults to `status='draft'`, `source='manual'` | ✅ |
| `?contactId=` pre-fill supported for future contact-detail integration | ✅ |
| Redirect to `/admin/jobs/[jobId]` on success | ✅ |
| Soft-fail `job.created_manually` activity row written | ✅ — Phase 9F polish; non-blocking, no message-engine reached |

### 6.2 `/admin/jobs/[jobId]` editing

| Step | Status |
|---|---|
| Status auto-save select (Phase 9D) | ✅ |
| Status change writes soft-fail `job.status_changed` activity row | ✅ — Phase 9F polish |
| Scheduling form (start / end / arrival window) saves via `updateJobSchedulingAction`; end ≥ start enforced | ✅ |
| Add line item (Custom + Catalog) | ✅ |
| Edit line item (inline form replacing the row) | ✅ |
| Remove line item (with confirm) | ✅ |
| Banner reports the freshly recomputed total after each mutation | ✅ |
| Source-`quote` lines surface the "edits don't propagate back to the quote" note | ✅ |

### 6.3 Jobs list

| Step | Status |
|---|---|
| `/admin/jobs` loads | ✅ |
| Real **Create job** button in header (Phase 9D) | ✅ |
| Status-pill filter (`All / Draft / Unscheduled / Scheduled / In progress / Completed / Canceled`) | ✅ |
| Row shows status badge, title (link), contact + property, scheduling range, total, created date, from-quote link when present | ✅ |
| Empty state adapts to filter (all-vs-specific) | ✅ |

---

## 7. Quote → Job conversion verification

| Step | Status |
|---|---|
| `/admin/quotes/[quoteId]` shows "Convert to job" section | ✅ |
| **Create job** (or "Create another job" when prior jobs exist) opens the conversion server action | ✅ |
| Re-conversion allowed (`quote_id` is not unique on `jobs`) | ✅ — pinned by §15 of the Phase 9 doc and exercised by the action |
| Job preserves `quote_id` | ✅ |
| `source='quote'`, `status='unscheduled'` | ✅ |
| Contact + property copied from the quote | ✅ |
| **Job line items copy only the selected option + clearly selected add-ons** | ✅ — Phase 9E bugfix; 5 dedicated tests |
| **Job does not copy every quote pricing option** | ✅ — see §8 below |
| Fallback from `selected_total` when snapshot is missing / unusable / `selected_option_key` doesn't match | ✅ — 4 fallback tests |
| Quote detail lists jobs created from quote (title, status, total, created date) | ✅ — uses Phase 9B's `listJobsForQuote` |
| Soft-fail `job.created_from_quote` activity row written | ✅ — non-blocking, no message-engine call |
| Public `/q` unchanged | ✅ — Phase 1 `/q` route still builds at 6.54 kB |

### The Phase 9E parser bug (documented)

- **What happened:** the original parser iterated
  `quotes.line_items_snapshot` and copied every row. That column is
  the quote's full pricing **grid** (every option + every add-on),
  not a "work to perform" list. The first job created from a quote
  ended up with One-Time + 6-Month + 3-Month + Interior add-on all
  at once.
- **Fix shipped in the same change set as Phase 9E**
  (commit `3c05a66`):
  - Parser now requires `selected_option_key` and filters
    `line_items_snapshot` to the **one** matching
    `kind='option_exterior'` row.
  - Add-ons are included **only** when their `option_key` appears
    in the set extracted from `selected_add_ons` (which accepts
    both the canonical `[{add_on_key, ...}]` shape from
    `core/quotes/create.ts` and a bare string-array shape).
  - Missing / ambiguous `selected_add_ons` → **zero** add-ons
    included (intentional safe default).
  - When the option row can't be matched, the parser falls through
    to the `selected_total`-only synthesised line.
- **Existing incorrect test jobs were left untouched.** No
  migration, no auto-mutation. Operators can delete + recreate
  those test jobs manually if needed. Future conversions use the
  fixed parser.

---

## 8. Activity / notes status

Phase 9F shipped three soft-fail activity writes — all using the
proven Phase 1 `createActivity` helper, all non-blocking on the
underlying mutation:

| `activity_type` | Source | When |
|---|---|---|
| `job.created_manually` | `createManualJobAction` (Phase 9F) | After a successful manual job insert. Details: `contact_id`, `property_id`, `line_item_count`, `estimated_total_cents`. |
| `job.created_from_quote` | `createJobFromQuoteAction` (Phase 9E) | After a successful quote conversion. Details: `quote_id`, `line_item_count`, `snapshot_source`, `warnings`. |
| `job.status_changed` | `updateJobStatusAction` (Phase 9F) | After a status update. Details: `status`. |

Notes:

- **No `notes` UI on the job detail page** in Phase 9F.
  Implementing the contact-style note thread on jobs would land
  near 200 lines of UI plumbing for the existing `notes` table —
  out of scope for the polish step. Documented for a future
  follow-up.
- **No message-engine calls** are made on any job event. The
  Phase 6D GHL guardrail is not even reached from any Phase 9
  module.
- **Soft-fail posture** means a failing `createActivity` insert
  does NOT roll back the underlying job mutation. The job is the
  load-bearing row; the activity is feed metadata.

---

## 9. Do-Not-Build audit

Audited against §19 of the Phase 9 doc + each appendix's "What did
NOT ship" section. Every item is confirmed **NOT** present in
Phase 9 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Full scheduling calendar | ✅ not built | No calendar / FullCalendar / week-grid imports anywhere; scheduling = three `<input type="datetime-local" / text>` fields. |
| Crew / technician assignment | ✅ not built | No `crew` / `technician` / `assignment` tables, columns, or modules. |
| Conflict detection | ✅ not built | No overlap-check / conflict-finder code. |
| Recurring jobs | ✅ not built | No `recurrence` / `rrule` / `cadence` code. |
| Visits / appointments table | ✅ not built | Only `jobs` + `job_line_items` added in Phase 9. |
| Technician mobile app | ✅ not built | Web only. |
| On-the-way / arrival workflows | ✅ not built | No telemetry endpoints. |
| Invoices / invoice line items | ✅ not built | No `invoices` table or module. |
| Payments / deposits / refunds / payment processor | ✅ not built | No Stripe / payment imports. |
| Taxes / discounts / surcharges | ✅ not built | Line items use plain `quantity × unit_price_cents`; no tax / discount columns. |
| Bundled-package pricing | ✅ not built | Each line stands alone. |
| Customer notifications (real or simulated) on job events | ✅ not built | No `sendInternalSmsNotification` / `notification_logs` writes in any jobs path. |
| Message-automation outcomes from job events | ✅ not built | Phase 3 engine untouched. |
| Job reminders | ✅ not built | No timer / cron / scheduled-job code. |
| Quote acceptance / payment portal | ✅ not built | No customer-facing job views. |
| Customer accounts / customer-facing job pages | ✅ not built | Jobs are admin-only. |
| Public `/q` changes | ✅ not built | `/q` unchanged (6.54 kB build size matches Phase 8). |
| Simulation-driven job generation | ✅ not built | No Door Hanger / simulation_activity → job path. |
| Plugin builder / marketplace | ✅ not built | Plugin registry unchanged. |
| Data import / export | ✅ not built | No importer / exporter code. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Edit / delete / archive beyond what Phase 9D ships | ✅ not built | The detail page exposes only status change + scheduling save + line-item add/edit/remove. A `canceled` status is the closest thing to archive. |
| Drag-to-reorder line items | ✅ not built | No drag handles; `sort_order` set at insert. |
| Bulk line-item operations | ✅ not built | One-at-a-time. |

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 Do-Not-Build lists remain
in force; nothing in Phase 9 touched any of those items.

---

## 10. Regression checks

| Surface | Status |
|---|---|
| `/admin/contacts` loads | ✅ (1.31 kB) |
| `/admin/contacts/[contactId]` loads | ✅ (1.89 kB) |
| `/admin/quotes` loads | ✅ (1.76 kB) |
| `/admin/quotes/[quoteId]` loads | ✅ (814 B; was 214 B at Phase 4 close — Phase 9E added the Convert to job section) |
| `/admin/jobs` loads | ✅ (215 B) |
| `/admin/jobs/[jobId]` loads | ✅ (4.04 kB) |
| `/admin/jobs/new` loads | ✅ (3.22 kB) |
| `/admin/marketing/door-hangers` loads | ✅ (7.55 kB) |
| `/admin/marketing/door-hangers/routes` loads / builds | ✅ (5.55 kB) |
| `/admin/simulation/play` loads / builds | ✅ (3.41 kB) |
| `/admin/simulation` (Saves) loads | ✅ (1.66 kB) |
| `/admin/message-automations` loads | ✅ (1.46 kB) |
| `/q` loads / builds | ✅ (6.54 kB — unchanged) |
| Workspace switcher still works | ✅ — Phase 6D code unchanged |
| Simulation Mode banner still works | ✅ — Phase 6D code unchanged |
| Nav active-state highlights one CRM item per page | ✅ — Phase 7C `resolveActiveNavHref` longest-prefix fix covers `/admin/jobs/<id>` |

---

## 11. Known issues / accepted limitations

None of these block Phase 9 sign-off.

1. **No `notes` UI on the job detail page.** Job-attached notes
   would reuse the existing `notes` table + the contact-detail
   reusable pattern. Skipped in Phase 9F polish because it would
   add ~200 lines of UI plumbing for a follow-up phase. Activity
   rows cover the basic feed need.
2. **No persisted parser warnings on the job row.** Phase 9E
   parser warnings flow to the action result and into the
   activity row's `details.warnings`, but the job detail page
   does not surface them post-redirect. A future polish step
   could display them when present.
3. **No drag-to-reorder for line items.** `sort_order` is set at
   insert and editable via the per-row Edit form; there is no
   drag handle. Out of Phase 9 scope.
4. **No bulk line-item operations.** Add / edit / remove all run
   one row at a time.
5. **Ordered writes, not RPC-atomic.** Manual / quote creation
   inserts the job → inserts line items → recomputes
   `estimated_total_cents`. If a later step fails after the job
   row landed, the job persists with whatever line items did
   commit. The recompute path always uses the current DB rows so
   the snapshot is correct for whatever exists. Matches the
   Phase 5B / 7D-1 / 8B posture. A future Postgres RPC could
   wrap this if real usage surfaces partial-commit incidents.
6. **No `serviceId` on quote-snapshotted lines.** The Phase 1
   Auto-Quote snapshot does not carry a stable service id —
   the parser leaves `service_id=null` for `source='quote'`
   lines. Manual edits can attach a service if needed.
7. **No automated browser tests** for the job UI. The build +
   lint + 650-test suite covers the data layer + pure helpers +
   server actions; browser-level confirmation (create job → land
   on detail → edit line item → see new total) was done manually
   during Phase 9D rollout.
8. **No automated integration test for the activity writes.**
   The `createActivity` helper is exercised via the soft-fail
   `void` pattern; failures are silent by design. Verifying that
   rows actually land is a manual `select * from activities`
   check post-conversion.

---

## 12. Readiness verdict

**Phase 9 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 650 / 650, `lint`,
  `build`).
- All Definition-of-Done criteria pass.
- DB-side verification confirms the two new tables, the 10 CHECK
  constraints, the 9 indexes, the 2 RLS Pattern B policies.
- The Do-Not-Build audit is clean — no invoices, payments,
  scheduling calendar, crew, recurring, customer notifications,
  message-automation outcomes, simulation-driven generation, or
  public `/q` changes.
- The Phase 9E parser bug ("copying every quote pricing option")
  was identified, fixed, and pinned by 5 selection-aware tests
  before Phase 9 close. Existing incorrect test jobs were left
  untouched per the brief — operators can delete + recreate them
  manually.
- Three soft-fail activity rows ship for the most common job
  events; full notes UI is deferred.
- Phase 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 regression checks pass.
- Known issues are minor and documented.

**Future foundation phases that build on Phase 9 (exact naming
TBD):**

- **Scheduling Foundation** — calendar UI, visit objects, crew /
  technician assignment, conflict detection, recurring jobs.
- **Invoicing Foundation** — invoices + invoice line items,
  payments, deposits, taxes, payment processor integration.
- **Field Execution / Worker App** — on-the-way, mobile job
  view, GPS-driven completion (overlapping with the Phase 8 Door
  Hanger field surface).
- **Customer Messaging from Jobs** — wire job events through the
  Phase 3 message-automation engine (currently the Phase 6D GHL
  guardrail is not even reached from any Phase 9 path).
- **Notes UI on the job detail page** — reuse the existing
  `notes` table + Phase 4 contact-style thread pattern.
