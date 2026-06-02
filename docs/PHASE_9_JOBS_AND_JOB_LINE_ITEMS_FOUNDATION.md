# Phase 9 — Jobs + Job Line Items Foundation

**Status:** source-of-truth design doc for Phase 9.
**Created:** 2026-06-02.
**Scope:** docs only (Phase 9A). **No app code, no business logic,
no schema changes** in this step.

Phase 9 shifts back to core CRM/business operations after three
phases of door-hanger / simulation / map work. It introduces the
**Job** — a Jobber-style work order — as the next foundational core
object, plus per-job line items, quote-to-job conversion, and a
manual creation path. It does **not** build scheduling, invoices,
payments, technician apps, recurring jobs, or customer
notifications.

> Required reading before starting Phase 9 implementation work:
> - `CLAUDE.md`
> - `schema.md` (especially §13 contacts, §14 properties, §15 leads,
>   §16 quotes, §17 tasks, §18 events, §19 activities, §20 notes,
>   §22b door-hanger, §22c–§22e simulation/route-map additions)
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`
>   (especially the CRM nav order + customer-hub patterns)
> - `docs/PHASE_4_QA_REPORT.md`
> - `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
>   (money-in-cents convention; the door-hanger schema is the
>   precedent for Phase 9 totals)
> - `docs/PHASE_8_QA_REPORT.md`
> - existing CRM/contact/quote/task code:
>   - `src/core/contacts/*`, `src/core/quotes/*`, `src/core/leads/*`,
>     `src/core/tasks/*`, `src/core/notes/*`
>   - `src/app/admin/contacts/*`, `src/app/admin/quotes/*`,
>     `src/app/admin/tasks/*`, `src/app/admin/leads/*`
> - existing quote detail / list code
> - existing services / service_plans schema (Phase 1, §11–§12 in
>   `schema.md`) — Jobs will reference `services` for catalog-backed
>   line items
> - existing notes / activity / event patterns
> - existing admin nav config (`src/components/admin/nav-config.ts`)

---

## 1. Phase 9 Purpose

Phase 9 is **Jobs + Job Line Items Foundation**.

Goal: add the core **Job** object to the CRM as the work-order
foundation of the business.

The app's core CRM journey becomes:

```
Contact → Property → Quote → Job → Schedule (future) → Invoice (future)
```

Phase 9 lands the Job + line items + quote-to-job conversion. It
stops short of scheduling, invoicing, and payments. Those each get
their own future foundation phase.

Phase 9A is **docs only.** No app code, no schema, no business
logic change in this step.

---

## 2. Job Definition

A **Job is a work order.** It represents the actual work that needs
to be done — or has been done — for a customer.

A job is **not** the same as:

- a **quote** — a quote is a proposed price; a job is approved /
  active work.
- a **visit** or **calendar event** — a job may eventually map to
  one or more visits, but the visit/calendar layer ships later.
- an **invoice** — an invoice is a billing snapshot of completed
  work; jobs are operational, invoices are financial.
- a **payment** — payments settle invoices.

### Mental model

| Object | Role | Phase |
|---|---|---|
| **Quote** | Sales proposal / price | Phase 1 (exists) |
| **Job** | Approved work order | **Phase 9 (this phase)** |
| **Visit / Schedule** | When + by whom the work happens | Future |
| **Invoice** | Bill for completed work | Future |
| **Payment** | Settles an invoice | Future |

A job can exist before scheduling exists. A job can exist without a
visit. A job can exist before invoices exist.

---

## 3. Jobber-Inspired Lifecycle

Phase 9 mirrors the operator's mental model from Jobber-style home
service software:

```
Contact
  ↓
Property
  ↓
Quote / Request
  ↓
Job              ← Phase 9
  ↓
Visit / Schedule (future)
  ↓
Invoice          (future)
  ↓
Payment          (future)
```

- The first four (Contact / Property / Quote / Job) cover the
  proposal-to-work-order path.
- Visit / Schedule, Invoice, and Payment are each their own future
  phase because they each carry non-trivial UI + business rules
  (calendar, money, customer-facing flows, etc.).

---

## 4. Job Creation Paths

Phase 9 supports two creation paths.

### A. Create job from quote / request

- The job's `quote_id` preserves the source quote.
- Contact / property are copied/linked from the quote.
- Quote details (line items, selected option, total) are copied
  into `job_line_items` as a **snapshot** (§5).
- The job becomes a self-contained work order.

### B. Create job manually from contact / property

- Operator picks the contact + property (or starts from the
  contact-detail page so the contact is already known).
- Operator adds one or more line items (catalog-backed or custom
  — §7).
- Optional scheduling fields (§10).
- Optional later link back to a quote.

**Every job does not need to come from a quote.** Crystal Bear and
similar operators add jobs for repeat customers, add-on work, or
manual sales without going through the public `/q` flow.

---

## 5. Quote → Job Snapshot Rule

Creating a job from a quote **copies the quote into the job.** The
job is **not** a live mirror of the quote.

When a quote is converted:

1. Preserve `jobs.quote_id` (FK).
2. Copy customer / contact / property linkage onto the job.
3. Copy quote line items into `job_line_items`.
4. Calculate the job total from `job_line_items`.
5. **Later edits to the quote do not silently change the job.** The
   job is a snapshot from the moment of conversion.

### Principle

| Object | What it is |
|---|---|
| **Quote** | Sales proposal snapshot. |
| **Job** | Work order snapshot. |
| **Invoice** | Billing snapshot (future). |

Each subsequent snapshot carries forward what matters, but later
edits to upstream snapshots do not retroactively rewrite
downstream snapshots. This is the same posture quotes already have
today (Phase 1 quote snapshots — `options_snapshot`,
`line_items_snapshot`, `price_snapshot`).

### What about quote re-conversion?

A given quote may be converted to a job more than once (e.g.
operator made a job, deleted it, and now wants a new one). Phase 9
keeps this simple:

- Each conversion creates a **new** job row, with its own snapshot.
- The previous job row is unaffected.
- `jobs.quote_id` is **not** unique — a quote can have multiple
  jobs across its lifetime.

---

## 6. Job Line Items

Phase 9 introduces **`job_line_items`** as a child table of `jobs`.

Jobs do **not** rely on `jobs.estimated_total_cents` as the source
of truth. Line items are required because jobs need to know **what
work is being performed**, not just the total dollar amount.

### Per-row shape

| Column | Purpose |
|---|---|
| `id` (uuid) | PK. |
| `business_id` (uuid) | Scoping + RLS. |
| `job_id` (uuid) | FK → `jobs(id)` ON DELETE CASCADE. |
| `service_id` (uuid NULL) | FK → `services(id)` ON DELETE SET NULL when the line came from the service catalog. |
| `name` (text) | Required. Human label. |
| `description` (text NULL) | Optional notes for the line. |
| `quantity` (numeric) | Required. Default 1. CHECK > 0. |
| `unit_price_cents` (bigint) | Required. CHECK >= 0. |
| `total_cents` (bigint) | Required. App-computed `quantity * unit_price_cents`, rounded to nearest cent. CHECK >= 0. |
| `sort_order` (integer NULL) | Render order. NULL = end. |
| `source` (text NOT NULL) | Enum: `quote` \| `service` \| `custom`. CHECK constraint. |
| `created_at` / `updated_at` | timestamptz. |

### Phase 9 simplicity bounds

For Phase 9, line items are deliberately simple:

- **No taxes** — that's an invoice/billing concern.
- **No discounts** at the line level — operator can adjust
  `unit_price_cents` for now.
- **No deposits** — payment concern, future.
- **No product catalog** beyond the existing `services` table.
- **No invoice sync** — there's no invoice yet.
- **No bundled-package logic** — each line stands alone.
- **No advanced pricing engine** — quantity × unit price.

If a future invoice phase needs richer semantics, that phase adds
the columns + the logic.

---

## 7. Manual Job Line Items

Manual job creation supports **both** catalog-backed and custom
lines.

### Service-backed line

- Operator picks a `services` row.
- `service_id` is set; `source = 'service'`.
- `name` defaults to the service name; operator can edit.
- `unit_price_cents` defaults from the service's pricing if
  available; operator can edit.
- `quantity` defaults to 1; operator can edit.

### Custom line

- Operator types a free-form `name`.
- `service_id` is null; `source = 'custom'`.
- Operator enters `quantity` + `unit_price_cents` directly.

### Examples

- "Exterior Window Cleaning — $249" (catalog-backed).
- "Interior Window Cleaning — $150" (catalog-backed).
- "Hard-water glass restoration on master bath — $75" (custom).

Phase 9 does **not** force every line to come from the catalog.
Custom lines are first-class; many real jobs include at least one.

---

## 8. Job Totals

The **source of truth** for a job's total is the sum of its line
items.

### Recommended posture

- `job_line_items.total_cents = round(quantity * unit_price_cents)`
  (the row's own snapshot).
- Job total = `sum(job_line_items.total_cents)` for that job.

### Snapshot total on the parent row?

Phase 9 may add **`jobs.estimated_total_cents`** (bigint, nullable
or NOT NULL default 0) as a maintained snapshot for list-page
performance. The recommendation:

- **If existing app patterns favor calculated-on-read** (Phase 1
  contacts / Phase 4 quotes do simple `sum()` joins for list
  pages), do that — keep Phase 9 simple, no double-write.
- **If a snapshot is needed** for the list page UX, store it and
  maintain it in the same server action that touches line items.

**Recommended for Phase 9B**: store it as a snapshot
(`estimated_total_cents bigint NOT NULL default 0`) and recompute
it in the line-item create / update / delete server action. Reason:
the jobs list page will sort by total / show "total of the work,"
and a `sum()` join on every request becomes a hidden cost as the
table grows. The snapshot also matches the pattern Phase 5 used
for door-hanger inventory (`quantity_used` is app-maintained, with
a DB CHECK as a safety net).

### Money convention

All Phase 9 money columns use **`bigint` cents**, matching Phase 5
door-hanger + Phase 6 simulation_runs + Phase 7B
distribution-sessions. The existing `quotes.selected_total` is
`numeric(10,2)` (dollars); Phase 9 conversion **multiplies by
100** at the boundary to land cents inside the job snapshot.

---

## 9. Job Statuses

Use this status taxonomy:

| Status | Meaning |
|---|---|
| `draft` | Created but not ready to schedule. Operator still editing line items / details. |
| `unscheduled` | Approved / active work order; needs scheduling. The "real" first useful state for most jobs. |
| `scheduled` | `scheduled_start_at` (and optionally `scheduled_end_at`) set. |
| `in_progress` | Work has started. |
| `completed` | Work done. |
| `canceled` | Not doing it. |

### Phase 9 transitions

- **From-quote conversion** → defaults to `unscheduled` (the quote
  is already a commitment of sorts; the job is ready for work).
- **Manual creation** → defaults to `draft` (operator may still be
  filling in line items).
- Operator can move forward through the taxonomy, but Phase 9
  **does not build a guarded state machine.** Status is a plain
  text column with a CHECK enum; transition rules are deferred to
  the future Scheduling Foundation phase.

Phase 9 keeps status changes simple (a select on the job detail
page is enough). No automation triggers, no email/SMS on status
change.

---

## 10. Basic Scheduling Fields

Phase 9 adds basic scheduling fields on `jobs` so the schema is
ready for the future scheduling layer, but the **scheduling UI
itself is out of scope.**

### Columns

| Column | Type | Notes |
|---|---|---|
| `scheduled_start_at` | timestamptz NULL | Start of the planned visit. |
| `scheduled_end_at` | timestamptz NULL | End. CHECK `end >= start` when both present. |
| `arrival_window_label` | text NULL | Free-form: "8–10 AM", "anytime after 12", etc. |

### What Phase 9 does NOT build

- Calendar UI.
- Crew / technician assignment.
- Conflict detection.
- Recurring visits.
- Routing / drive-time.
- Technician mobile app.
- On-the-way / arrival workflows.
- Customer schedule notifications.

The job detail page may expose these three fields as simple text /
datetime inputs so an operator can record "we said we'd come on
Friday at 9 AM" without a calendar. The future Scheduling
Foundation phase replaces those inputs with a real calendar UI.

---

## 11. CRM Nav Placement

Jobs live under **CRM** for Phase 9.

### Recommended nav

```
CRM
├── Contacts
├── Quotes
└── Jobs        ← new in Phase 9
```

Do **not** create a new "Operations" or "Field Work" nav group
yet. The future Scheduling / Invoices phases can promote Jobs (or
move it into a new Operations group) if the CRM group becomes too
heavy.

### Nav test pin

`src/components/admin/nav-config.test.ts` already pins the CRM
group order. Phase 9 updates that test to require the third entry
to be `/admin/jobs`.

---

## 12. Job Detail / List Direction

Document the likely Phase 9 UI surfaces.

### Jobs list (`/admin/jobs`)

Columns (suggested):

- Status (badge, tinted by §9 taxonomy).
- Contact name.
- Property line.
- Job title / summary.
- Estimated total (from `estimated_total_cents`).
- Scheduled date/time (when set).
- Created date.
- Source quote (link when `quote_id` set).

Filters (Phase 9 ships minimal):

- Status filter (matching the §9 taxonomy + "all").
- Optional simple search on contact / title.

No saved views, no advanced filters, no multi-select in Phase 9.

### Job detail (`/admin/jobs/[jobId]`)

Sections:

- **Header** — title, status badge, status-change select.
- **Contact / property links** — small KV strip, linking to the
  Phase 4 customer-hub contact detail.
- **Source quote link** — when `quote_id` is set; deep-links to
  `/admin/quotes/[quoteId]`.
- **Scheduling** — three inputs (`scheduled_start_at`,
  `scheduled_end_at`, `arrival_window_label`). Phase 9 keeps these
  as simple form fields.
- **Line items** — table of `job_line_items` with add / remove /
  reorder / edit-in-place where cheap. Total row at the bottom.
- **Notes / activity** — see §13.

Phase 9 does **not** show invoices, payments, visits, or
technician-app surfaces.

---

## 13. Notes / Activity

Phase 9 should align with the existing reusable notes / activity
pattern when it exists.

### Recommended

- Reuse `core.notes` for job-attached notes (Phase 1 has the
  `notes` table; Phase 4 added contact notes through a reusable
  pattern — Phase 9 should mirror it for jobs).
- Reuse `core.activities` for activity rows when:
  - a job is created (manual or from quote),
  - a job is converted from a quote (`activity_type`:
    `job.created_from_quote`),
  - a job's status changes,
  - a job's line items change in a way worth surfacing.

### Scope

If wiring notes + activity into the job detail page makes Phase 9
too large, **defer them to a Phase 9 follow-up sub-phase** (e.g.
Phase 9D-2 / 9E-2 / 9F polish). Sign-off Definition-of-Done
**must** include "job created" activity at minimum, since the
existing Phase 4 customer-hub timeline depends on it.

Phase 9 does **not** touch the Phase 3 message-automation engine.
"Job created" activity does not trigger SMS or email to the
customer in Phase 9.

---

## 14. Schema Needs

Document likely Phase 9 schema. Phase 9B will land the migration.

### `jobs` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. |
| `business_id` | uuid NOT NULL | FK → `businesses(id)` ON DELETE CASCADE. |
| `contact_id` | uuid NOT NULL | FK → `contacts(id)` ON DELETE CASCADE. A job without a customer is meaningless. |
| `property_id` | uuid NULL | FK → `properties(id)` ON DELETE SET NULL. Nullable because some service types (indoor add-ons, future product sales) may not bind to a property. |
| `quote_id` | uuid NULL | FK → `quotes(id)` ON DELETE SET NULL. Set on quote → job conversion. Not unique; a quote may seed multiple jobs over time (§5). |
| `title` | text NOT NULL | Required. Default copy on conversion: quote's plan/option label or "Job". |
| `summary` | text NULL | Optional longer description. |
| `status` | text NOT NULL DEFAULT `'draft'` | CHECK enum: `draft \| unscheduled \| scheduled \| in_progress \| completed \| canceled`. |
| `source` | text NOT NULL DEFAULT `'manual'` | CHECK enum: `manual \| quote`. Drives "Created from quote" display + activity. |
| `scheduled_start_at` | timestamptz NULL | §10. |
| `scheduled_end_at` | timestamptz NULL | §10. CHECK `end >= start` when both present. |
| `arrival_window_label` | text NULL | §10. |
| `estimated_total_cents` | bigint NOT NULL DEFAULT 0 | App-maintained snapshot (§8). CHECK >= 0. |
| `created_at` / `updated_at` | timestamptz | Standard. |

**Indexes (suggested):**

- `(business_id)`
- `(business_id, status)`
- `(business_id, created_at desc)`
- `(business_id, scheduled_start_at)`
- `(contact_id)` — for the contact-hub jobs list
- `(quote_id)` — for jumping from a quote to its jobs

**RLS:** Pattern B (members SELECT; INSERT/UPDATE/DELETE through
service-role server actions). Matches every Phase 4–8 core table.

### `job_line_items` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. |
| `business_id` | uuid NOT NULL | FK → `businesses(id)` ON DELETE CASCADE. |
| `job_id` | uuid NOT NULL | FK → `jobs(id)` ON DELETE CASCADE. |
| `service_id` | uuid NULL | FK → `services(id)` ON DELETE SET NULL. |
| `name` | text NOT NULL | CHECK `length(btrim(name)) > 0`. |
| `description` | text NULL | |
| `quantity` | numeric(10,2) NOT NULL DEFAULT 1 | CHECK > 0. Numeric so half-units / time-based services work later. |
| `unit_price_cents` | bigint NOT NULL | CHECK >= 0. |
| `total_cents` | bigint NOT NULL | CHECK >= 0. App-computed `round(quantity * unit_price_cents)`. |
| `sort_order` | integer NULL | Render order. |
| `source` | text NOT NULL | CHECK enum: `quote \| service \| custom`. |
| `created_at` / `updated_at` | timestamptz | Standard. |

**Indexes (suggested):**

- `(business_id)`
- `(business_id, job_id)`
- `(job_id, sort_order asc nulls last, created_at asc)` — render order

**RLS:** Pattern B.

### Money convention

`bigint` cents everywhere. Phase 9 follows the Phase 5+ standard.
Quote conversion multiplies the existing `quotes.selected_total`
(numeric dollars) by 100 at the boundary.

### What Phase 9 does NOT add

- No invoice / invoice_line_items table.
- No payments / payment_methods table.
- No visits / appointments / calendar_events table.
- No crew / technician / assignment tables.
- No recurring schedule / agreement tables.
- No taxes / discounts / deposits columns.
- No customer_notification / job_reminder rows.

Each belongs to a future foundation phase.

---

## 15. Quote Conversion Design

Phase 9 implementation should follow this flow.

### Flow

1. **Entry point** — `/admin/quotes/[quoteId]` adds a **"Create
   Job"** button on the quote detail page. Hidden when the quote
   already has at least one job (or always shown if §5
   re-conversion is desired — Phase 9B decides; default: always
   shown with a "create another job" affordance when prior jobs
   exist).
2. **Server action** (`createJobFromQuoteAction`) runs:
   - Auth + active business + ownership checks (the quote must
     belong to the active business).
   - Builds a snapshot from the quote:
     - `contact_id` ← quote's contact
     - `property_id` ← quote's property
     - `quote_id` ← quote.id
     - `title` ← quote's selected option/plan label or a fallback
     - `source = 'quote'`
     - `status = 'unscheduled'`
     - `estimated_total_cents` ← computed from line items below
   - Builds `job_line_items` from the quote's `line_items_snapshot`
     when it's a usable JSON array; otherwise builds a single line
     item from `selected_total` + `selected_option_key` +
     `options_snapshot` lookup. Falls back to one row named "Quoted
     work" with the `selected_total * 100` total if nothing else
     can be parsed.
   - Writes one `core.activities` row:
     `activity_type='job.created_from_quote'` referencing the
     quote.
3. **Redirect** to `/admin/jobs/[jobId]`.

### Line-item snapshot rules

Quotes currently store `line_items_snapshot jsonb`. The exact
shape was written by the Phase 1 Auto-Quote Plugin. Phase 9
implementation should:

- Read the JSON safely (pure parser).
- Validate each element has at least a name + a positive total.
- Map each element into `job_line_items` with
  `source = 'quote'`, `service_id` resolved when the snapshot
  records a service key the catalog still knows.
- When the snapshot is missing / unusable, fall back to a single
  `source = 'quote'` row built from `selected_total` and the option
  label.
- **Never throw.** Conversion always succeeds; a degraded snapshot
  produces a single fallback line item and surfaces a soft warning
  on the job detail page.

### Atomicity

Quote → job conversion writes:

1. one `jobs` row,
2. N `job_line_items` rows,
3. one `activities` row.

Phase 9B picks the atomicity approach. Two options:

- **A. Ordered + recompute** (Phase 5B / 7D-1 pattern): insert job
  → insert line items → recompute `estimated_total_cents` from the
  inserted lines and `update` the job row → insert activity. Soft-
  fails on the activity row.
- **B. Postgres function** (Phase 7D-2 pattern): wrap all writes in
  a `security definer` function for true atomicity.

Recommended: **A** for Phase 9B, because conversion is a
one-shot create (no concurrent writers contending on the same row,
unlike Hang actions which serialize on a single session). Promote
to B only if real operator usage surfaces partial-write incidents.

### Re-conversion

Allowed. Each conversion creates a new `jobs` row. The quote
detail page lists the resulting jobs (a small section showing
"Jobs created from this quote: 2").

---

## 16. Manual Creation Design

### Entry points

- **Jobs page** — top-right **"Create Job"** button.
- **Contact detail page** — small "Create Job" affordance near the
  contact's properties / quotes sections.

### Flow (Jobs page)

1. Operator clicks **Create Job**.
2. Contact picker (search by name / phone / email). Required.
3. Property picker (filtered to the chosen contact's properties).
   Optional.
4. Title + optional summary.
5. Line-item editor:
   - Add line: catalog (`services`) dropdown OR custom typed.
   - Per-row: name, qty, unit price (dollars input → cents at the
     boundary).
   - Live total computed from `quantity * unit_price_cents`.
6. Optional scheduling fields (3 simple inputs from §10).
7. Status defaults to `draft`.
8. Submit → job + line items created → redirect to job detail.

### Flow (Contact detail)

Pre-fills the contact. Same form, just the contact picker is
hidden and read-only.

### Validation

All validation lives in pure helpers (Phase 5+ pattern):

- `validateJobForm({...})` — contact required, title required,
  scheduled_end_at >= scheduled_start_at when both present.
- `validateJobLineItemForm({...})` — name required, quantity > 0,
  unit_price_cents >= 0.

Server actions re-validate before any DB write.

### If contact/property picker is too big for Phase 9D

Document a "contact-first" fallback: only allow manual job
creation from `/admin/contacts/[contactId]` (with the contact
already chosen). The Jobs-page **Create Job** button is added in
a follow-up sub-phase. Phase 9D decides during implementation
review.

---

## 17. Simulation Awareness

Jobs are core CRM records. They are `business_id`-scoped like every
other Phase 4–8 core table, so they **work automatically inside
both real and simulation workspaces** — but Phase 9 does not
deliberately wire simulation gameplay to create jobs.

### Phase 9 stance

- Schema is simulation-safe (no `business_id` exception).
- Server actions remain workspace-agnostic — the active business
  resolves the same way it does for contacts, quotes, etc.
- **No job creation from Door Hanger simulation outcomes** in
  Phase 9. The future "Simulation Outcomes" phase (post-Phase 7+)
  may eventually generate simulated jobs from completed door
  hanger routes; that's not Phase 9.
- **No real customer notifications** trigger on job
  creation/status change, real or simulated. The Phase 6D GHL
  guardrail continues to short-circuit messaging in simulation,
  but Phase 9 doesn't even reach for the messaging engine.

---

## 18. Recommended Implementation Plan

Phase 9 splits into six sub-phases. Each subsequent sub-phase is
gated on the previous one passing review.

### Phase 9A — Docs only ✅ (this file)

- Source-of-truth doc (this file).
- Phase 9 pointer in `CLAUDE.md` and `README.md`.
- **No code, no schema, no business-logic change.**

### Phase 9B — Schema + server foundation (no UI)

- One additive migration: `jobs` + `job_line_items` tables, RLS
  Pattern B (members SELECT; writes via service-role), indexes,
  CHECK constraints, status + source enums.
- Pure validation helpers (`validateJobForm`,
  `validateJobLineItemForm`, `parseQuoteLineItemsSnapshot`,
  `computeJobLineItemTotal`, `computeJobEstimatedTotal`).
- Server-only data loaders (`listJobs`, `getJob`,
  `getJobLineItems`).
- Server-only create helpers
  (`createJobFromQuote`, `createManualJob`, `addJobLineItem`,
  `updateJobLineItem`, `removeJobLineItem`, `updateJobStatus`,
  `updateJobScheduling`).
- Pure unit tests for every validator + parser + total math.
- No UI yet; helpers are library-only at this point.

### Phase 9C — CRM nav + jobs list + read-only job detail

- Nav: add **Jobs** to the CRM group; update `nav-config.test.ts`.
- `/admin/jobs` list page (status filter; basic columns from §12).
- `/admin/jobs/[jobId]` read-only detail (header, contact/property
  KV, line items table, source quote link, scheduling fields read-
  only).
- No create / edit / delete flows yet.

### Phase 9D — Manual job creation + status / scheduling edits

- "Create Job" form (per §16).
- Server actions: `createManualJobAction`,
  `addJobLineItemAction`, `updateJobLineItemAction`,
  `removeJobLineItemAction`, `updateJobStatusAction`,
  `updateJobSchedulingAction`.
- Contact picker (basic search; reuse Phase 4 patterns if
  available).
- Property picker (filtered to the chosen contact).

### Phase 9E — Quote → Job conversion

- "Create Job" button on `/admin/quotes/[quoteId]`.
- Server action `createJobFromQuoteAction` per §15.
- Quote detail shows the list of jobs created from this quote.
- Optional: minimal "Created from quote" badge on the job detail.

### Phase 9F — Notes / activity polish + QA report

- Hook job creation + status changes into `activities`.
- Mirror the existing contact-detail notes pattern on the job
  detail page if time allows.
- `docs/PHASE_9_QA_REPORT.md` — Definition-of-Done checklist,
  Do-Not-Build audit, regression checks, security/schema review.

Adjust the split if implementation review surfaces a safer order.

---

## 19. Do Not Build in Phase 9

Pinned for clarity. Phase 9 must not build any of:

- **Full scheduling calendar.**
- Crew / technician assignment.
- Conflict detection.
- Recurring visits / recurring jobs.
- Visits / appointments table (jobs carry their own basic
  scheduling fields per §10; a dedicated visits table is future).
- Technician mobile app or any field-execution surface.
- On-the-way / arrival workflows.
- Route optimization for jobs.
- Real-time field tracking.
- **Invoices.**
- Invoice line items.
- **Payments / deposits / refunds.**
- Payment methods / processor integration.
- Taxes / discounts / surcharges.
- Bundled-package / kit pricing.
- Customer notifications on job creation or status change (real
  or simulated). No SMS, no email.
- Message automation outcomes from job events. Phase 3 engine
  stays out of Phase 9.
- Job reminders.
- Quote acceptance / payment portal.
- Customer accounts / customer-facing job views.
- Public `/q` changes.
- Simulation-driven job generation (no Door Hanger response →
  job pipeline).
- Plugin builder / plugin marketplace.
- Data import / export.
- AI / context-engine expansion.
- Edit / delete / archive flows on jobs and job_line_items beyond
  what Phase 9D explicitly ships (status change, line item add /
  remove / edit, scheduling field edit).

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 Do-Not-Build lists remain
in force. If a Phase 9 task touches any of the above, **stop and
ask first.**

---

## 20. Success Definition

Phase 9A is successful when:

- Source-of-truth doc exists. ✅ (this file).
- "Job = work order" is documented. ✅ (§2).
- Quote / job / invoice distinction is documented. ✅ (§§2, 5).
- Job line items decision is documented. ✅ (§6).
- Quote-to-job snapshot rule is documented. ✅ (§5).
- Manual job creation decision is documented. ✅ (§§4, 7, 16).
- Statuses are documented. ✅ (§9).
- Basic scheduling fields are documented. ✅ (§10).
- CRM nav placement is documented. ✅ (§11).
- Likely schema needs are documented. ✅ (§14).
- Implementation plan is documented. ✅ (§18).
- Do-Not-Build list is documented. ✅ (§19).
- `CLAUDE.md` carries a Phase 9 pointer paragraph.
- `README.md` Status section names Phase 9 and links to this doc.
- **No app code, no business logic, no database schema changes**
  in Phase 9A.

If implemented in later Phase 9 sub-phases:

- `jobs` and `job_line_items` tables exist (Phase 9B migration).
- **Jobs** nav exists under CRM (Phase 9C).
- `/admin/jobs` list and `/admin/jobs/[jobId]` detail exist
  (Phase 9C).
- Manual job creation works with both catalog + custom line items
  (Phase 9D).
- Quote → Job conversion works and snapshots the quote into
  `job_line_items` (Phase 9E).
- Job total displays from `estimated_total_cents` / line-item sum
  (Phase 9D).
- Basic scheduling fields exist on the job detail page
  (Phase 9D).
- No invoice / payment / full scheduling calendar / customer
  messaging built (Do-Not-Build audit clean).
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass.
- `docs/PHASE_9_QA_REPORT.md` exists and signs off the
  Definition-of-Done + Do-Not-Build audit.

---

## 21. Phase 9A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [ ] `CLAUDE.md` carries a Phase 9 pointer paragraph.
- [ ] `README.md` Status section names Phase 9 and links to this doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 9A ends at docs only. Phase 9B is the first step that touches
code, and it only ships after this doc is reviewed and approved.
