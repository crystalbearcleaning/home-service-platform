# Phase 12 — Revenue / Reporting Foundation

**Status:** source-of-truth design doc for Phase 12.
**Created:** 2026-06-14.
**Scope:** docs only (Phase 12A). **No app code, no business logic,
no schema changes, no migrations** in this step.

Phase 12 adds **owner-facing reporting** on top of the records
shipped by Phase 9 (Jobs), Phase 10 (Schedule), and Phase 11
(Invoices + Payments). The full CRM journey now exists — **Contact
→ Property → Quote → Job → Schedule → Invoice → Payment** — and
Phase 12 finally lets the operator see **cash**, **production**,
**pipeline**, **unpaid money**, and **completed work** at a glance.

Phase 12 is being run on a lower-overhead workflow:

- **Phase 12A** = this setup / design doc only (no app code).
- **Phase 12B** = build the entire phase in one pass + QA report +
  Manual App Test Checklist.

No charts, no exports, no custom date picker, no report builder,
no forecasting, no AI insights, no accounting integrations, no
customer-facing reporting, no notifications, no public `/q`
changes, no schema changes (unless absolutely necessary and
approved first).

> Required reading before starting Phase 12 implementation work:
>
> - `CLAUDE.md`
> - `schema.md` (especially §13 contacts, §14 properties, §16
>   quotes, §22f jobs + job_line_items, §22h invoices +
>   invoice_line_items + invoice_payments)
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md`
>   (job snapshot rule §5, statuses §9, schema §14)
> - `docs/PHASE_9_QA_REPORT.md`
> - `docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`
>   (scheduling-column posture §5, status-transition posture §10)
> - `docs/PHASE_10_QA_REPORT.md`
> - `docs/PHASE_11_INVOICE_AND_PAYMENT_RECORDING_FOUNDATION.md`
>   (invoice snapshot rule §2, totals/recompute §11, soft-fail
>   activity §17)
> - `docs/PHASE_11_QA_REPORT.md`
> - existing code Phase 12 reads but does not change:
>   - `src/app/admin/page.tsx` — the existing Overview / Dashboard
>     page; Phase 12B adds a reporting snapshot to the top of this
>     page, on top of the existing "System overview" and "Where
>     things stand" sections.
>   - `src/components/admin/nav-config.ts` +
>     `nav-config.test.ts` — Phase 12B adds the new **Reports**
>     entry here.
>   - `src/core/invoices/admin-data.ts` — read shape for invoices,
>     invoice_payments. Phase 12 loaders read these tables
>     directly through service-role, matching Phase 11 posture.
>   - `src/core/invoices/totals.ts` — cents math helpers.
>   - `src/core/invoices/display.ts` — `formatCentsAsDollars`,
>     status labels.
>   - `src/core/jobs/admin-data.ts` — read shape for jobs +
>     job_line_items.
>   - `src/core/jobs/totals.ts` — cents math for job line items.
>   - `src/core/jobs/display.ts` — `formatCentsAsDollars` source.
>   - `src/core/quotes/admin-data.ts` — read shape for quotes,
>     `selected_total` semantics.
>   - `src/core/jobs/quote-snapshot.ts` — canonical
>     `line_items_snapshot` / `selected_total` fallback logic for
>     quote totals; Phase 12 mirrors this for **Quote Value
>     Created**.
>   - `src/core/auth/service-role.ts` — service-role client used
>     by every admin loader.
>   - `src/core/business/active-business.ts` — active-business
>     resolver. Every Phase 12 page must scope by the active
>     business.

---

## 1. Phase 12 Purpose

Phase 12 is **Revenue / Reporting Foundation**.

Goal: turn the records the app already has — quotes, jobs,
invoices, payments — into a small set of **owner-trustable
numbers** so Crystal Bear can answer:

- **Cash:** how much money has actually been paid this week /
  month?
- **Pipeline:** how much money is in unpaid invoices right now?
- **Production:** how much value have we completed? Scheduled?
- **Sales:** how much quote value did we generate this period?

Phase 12 is **read-only reporting** over existing data. No new
records, no new workflows, no new external integrations.

The app's owner-facing surface becomes:

```
Overview (existing dashboard)
  ├── existing System overview + Where things stand
  └── NEW reporting snapshot: Today / This Week / This Month
Reports (NEW top-level page)
  ├── range tabs: Today / This Week / This Month / Last 30 Days
  ├── cards: Paid Revenue, Invoiced Revenue, Unpaid Balance,
  │          Completed Job Value, Scheduled Job Value,
  │          Quote Value Created
  └── tables: Unpaid Invoices, Recent Payments, Completed Jobs
```

Phase 12A is **docs only.** No app code, no schema, no business
logic changes in this step.

---

## 2. Locked Scope

Phase 12B must build exactly the following:

1. A **reporting snapshot** at the top of the existing Overview
   page (`/admin` — `src/app/admin/page.tsx`), with fixed cards
   for **Today**, **This Week**, and **This Month**. The snapshot
   does **not** have range tabs. The existing "System overview"
   and "Where things stand" sections stay in place underneath.
2. A new top-level admin page at `/admin/reports` with:
   - Range tabs: **Today**, **This Week**, **This Month**, **Last
     30 Days**.
   - Six cards: Paid Revenue, Invoiced Revenue, Unpaid Balance,
     Completed Job Value, Scheduled Job Value, Quote Value
     Created.
   - Three tables: Unpaid Invoices, Recent Payments, Completed
     Jobs.
3. A new **Reports** entry in the sidebar nav, pinned by
   `nav-config.test.ts`. Recommended placement: inside the
   existing **Overview** group, immediately after **Dashboard**.
4. A reusable **reporting core** under `src/core/reports/` so the
   Overview snapshot and the Reports page share one canonical
   set of metric definitions, range helpers, and loaders. No
   reporting logic lives only inside a page component.

Everything else is explicitly **out of scope** — see §11.

---

## 3. Surfaces

### A. Overview page (existing `/admin`)

- **File:** `src/app/admin/page.tsx` (already exists).
- **Change:** Phase 12B prepends a new **"Reporting snapshot"**
  `SectionCard` at the top, between `PageHeader` and the existing
  `"System overview"` `SectionCard`.
- **Cards (fixed three windows, three metrics each — kept
  intentionally compact):**
  - **Today** — Paid Revenue · Unpaid Balance (current) ·
    Completed Job Value
  - **This Week** — Paid Revenue · Scheduled Job Value · Quote
    Value Created
  - **This Month** — Paid Revenue · Completed Job Value · Quote
    Value Created
- **No range tabs on Overview.** Overview is a glanceable
  snapshot; the full multi-range view lives on `/admin/reports`.
- **Card ordering is fixed** by the locked metric priority (§5):
  **cash → production → pipeline**. Within each window the cards
  render in the order listed above.
- **Empty / new-business state** must not look like an error —
  show `$0.00` rather than a missing card, and lean on the
  existing `EmptyState` patterns only when an entire window has
  zero relevant records.
- **"View full reports →"** link to `/admin/reports` is rendered
  at the bottom of the snapshot card.

### B. Reports page (new `/admin/reports`)

- **Route:** `src/app/admin/reports/page.tsx` (new). Uses the
  shared `AdminShell` + `PageHeader` + `SectionCard` /
  `StatCard` / `StatusBadge` primitives from
  `src/components/admin/`.
- **Selected range** comes from `?range=...` query string (§7).
- **Tabs:** Today · This Week · This Month · Last 30 Days. The
  active tab is highlighted; switching tabs navigates with the
  new `?range` value and persists across reloads.
- **Cards (six):** Paid Revenue · Invoiced Revenue · Unpaid
  Balance · Completed Job Value · Scheduled Job Value · Quote
  Value Created. Ordered cash → production → pipeline (Paid →
  Invoiced → Unpaid → Completed Job Value → Scheduled Job Value
  → Quote Value Created).
- **Tables (three, in order):** Unpaid Invoices, Recent
  Payments, Completed Jobs. Each table has its own
  `SectionCard`, empty state, and per-row links into existing
  invoice / job detail.
- **No charts. No exports. No custom date picker. No report
  builder.** See §11.

### C. Nav

- Add a new `Reports` entry under the existing **Overview**
  group in `src/components/admin/nav-config.ts`, immediately
  after `Dashboard`:

  ```ts
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: "home" },
      { label: "Reports", href: "/admin/reports", icon: "chart" },
    ],
  },
  ```

- If `chart` is not an existing `AdminIconKey`, Phase 12B may
  reuse an existing icon (e.g. `pulse` or `briefcase`) rather
  than adding a new icon asset. The icon choice is cosmetic and
  not part of the Definition of Done.
- `nav-config.test.ts` must pin the order so future phases do
  not silently shuffle Reports.
- `isActiveNavItem` already highlights `/admin/reports` for
  every `?range=...` query, since it ignores query strings.

---

## 4. Reporting Core (`src/core/reports/`)

All reporting logic lives under `src/core/reports/`. Pages render
the cards and tables; pages do **not** own metric math or
SQL-shaped loaders. This is the same split Phase 11 uses for
invoices (`totals.ts` + `admin-data.ts` + `display.ts`).

Recommended files — Phase 12B may collapse or rename them if a
cleaner shape fits the codebase, but the responsibilities below
must all exist somewhere under `src/core/reports/`.

| File | Responsibility |
|---|---|
| `src/core/reports/date-ranges.ts` | Pure date-range helpers. `resolveReportRange(rangeKey)` → `{ startAt, endAt, label }`. Today / This Week / This Month / Last 30 Days. `parseRangeKey(raw)` with fallback to default (`this_month`). |
| `src/core/reports/totals.ts` | Pure cents math + canonical metric calculators. `sumPaidRevenue(rows)`, `sumInvoicedRevenue(rows)`, `sumUnpaidBalance(rows)`, `sumCompletedJobValue(rows)`, `sumScheduledJobValue(rows)`, `sumQuoteValueCreated(rows)`. Each accepts already-loaded rows so unit tests stay pure. |
| `src/core/reports/admin-data.ts` | Server-only loaders. `loadOverviewSnapshot({ businessId })`, `loadReportsView({ businessId, range })`, `loadUnpaidInvoicesTable({ businessId })`, `loadRecentPaymentsTable({ businessId, range })`, `loadCompletedJobsTable({ businessId, range })`. All scoped by `business_id`; all use `createServiceRoleClient` exactly like Phase 11's invoice loaders. |
| `src/core/reports/display.ts` | Pure presentation helpers. Re-exports `formatCentsAsDollars` from `@/core/jobs/display`, plus `rangeLabel(rangeKey)`, range-tab tone helpers. |
| `src/core/reports/validation.ts` *(only if needed)* | Range-key validation if `date-ranges.ts` grows too large. |

Tests:

- Pure helpers (`date-ranges`, `totals`, `display`, `validation`)
  ship with `*.test.ts` colocated files, matching the Phase 11
  testing posture (54 pure unit tests in Phase 11B).
- Loaders are not unit-tested in this phase. They are exercised
  through the page render in the Manual App Test Checklist
  (§13).

No reporting helper may:

- Call external APIs.
- Trigger SMS / email / message automations.
- Read or write tables in a different business.
- Bypass the active-business resolver.

---

## 5. Metric Definitions (source of truth)

These definitions are **binding** for Phase 12B. The pure
calculators in `totals.ts` and the loaders in `admin-data.ts`
must match them exactly. The Manual App Test Checklist (§13)
exercises each one.

All money is stored in **cents**. Display goes through
`formatCentsAsDollars`.

### 5.1 Paid Revenue

- **Definition:** sum of `invoice_payments.amount_cents`.
- **Range filter:** `invoice_payments.paid_at` inside the
  selected range.
- **Scope:** `invoice_payments.business_id = active business`.
- **Notes:** payments are the authoritative cash signal. If an
  invoice is later voided, Phase 12 does **not** retroactively
  remove its payments from Paid Revenue (Phase 12 has no void
  flow; this is a future limitation only).

### 5.2 Invoiced Revenue

- **Definition:** sum of `invoices.total_cents`.
- **Range filter:** `invoices.created_at` inside the selected
  range.
- **Scope:** `invoices.business_id = active business`.
- **Status filter:** exclude `invoices.status = 'void'` (the
  enum exists; void may not be reachable in Phase 11 UI but the
  enum-aware filter is still required so a future void doesn't
  silently inflate Invoiced Revenue).

### 5.3 Unpaid Balance

- **Definition:** sum of `invoices.balance_cents`.
- **Range filter:** **none.** This is *"what is owed right
  now"*, not *"what was billed this range"*. The Unpaid Balance
  card and the Unpaid Invoices table always reflect current
  outstanding balance regardless of selected range.
- **Status filter:** `invoices.status IN ('draft', 'unpaid')`
  **AND** `invoices.balance_cents > 0`. Excludes `paid` and
  `void`.
- **Scope:** `invoices.business_id = active business`.

### 5.4 Completed Job Value

- **Definition:** sum of `job_line_items.total_cents` for jobs
  whose `status = 'completed'`.
- **Range filter:** the **completion timestamp** of the job
  falls inside the selected range. Phase 9 did **not** add a
  dedicated `jobs.completed_at` column (verified against
  `supabase/migrations/20260603120000_phase_9_jobs.sql`), so
  Phase 12B uses **`jobs.updated_at`** as the completion
  timestamp **only for rows with `status = 'completed'`**. This
  is acceptable because Phase 11D's complete-job flow does not
  edit completed jobs after the fact, and Phase 9D's edit UI
  does not allow status transitions out of `completed`.
- **Scope:** `jobs.business_id = active business` (line items
  join through `job_line_items.job_id` and are scoped by the
  job's business).
- **Known limitation:** if a future phase edits a completed job
  (e.g. line-item edits, notes), `updated_at` will move and the
  job may shift between range windows. **Future-improvement
  note:** Phase 12B should leave a single-line `// TODO Phase
  13+` comment in `admin-data.ts` next to this filter pointing
  out that a dedicated `jobs.completed_at` column would fix
  this. **Phase 12 does not add the column.**

### 5.5 Scheduled Job Value

- **Definition:** sum of `job_line_items.total_cents` for jobs
  whose `scheduled_start_at` is non-null and falls inside the
  selected range.
- **Range filter:** `jobs.scheduled_start_at` (**not**
  `created_at`).
- **Status filter:** `jobs.status IN ('scheduled',
  'in_progress')`. `completed` and `canceled` jobs are excluded
  from Scheduled Job Value even if their `scheduled_start_at`
  falls in the range — once a job is completed it shows under
  Completed Job Value.
- **Scope:** `jobs.business_id = active business`.

### 5.6 Quote Value Created

- **Definition:** total quote value for quotes created in the
  selected range.
- **Range filter:** `quotes.created_at` inside the selected
  range.
- **Scope:** `quotes.business_id = active business`.
- **Per-quote total selection:** use the **canonical total**
  the rest of the app already trusts:
  1. If `quotes.selected_total` is non-null, convert to cents
     (`Math.round(selected_total * 100)`) and use that. This
     mirrors Phase 9C's `quote-snapshot.ts` flow, where
     `selected_total` is the canonical customer-chosen number.
  2. If `selected_total` is null but `line_items_snapshot`
     contains the selected option, use the line-items fallback
     already implemented in `src/core/jobs/quote-snapshot.ts`
     (do **not** reimplement; Phase 12B should call into the
     existing helper or extract a shared cents-extracting
     primitive — whichever keeps the math single-sourced).
  3. If neither is available, the quote contributes **0** and
     is logged via a soft `console.warn` (no activity row, no
     issue). This matches the existing Phase 9C posture of
     graceful zero-fallback for partially-formed quotes.
- **Do not invent new pricing logic** in this phase. Phase 12 is
  reporting over what's already there.

### 5.7 Cards rendered on each surface

| Surface | Cards |
|---|---|
| Overview — Today | Paid Revenue · Unpaid Balance (current) · Completed Job Value |
| Overview — This Week | Paid Revenue · Scheduled Job Value · Quote Value Created |
| Overview — This Month | Paid Revenue · Completed Job Value · Quote Value Created |
| Reports (any range) | Paid Revenue · Invoiced Revenue · Unpaid Balance · Completed Job Value · Scheduled Job Value · Quote Value Created |

The Unpaid Balance card always shows current outstanding balance
regardless of selected range (see §5.3).

---

## 6. Reports Tables

Three tables, each in its own `SectionCard`, in this order:

### 6.1 Unpaid Invoices

- **Scope:** **current** unpaid invoices, **regardless of
  selected range** (matches Unpaid Balance card semantics —
  §5.3).
- **Filter:** `status IN ('draft', 'unpaid')` AND
  `balance_cents > 0`, scoped by active business.
- **Order:** oldest first by `created_at` ASC so the longest-
  overdue invoices float to the top.
- **Columns:**
  - Invoice number / short id (link to
    `/admin/invoices/[invoiceId]`).
  - Contact full name (from joined `contacts.full_name`).
  - Property address line (joined; nullable — show "—").
  - Source job title + link (`/admin/jobs/[jobId]`).
  - Created date (formatted local date).
  - Total (`total_cents` → `formatCentsAsDollars`).
  - Amount paid (`amount_paid_cents`).
  - Balance (`balance_cents`, bold).
- **Empty state:** "No unpaid invoices. Everything's settled."

### 6.2 Recent Payments

- **Scope:** `invoice_payments.paid_at` inside the **selected
  range**, scoped by active business.
- **Order:** most recent first by `paid_at` DESC.
- **Columns:**
  - Paid at (formatted local date + time).
  - Method (`payment_method` → human label from
    `core/invoices/display.ts`).
  - Amount (`amount_cents`).
  - Invoice number / short id (link to invoice detail).
  - Contact (from invoice → contact join).
  - Job title (from invoice → job join).
- **Empty state:** "No payments recorded in this range yet."

### 6.3 Completed Jobs

- **Scope:** `jobs.status = 'completed'` with `updated_at` in
  the **selected range** (see §5.4 for the `updated_at`
  fallback decision), scoped by active business.
- **Order:** most recent first by `updated_at` DESC.
- **Columns:**
  - Completed at (`updated_at`, formatted; label clarifies
    "Completed (approx.)" to telegraph the `updated_at`
    fallback).
  - Job title (link to `/admin/jobs/[jobId]`).
  - Contact.
  - Property address line.
  - Total job value (sum of `job_line_items.total_cents` for
    the job).
  - Invoice status (joined; "No invoice" / "Unpaid" / "Paid" —
    link to invoice detail when present).
- **Empty state:** "No jobs completed in this range yet."

All three tables use the same shared table primitives the
Phase 11C invoice list / Phase 9C job list already use. **No new
shared table component.**

---

## 7. Date Ranges

### 7.1 Range keys

```
RangeKey = "today" | "this_week" | "this_month" | "last_30_days"
```

`src/core/reports/date-ranges.ts` exports:

```ts
function resolveReportRange(key: RangeKey): {
  key: RangeKey;
  startAt: Date;   // inclusive
  endAt: Date;     // exclusive
  label: string;   // "Today" | "This Week" | "This Month" | "Last 30 Days"
};

function parseRangeKey(raw: string | null | undefined): RangeKey;
```

### 7.2 Boundary rules

| Range | Boundary |
|---|---|
| `today` | `[start of today, start of tomorrow)` |
| `this_week` | Monday-anchored week. `[Monday 00:00, next Monday 00:00)`. Matches Phase 10's Mon–Fri schedule grid posture. |
| `this_month` | `[1st of month 00:00, 1st of next month 00:00)` |
| `last_30_days` | `[now - 30d, now)`. Rolling, not anchored to start-of-day. |

Comparisons are inclusive of `startAt` and exclusive of `endAt`
(half-open intervals — the standard SQL-style window).

### 7.3 Timezone

The app does not currently have a centralized timezone system.
Phase 12B uses **server-side JavaScript `Date`** (which on Vercel
defaults to UTC) for all range boundaries. This is a known
limitation, not a Phase 12 goal:

- The Overview "Today" window may not line up exactly with the
  operator's local "today" on the very edges of the day.
- The Manual App Test Checklist (§13) explicitly tests the
  "values change when records move into the current range"
  case, but does not depend on a specific timezone.

**Future-improvement note:** when the app introduces a real
business-timezone setting (e.g. `businesses.time_zone`), Phase
12+ swaps `Date` math for a timezone-aware library. **Phase 12
does not build the timezone system.**

### 7.4 URL state

- The Reports page reads `?range=today|this_week|this_month|
  last_30_days`.
- Missing / unknown / malformed → fall back to **`this_month`**
  (the default).
- The active range is reflected in the URL so:
  - The browser back/forward buttons work.
  - Refreshing preserves the selected range.
  - A copy/paste of the URL reproduces the view.
- Tab clicks navigate via `<Link>` (server component re-render),
  not client-only state.

---

## 8. Empty States

Every Phase 12 surface must render gracefully on a brand-new
business with zero records. Empty states **must not look like
errors**.

| Surface | Empty state |
|---|---|
| Overview snapshot — zero data everywhere | All cards show `$0.00`. A single small note: "Nothing to report yet. Quote, complete, and invoice your first job to see numbers here." |
| Reports cards — zero in selected range | Each card shows `$0.00`. No error. No "No data" overlay. |
| Unpaid Invoices table | `EmptyState`: "No unpaid invoices. Everything's settled." |
| Recent Payments table | `EmptyState`: "No payments recorded in this range yet." Includes a hint: "Switch ranges above to see older payments." |
| Completed Jobs table | `EmptyState`: "No jobs completed in this range yet." |
| Failed loader (DB error) | Each affected card falls back to `—` rather than `$0.00`, with a soft `console.warn`. Tables show their normal empty state. **No user-visible error banner** in Phase 12 — reports must degrade silently and never block the page render. |

Reuse the existing `EmptyState` primitive in
`src/components/admin/`.

---

## 9. Security / Data Scoping

Phase 12B must:

- **Service-role loaders only** in `src/core/reports/admin-data.ts`,
  matching the Phase 11B pattern. The page Server Components have
  already resolved the active business through
  `getActiveBusinessForUser`, so service-role reads are safe
  inside the loader.
- **Every query scoped by `business_id`.** No reporting query
  may omit the `business_id` predicate, even on aggregate sums.
- **No cross-business data leakage.** A user who switches
  workspaces must see numbers that only reflect the newly
  active business. This must be exercised in the Manual App
  Test Checklist (§13).
- **No public / customer-facing reporting endpoints.** Reports
  live exclusively inside the authenticated admin app. No
  `/api/reports/*` route. No `/q/*` change. No `app/public/*`
  surface.
- **Preserve RLS Pattern B.** Phase 12 does **not** add new
  tables. If a future Phase 12B reviewer feels a new reporting
  table is unavoidable, **stop and ask first** (§14).
- **No env-var changes.** No new keys.

---

## 10. Simulation Awareness

Reports are **core, business-scoped**. Because the simulation
workspace is just another row in `businesses` (Phase 6's
foundation, §10 of `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md`),
the Reports page will Just Work when the operator is in the
simulation workspace:

- Reports show numbers from the active business — whether real
  or simulation.
- The Simulation Mode banner (Phase 6) continues to render at
  the top of every admin page, so the operator always knows the
  context for the numbers they see.

Phase 12 **does not** build:

- Simulation-generated reporting events.
- Simulation projections.
- Forecasting.
- "What-if" reports.
- Automated simulation insights.
- Anything specific to `simulation_runs` or `simulation_activity`.

Phase 12 just reports on records that exist in the active
business.

---

## 11. Do Not Build

Phase 12 must not build any of:

- Charts (bar, line, donut, sparkline — none).
- Custom date picker.
- CSV export.
- PDF export.
- Saved reports.
- Report builder.
- Forecasting.
- Goals.
- AI insights.
- Context engine.
- Accounting sync.
- QuickBooks / Xero / any external ledger.
- Taxes.
- Refunds.
- Deposits.
- Online payments.
- Receipt sending (real SMS / email).
- Customer-facing report pages.
- Public `/q` changes.
- Scheduled report emails.
- SMS / email notifications on reporting events.
- Message-automation outcomes from reporting.
- Crew payroll reports.
- Technician performance reports.
- Route reports.
- Marketing-attribution reports beyond simple Quote Value
  Created.
- New schema unless absolutely necessary and approved first
  (see §14).

If a Phase 12B reviewer feels any of the above is "needed,"
**stop and ask first.**

---

## 12. Phase 12B Definition of Done

Phase 12B is successful when **all** of the following are true:

### Surfaces

- `/admin` (Overview / Dashboard) shows the new **Reporting
  Snapshot** `SectionCard` at the top, between `PageHeader` and
  the existing "System overview" section.
- Snapshot shows fixed Today / This Week / This Month cards in
  the cash → production → pipeline ordering of §5.7.
- `/admin/reports` exists and renders inside `AdminShell`.
- Range tabs Today / This Week / This Month / Last 30 Days work
  on `/admin/reports`.
- `?range=...` query string updates and is preserved on reload.
- Invalid `?range` falls back to `this_month`.
- Reports page renders the six cards in the order: Paid Revenue
  · Invoiced Revenue · Unpaid Balance · Completed Job Value ·
  Scheduled Job Value · Quote Value Created.
- Reports page renders the three tables in order: Unpaid
  Invoices · Recent Payments · Completed Jobs.

### Nav

- `Reports` appears in the sidebar (default placement: Overview
  group, immediately after Dashboard).
- `nav-config.test.ts` pins the new entry's position so future
  phases don't silently shuffle it.
- The sidebar highlights `Reports` for `/admin/reports` and
  every `?range=...` variant.

### Reporting core

- `src/core/reports/` exists with at least `date-ranges.ts`,
  `totals.ts`, `admin-data.ts`, `display.ts`, plus colocated
  `*.test.ts` for the pure helpers.
- Pure unit tests cover: every range boundary; every metric
  calculator; the per-quote total selection (canonical vs.
  fallback vs. unparseable); range-key parsing + fallback.
- No reporting logic lives only inside a page component.
- Loaders use `createServiceRoleClient` and always include
  `business_id` in every query.

### Data correctness

- **Paid Revenue** matches the manual sum of
  `invoice_payments.amount_cents` in range.
- **Invoiced Revenue** matches sum of `invoices.total_cents`
  created in range, excluding void.
- **Unpaid Balance** matches sum of current `balance_cents`
  where status in (`draft`, `unpaid`) and balance > 0,
  ignoring range.
- **Completed Job Value** matches sum of
  `job_line_items.total_cents` for completed jobs whose
  `updated_at` falls in range.
- **Scheduled Job Value** matches sum of
  `job_line_items.total_cents` for jobs whose
  `scheduled_start_at` falls in range and `status IN
  ('scheduled','in_progress')`.
- **Quote Value Created** matches per-quote canonical
  selection.

### Constraints not violated

- No charts / exports / custom date picker / report builder /
  forecasting / AI / accounting integrations.
- No new schema (no migration, no new tables, no new columns).
  If a schema change feels unavoidable, Phase 12B halts and
  asks first.
- No public `/q` changes.
- No notifications / messages sent.
- No simulation outcomes / projections.
- No env-var changes.
- No regressions to `/admin/invoices`, `/admin/jobs`,
  `/admin/schedule`, `/admin/quotes`, `/admin/contacts`, or
  `/q`.

### Quality gates

- `npx tsc --noEmit` passes clean.
- `npm run test` passes clean (Phase 11 baseline: 777 / 777
  tests in 67 files; Phase 12B adds tests for the pure
  reporting helpers — exact count is not a Definition-of-Done
  criterion, but the new test files must exist and pass).
- `npm run lint` passes clean.
- `npm run build` passes clean and `/admin/reports` ships as a
  reasonable-sized route.

### Deliverables

- `docs/PHASE_12_QA_REPORT.md` exists and follows the structure
  of `docs/PHASE_11_QA_REPORT.md`.
- The QA report includes the **Manual App Test Checklist (§13
  of this doc, rendered in the QA report)** with checkboxes the
  operator can run through one-by-one.
- `CLAUDE.md` Phase 12 pointer paragraph and `README.md` Phase
  12 status block are added (per the Phase 11A / Phase 10A
  pattern).

Phase 1+2+3+4+5+6+7+8+9+10+11 Definition-of-Done items remain
in force.

---

## 13. Phase 12B Manual App Test Checklist

The Phase 12B QA report must include this checklist verbatim,
with checkboxes the operator can run through. The point is to
**try the app**, not to manually audit every DB number against
SQL.

### A. Overview

- [ ] Open `/admin`.
- [ ] Confirm the new "Reporting Snapshot" section appears at
      the top, above "System overview".
- [ ] Confirm Today / This Week / This Month cards render.
- [ ] Confirm card ordering within each window is cash → cash
      → production (or cash → production → pipeline as defined
      in §5.7).
- [ ] Confirm an empty new business shows `$0.00` rather than
      a broken card or error.
- [ ] Confirm "View full reports →" link goes to
      `/admin/reports`.

### B. Reports page

- [ ] Open `/admin/reports`.
- [ ] Confirm the Reports nav item exists and highlights when
      on `/admin/reports`.
- [ ] Click each of the four tabs: Today, This Week, This
      Month, Last 30 Days.
- [ ] Confirm the URL `?range=...` updates with each tab
      click.
- [ ] Refresh the page on each range and confirm the tab
      remains active.
- [ ] Visit `/admin/reports?range=garbage` and confirm it
      falls back to `this_month`.
- [ ] Confirm all six cards render without crashing.
- [ ] Confirm Unpaid Balance card value does **not** change
      when switching ranges (it's range-agnostic — §5.3).

### C. Tables

- [ ] Unpaid Invoices table loads.
- [ ] Click an unpaid invoice row → lands on
      `/admin/invoices/[invoiceId]`.
- [ ] Recent Payments table loads.
- [ ] Click a payment row → lands on
      `/admin/invoices/[invoiceId]`.
- [ ] Completed Jobs table loads.
- [ ] Click a completed-job row → lands on
      `/admin/jobs/[jobId]`.
- [ ] Confirm each table's empty state renders cleanly when
      the selected range has zero rows.

### D. End-to-end workflow

Pick a real / seeded test customer.

- [ ] Create a new quote at `/q` (or use a seeded one).
- [ ] Open `/admin/reports?range=today` and confirm **Quote
      Value Created** increases by the expected amount.
- [ ] Convert the quote to a job (`/admin/quotes/[id]` →
      Convert to Job, Phase 9C).
- [ ] Schedule that job (`/admin/schedule`, Phase 10C).
- [ ] Reload `/admin/reports?range=today` and confirm
      **Scheduled Job Value** increased.
- [ ] Complete the job (Complete Job modal, Phase 11D).
- [ ] Reload `/admin/reports?range=today` and confirm
      **Completed Job Value** increased and **Invoiced Revenue**
      increased.
- [ ] Open the new invoice and Mark Paid (Phase 11E).
- [ ] Reload `/admin/reports?range=today` and confirm **Paid
      Revenue** increased and **Unpaid Balance** decreased by
      that invoice's previous balance.

### E. Regression sweep

- [ ] `/admin/invoices` list still works.
- [ ] `/admin/invoices/[invoiceId]` detail still works (Mark
      Paid, Mark Receipt Sent, Create from job).
- [ ] `/admin/jobs` list still works.
- [ ] `/admin/jobs/[jobId]` detail still works (Complete Job,
      line item edits, status select).
- [ ] `/admin/schedule` still works (Schedule / Reschedule /
      Unschedule modals).
- [ ] `/admin/quotes` still works (list, detail, search,
      status filter).
- [ ] `/admin/contacts` still works (list, hub detail, edit,
      notes).
- [ ] `/q` still works (Google address → RentCast → quote
      cards → contact form → confirmation).
- [ ] Switching workspaces in the Workspace Switcher updates
      every reporting number to reflect the newly active
      business (no cross-business leakage).
- [ ] Entering the simulation workspace (Phase 6) renders
      reports against the simulation business without
      triggering any real SMS / email / payment side effect.

### F. Quality gates

- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run test` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.

---

## 14. Known Limitations / Future Phases

Phase 12 intentionally leaves these on the floor. Each is a
candidate for a future phase but **must not be implemented in
Phase 12.**

| Limitation | Impact | Future phase |
|---|---|---|
| No `jobs.completed_at` column. Completed-job range filtering uses `jobs.updated_at` (§5.4). | A late edit to a completed job will shift it between Completed Job Value range windows. | Phase 13+ adds `jobs.completed_at` and switches the filter. |
| Server-side `Date` math runs in Vercel UTC; no business timezone setting. | "Today" / "This Week" / "This Month" boundaries may straddle the operator's local day on day-edges. | Phase 13+ adds `businesses.time_zone` and a timezone-aware date helper. |
| Void invoices are not retroactively removed from Paid Revenue. | Phase 11 has no void flow; if void support lands later, Phase 12-vintage Paid Revenue may overstate cash for voided + refunded invoices. | Phase 14+ adds the void + refund flows and updates the Paid Revenue calculator. |
| No charts. | The owner gets numbers, not trends. | Future phase adds time-series and small chart primitives. |
| No CSV / PDF export. | The owner cannot share reports with an accountant directly from the app. | Future phase adds export. |
| No custom date picker. | The owner cannot request, e.g., "Q1 2026" or a custom 7-day window. | Future phase adds a custom picker and saved ranges. |
| No marketing-attribution beyond Quote Value Created. | Door Hanger ROI, campaign ROI, source-mix breakdowns all wait. | Future phase wires the Phase 5 Door Hanger plugin into a real attribution model. |
| No simulation projections / what-if reports. | Phase 12 reports only on records that exist; it doesn't model alternatives. | Future simulation phase. |

If Phase 12B encounters a case that seems to require any of the
above to ship the locked scope, **stop and ask first.**

---

**End of Phase 12 (Revenue / Reporting Foundation) source-of-
truth doc.**
