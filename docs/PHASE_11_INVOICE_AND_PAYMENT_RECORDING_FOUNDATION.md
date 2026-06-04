# Phase 11 — Invoice + Payment Recording Foundation

**Status:** source-of-truth design doc for Phase 11.
**Created:** 2026-06-03.
**Scope:** docs only (Phase 11A). **No app code, no business logic,
no schema changes** in this step.

Phase 11 adds the **billing snapshot layer** after Jobs (Phase 9)
and Schedule (Phase 10). It introduces three new core objects —
**Invoice**, **Invoice Line Item**, **Invoice Payment** — and the
Jobber-style **Complete Job → Create Invoice → Record Payment →
Mark Receipt Sent** workflow. **No online payment processing, no
Stripe / Square, no customer payment portal, no automatic receipt
sending, no SMS / email, no taxes / discounts / refunds, no
QuickBooks sync, no recurring invoices, no public `/q` changes.**

> Required reading before starting Phase 11 implementation work:
>
> - `CLAUDE.md`
> - `schema.md` (especially §13 contacts, §14 properties, §16
>   quotes, §22f jobs + job_line_items)
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md`
>   (job snapshot rule §5, statuses §9, schema §14, line-item
>   shape §6)
> - `docs/PHASE_9_QA_REPORT.md`
> - `docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`
>   (status-transition posture §10, soft-fail activity posture §12)
> - `docs/PHASE_10_QA_REPORT.md`
> - existing Jobs code:
>   - `src/core/jobs/admin-data.ts`
>     (`getJob`, `getJobLineItems`, `listJobsForContact`,
>     `listJobsForQuote`)
>   - `src/core/jobs/admin-create.ts`
>     (`updateJobStatus`, status transition posture)
>   - `src/core/jobs/totals.ts` (cents math + sum helpers — the
>     invoice helpers should mirror this style)
>   - `src/core/jobs/validation.ts` (form-validation posture)
>   - `src/core/jobs/display.ts` (`formatCentsAsDollars`,
>     `jobStatusLabel`, `jobStatusTone`)
>   - `src/app/admin/jobs/page.tsx` — list page pattern
>   - `src/app/admin/jobs/[jobId]/page.tsx` — detail page pattern
>   - `src/app/admin/jobs/actions.ts` — server-action pattern
>     (soft-fail `createActivity`, `revalidatePath`)
> - existing Schedule code (the Phase 10D modal/confirm pattern
>   maps directly to the Phase 11D Complete-Job modal):
>   - `src/app/admin/schedule/actions.ts`
>   - `src/app/admin/schedule/schedule-job-modal.tsx`
>   - `src/app/admin/schedule/scheduled-card-details.tsx`
> - existing notes / activity / nav patterns:
>   - `src/core/activity/logger.ts`
>   - `src/components/admin/nav-config.ts`
>   - `src/components/admin/nav-config.test.ts`

---

## 1. Phase 11 Purpose

Phase 11 is **Invoice + Payment Recording Foundation**.

Goal: add the **billing snapshot** layer to the CRM. Phase 9
shipped Jobs as work orders; Phase 10 placed jobs on a calendar.
Phase 11 lets the operator close the loop: **complete a job**,
**create an invoice from the completed job**, **record how the
customer paid**, and **mark a receipt as sent** (manually for
now).

The app's core CRM journey becomes:

```
Contact → Property → Quote → Job → Schedule → Invoice → Payment record
                                              ↓
                                       Mark Receipt Sent (manual)
```

Phase 11A is **docs only.** No app code, no schema, no
business-logic changes in this step.

---

## 2. Invoice Definition

An **invoice is a billing snapshot.** It represents money owed by
a customer for completed work.

An invoice is **not**:

- a **quote** — quotes are sales proposals (Phase 1).
- a **job** — jobs are work orders (Phase 9).
- a **payment processor transaction** — Phase 11 has no Stripe /
  Square / payment-link integration.
- a **receipt delivery system** — receipt-sending automation is
  out of scope; Phase 11 only tracks `receipt_sent_at` as a
  manual timestamp.

### Mental model

| Object | Role | Phase |
|---|---|---|
| **Quote** | Sales proposal snapshot | Phase 1 (exists) |
| **Job** | Work order snapshot | Phase 9 (exists) |
| **Schedule** | When the job happens | Phase 10 (exists) |
| **Invoice** | Billing snapshot | **Phase 11 (this phase)** |
| **Invoice Payment** | Record of money received | **Phase 11 (this phase)** |
| **Receipt** | Notification + proof to customer | Tracked here (manual `receipt_sent_at`); actual sending later. |
| **Online payment / payment processor** | Stripe / Square / etc. | Future. |
| **Customer payment portal** | Customer-facing accept-and-pay | Future. |

### Why "snapshot"

A quote, job, and invoice each carry forward what matters from the
prior object **at the moment of creation**. Later edits upstream
do **not** silently rewrite downstream snapshots. This is the same
rule Phase 9 pinned for quote → job conversion (§5 of the Phase 9
doc). Phase 11 extends it: a future job line-item edit does NOT
rewrite an already-issued invoice; the operator must edit the
invoice directly (out of Phase 11 scope) or void + reissue (also
out of Phase 11 scope).

---

## 3. Jobber-Inspired Workflow

Phase 11 mirrors the operator's mental model from Jobber-style
home service software:

```
Job is completed
  ↓ (modal confirmation — §5)
Invoice is created from the job (unpaid)
  ↓ (operator records payment — §12)
Invoice is marked paid
  ↓ (operator manually marks receipt sent — §13)
Receipt is tracked as sent
```

Phase 11 does not automate any of these steps beyond the "Complete
Job → Create Invoice" linkage. Payment recording is a manual
operator action; receipt sending is a manual operator action.

---

## 4. Invoice Creation Paths

Phase 11 supports two creation paths.

### A. Primary — Complete Job → Create Invoice

- Operator clicks **Complete Job** on the job detail page.
- A confirmation modal opens (§5).
- On confirm: job status → `completed`, a new invoice is created
  from the job snapshot.
- Invoice line items are copied from `job_line_items`.
- Invoice status defaults to `unpaid`.
- Operator is redirected (or linked) to `/admin/invoices/[id]`.

### B. Fallback — Manual Create Invoice from Job

- Available from the job detail page when the operator wants to
  create an invoice without going through the completion flow
  (edge cases, already-completed jobs, re-invoicing scenarios).
- Same snapshot logic — `job_line_items` → `invoice_line_items`,
  totals computed from the snapshot.
- Defaults: `status = 'unpaid'` (recommended) — Phase 11B/C may
  also expose `draft` if the operator wants to stage an invoice
  before issuing it.

### Phase 11 invariant

**No invoice can exist without a `job_id`.** Free-floating invoices
("ad-hoc bills, no job") are out of scope for Phase 11. The CRM
journey is Contact → Property → Quote → Job → Invoice; every
invoice anchors back to a job.

---

## 5. Complete Job Confirmation Modal

Completing a job **must not** silently create an invoice. Phase 11
ships a confirmation modal so the operator sees what will be
billed before they commit.

### Flow

1. Operator clicks **Complete Job** on `/admin/jobs/[jobId]`.
2. Modal opens with:
   - Job title + status pill.
   - Contact + property line.
   - Read-only preview of `job_line_items` (name, qty, unit, total).
   - Computed total (sum of line items).
   - Note: *"This will mark the job completed and create an unpaid
     invoice. Payment is recorded separately."*
3. Operator clicks **Complete and create invoice**.
4. Server action:
   - Verifies job belongs to active business.
   - Verifies status is eligible (`scheduled` / `in_progress` —
     see §15 for the precise eligibility decision).
   - Updates job status → `completed` (reuses Phase 9B
     `updateJobStatus`).
   - Creates invoice (`source = 'job_completion'`, `status =
     'unpaid'`, `job_id` preserved, contact + property copied).
   - Copies `job_line_items` → `invoice_line_items` with
     `source = 'job'` and `job_line_item_id` populated.
   - Recomputes invoice totals from inserted line items.
   - Soft-fail `createActivity` rows (§17):
     - `job.completed_with_invoice`
     - `invoice.created_from_job`
5. Redirect to `/admin/invoices/[invoiceId]`.

### What the modal must NOT do

- **No automatic payment.** Invoice is created `unpaid`.
- **No automatic receipt sending.** `receipt_sent_at` stays
  `null`.
- **No customer notification.** No SMS, no email, no GHL call.
  The Phase 6D guardrail is not even reached.
- **No "edit before sending"** workflow. Phase 11 does not
  expose invoice editing UI; if the line items are wrong, the
  operator fixes the job line items first (Phase 9D), then
  re-runs Complete Job (which creates a new invoice — §16 covers
  the "multiple invoices per job" decision).

---

## 6. Invoice Snapshot Rule

Creating an invoice from a job **copies the job into the invoice.**
The invoice is **not** a live mirror of the job.

When the invoice is created:

1. Preserve `invoices.job_id` (FK).
2. Copy customer / contact / property linkage onto the invoice.
3. Copy `job_line_items` → `invoice_line_items` (with the
   per-row `job_line_item_id` reference preserved for traceability
   per §8).
4. Compute invoice `subtotal_cents` / `total_cents` from the
   inserted `invoice_line_items`.
5. **Later edits to `job_line_items` do not silently change the
   invoice.** The invoice is a snapshot from the moment of
   creation.

### Principle (refresher)

| Object | What it is |
|---|---|
| **Quote** | Sales proposal snapshot (Phase 1). |
| **Job** | Work order snapshot (Phase 9). |
| **Invoice** | Billing snapshot (this phase). |
| **Payment** | Record of money received (this phase). |

Each subsequent snapshot carries forward what matters at creation
time. Later edits to upstream snapshots do **not** retroactively
rewrite downstream snapshots — same rule the Phase 9 quote → job
parser already enforces.

### What about re-invoicing?

A given job may be invoiced more than once over its lifetime (the
operator voided the first invoice, the original invoice was for
the wrong line items, etc.). Phase 11 keeps this simple:

- Each invoice creation produces a **new** `invoices` row with its
  own snapshot.
- The previous invoice row is unaffected.
- `invoices.job_id` is **not unique** — a job can have multiple
  invoices across its lifetime.
- **The UI discourages this** (§16): the Complete Job + Manual
  Create Invoice flows surface the existing invoice(s) for the
  job before letting the operator add another. Hard-blocking is
  out of Phase 11 scope.

---

## 7. Invoice Statuses

Use this status taxonomy:

| Status | Meaning |
|---|---|
| `draft` | Invoice exists but is not finalized. May still be edited (Phase 11 deliberately exposes no edit UI; `draft` is reserved for the manual-create path's optional staging mode). |
| `unpaid` | Invoice is real and money is owed. Default for the Complete Job flow. |
| `paid` | Invoice has been fully paid. Operator can still mark receipt sent after this. |
| `void` | Invoice is canceled / invalidated. Doesn't count toward A/R. Phase 11 does not ship a void action UI; the status exists for future use. |

### Phase 11 transitions

- **Complete Job → Create Invoice** → defaults to `unpaid`.
- **Manual Create Invoice from Job** → defaults to `unpaid`;
  Phase 11C/D may expose `draft` as an alternative.
- **Mark Paid** (§12) → moves to `paid` when `balance_cents <= 0`.
- **Void** — UI not built in Phase 11.

### What Phase 11 does NOT model

- **No `sent` status.** Automatic invoice sending is out of scope;
  there is no `sent_at` column. Receipt-sent tracking is a separate
  field (`receipt_sent_at`, §13) and applies to paid invoices.
- **No `overdue` status.** Due-date math + overdue flagging is out
  of scope (no `due_at` column in Phase 11).
- **No guarded state machine.** Status is a `text` column with a
  CHECK enum; transition rules are enforced by the action layer.

---

## 8. Invoice Line Items

Phase 11 introduces **`invoice_line_items`** as a child table of
`invoices`. Same shape philosophy as Phase 9B `job_line_items`.

### Per-row shape

| Column | Purpose |
|---|---|
| `id` (uuid) | PK. |
| `business_id` (uuid) | Scoping + RLS. |
| `invoice_id` (uuid) | FK → `invoices(id)` ON DELETE CASCADE. |
| `job_line_item_id` (uuid NULL) | FK → `job_line_items(id)` ON DELETE SET NULL. Traceability back to the source line. |
| `service_id` (uuid NULL) | FK → `services(id)` ON DELETE SET NULL when the source line came from the catalog. |
| `name` (text NOT NULL) | Required. Human label. |
| `description` (text NULL) | Optional notes. |
| `quantity` (numeric(10,2) NOT NULL) | CHECK > 0. |
| `unit_price_cents` (bigint NOT NULL) | CHECK >= 0. |
| `total_cents` (bigint NOT NULL) | CHECK >= 0. App-computed `round(quantity * unit_price_cents)`. |
| `sort_order` (integer NULL) | Render order. |
| `source` (text NOT NULL) | CHECK enum: `job \| custom`. Phase 11 primarily uses `job`; `custom` reserved for a future "add line item to invoice manually" path. |
| `created_at` / `updated_at` | timestamptz. |

### Phase 11 simplicity bounds

For Phase 11, line items are deliberately simple:

- **No taxes.** No `tax_rate` column. No `tax_cents` column.
  Future Invoicing Tax phase introduces these.
- **No discounts** at the line level. No discount columns.
- **No deposits.** Out of Phase 11 scope.
- **No bundles / packages.** Each line stands alone.
- **No advanced pricing engine.** `quantity * unit_price_cents`
  rounded.
- **No line-item-level customer note** beyond `description`.
- **No reorder UI** (matches Phase 9D — sort_order set at insert).

If a future Taxes / Discounts phase needs richer semantics, that
phase adds the columns + logic.

---

## 9. Invoice Totals

The **source of truth** for an invoice's total is the sum of its
`invoice_line_items.total_cents`.

### Stored summary columns on `invoices`

The Phase 11 schema stores these summary columns as
**app-maintained snapshots** so list pages stay fast (same
posture as Phase 9 `jobs.estimated_total_cents`):

| Column | Definition |
|---|---|
| `subtotal_cents` | `sum(invoice_line_items.total_cents)` |
| `total_cents` | Phase 11 = `subtotal_cents` (no taxes / discounts yet). |
| `amount_paid_cents` | `sum(invoice_payments.amount_cents)` |
| `balance_cents` | `total_cents - amount_paid_cents` |

### Recompute path

- After **add / update / remove** of any `invoice_line_items` row:
  - Recompute `subtotal_cents` + `total_cents` from line items.
  - Recompute `balance_cents` = `total_cents - amount_paid_cents`.
- After **insert** of any `invoice_payments` row:
  - Recompute `amount_paid_cents` = `sum(payments.amount_cents)`.
  - Recompute `balance_cents` = `total_cents - amount_paid_cents`.
  - If `balance_cents <= 0` AND `status == 'unpaid'` → flip to
    `paid` + set `paid_at` to the most recent payment's `paid_at`
    (or `now()` as a fallback).

Reason for the maintained snapshot (not a `sum()` join on read):
the invoice list page wants to sort/filter by total + balance +
status; a sum-on-read cost grows linearly with line items.
Pattern matches Phase 9B `recomputeJobEstimatedTotal`.

### Money convention

All Phase 11 money columns use **bigint cents**, matching Phase
5+. No `numeric(10,2)` dollars on the invoice or payment shape.
The Phase 9 `quotes.selected_total` (numeric dollars → cents at
the boundary) is the existing precedent.

---

## 10. Payment Model

Phase 11 uses a **hybrid** payment model.

### `invoices` stores the summary

- `status`
- `total_cents`
- `amount_paid_cents`
- `balance_cents`
- `paid_at` nullable
- `receipt_sent_at` nullable

This keeps the list page fast (no join on every render).

### `invoice_payments` stores the history

- `invoice_id`
- `amount_cents`
- `payment_method`
- `paid_at`
- `notes` nullable
- `created_at`

The full payment history is preserved; the summary on the parent
invoice row is recomputed after every insert.

### Why hybrid

Pure summary (no payment history) loses audit trail. Pure
history (sum on read) gets expensive on the list page. The
hybrid mirrors the Phase 9 jobs ↔ job_line_items posture:
authoritative summary on the parent, audit trail on the child,
app-recomputed boundary in the server action.

### Partial payments

The data model supports partial payments — multiple
`invoice_payments` rows roll up into `amount_paid_cents`. The
**Phase 11 UI** ships **paid-in-full first** (§12), but later
phases can add partial-payment UX without a schema redesign.

---

## 11. Payment Methods

Use a payment-method enum:

| Method | Notes |
|---|---|
| `cash` | Cash payment. |
| `check` | Paper check. |
| `card` | Manually keyed / external card swipe (no processor integration). |
| `zelle` | Zelle / Venmo / Cash App-style ACH variants. |
| `other` | Catch-all. |

Plus:

- Optional `notes` text on each payment row (e.g. check number,
  confirmation hash, "Zelle from spouse's account", etc.).

### What Phase 11 does NOT model

- **No payment processor integration.** No Stripe, no Square, no
  payment links.
- **No transaction IDs** column (the `notes` field absorbs check
  number / confirmation code when needed).
- **No refunds table.** A future Refunds phase introduces a
  `invoice_refunds` table or negative `invoice_payments` rows.
- **No automatic payment reconciliation.**

---

## 12. Paid-in-Full UI First

The schema supports partial payments, but the **Phase 11 UI**
ships **paid-in-full first.**

### Mark Paid flow

1. Operator opens `/admin/invoices/[invoiceId]`.
2. Clicks **Mark Paid**.
3. Modal opens with:
   - `amount_cents` input → defaults to `balance_cents`.
   - `payment_method` select → defaults to `cash`.
   - `paid_at` datetime → defaults to `now()`.
   - Optional `notes` textarea.
4. Server action:
   - Re-validates (amount > 0, method in enum, paid_at parses).
   - Inserts an `invoice_payments` row.
   - Recomputes `amount_paid_cents` + `balance_cents`.
   - If `balance_cents <= 0` AND status was `unpaid` → flip status
     to `paid`, set `paid_at` to the payment's `paid_at`.
   - Soft-fail `createActivity` rows:
     - `invoice.payment_recorded`
     - `invoice.marked_paid` (only when the status flipped this
       call)
5. Modal closes; `router.refresh()` re-loads the detail page.

### What Phase 11 does NOT build

- **Complex partial-payment UX.** Operator can submit multiple
  payment rows manually if needed (the action accepts an amount,
  the schema sums); the UI does not surface a "split payment"
  workflow.
- **Refund UI.** No refund button. No refund row type.
- **Overpayment handling beyond safe validation.** If the operator
  enters an `amount_cents` greater than `balance_cents`, the
  server action validates and rejects with a field error. No
  overpayment-credit row.

---

## 13. Receipt Tracking

Phase 11 ships a single column to track receipt status:

- `invoices.receipt_sent_at` (timestamptz NULL)

Meaning:

- `null` → receipt has not been marked sent.
- `timestamp` → operator manually marked the receipt as sent at
  that time.

### Mark Receipt Sent flow (optional in Phase 11E)

- Invoice detail page exposes a small **Mark Receipt Sent**
  affordance when:
  - `status = 'paid'` (typical), AND
  - `receipt_sent_at IS NULL`.
- Click → server action sets `receipt_sent_at = now()` + soft-fail
  activity `invoice.receipt_marked_sent`.
- **No SMS, no email, no message-automation call.** Operator
  separately sends a receipt out-of-band (Zelle confirmation,
  paper handoff, Squarespace receipt template, etc.); this is
  just a checkbox saying "yes I sent it."

### What Phase 11 does NOT build

- **Automatic receipt sending.** No template engine, no provider
  integration.
- **Email / SMS receipt delivery.**
- **Customer-facing receipt page.**
- **Receipt PDF generation.**
- **Receipt-sent triggers / message automations.**

---

## 14. CRM Nav Placement

Invoices live under **CRM** for Phase 11.

### Recommended nav

```
CRM
├── Contacts
├── Quotes
├── Jobs
└── Invoices     ← new in Phase 11
```

Do **not** create a new **Billing** group yet. A future phase
(Payments view + Receipts area + Refunds) can promote billing
into its own group if CRM grows past ~5 entries.

### Operations nav (Phase 10) stays as-is

`Operations → Schedule` (added in Phase 10C) is untouched.

### Nav-test pin

`src/components/admin/nav-config.test.ts` already pins the CRM
group order (`Contacts → Quotes → Jobs`). Phase 11C updates that
test to require the fourth entry to be `/admin/invoices`.

---

## 15. Job Status / Eligibility Decision

Which job statuses can be **completed** (= the Complete Job flow)?

### Phase 11 decision

The Complete Job action is eligible when the job's status is:

- `scheduled` — the most common path (operator finishes the work
  in the field, comes back, clicks Complete Job).
- `in_progress` — work was started and is now done.
- `unscheduled` / `draft` — **also allowed** because in real
  operations a tiny job can be completed without ever being
  formally scheduled (a quick add-on, a same-day call).

Disallowed:

- `completed` — already done (the manual fallback can still
  create a follow-up invoice for it, §4B).
- `canceled` — operator must un-cancel first (Phase 11 does not
  build a status-recovery UI; the Phase 9D status select on the
  detail page is the recovery path).

### Phase 11D guard

The `completeJobAction` re-checks the status server-side and
returns `INVALID_STATUS` if the guard fails. Matches Phase 10D
posture.

---

## 16. Multiple Invoices Per Job

A given job may have **multiple invoices** over its lifetime
(operator voided one, customer wanted a separate invoice for the
add-on, etc.).

### Phase 11 stance

- `invoices.job_id` is **not unique** in the DB.
- The job detail page (§17) **discourages duplicate invoices** in
  the UI:
  - When a job already has at least one invoice, the **Complete
    Job** primary button is hidden or replaced with a "Job already
    invoiced" notice listing the existing invoice(s).
  - The **Manual Create Invoice** fallback button remains
    available but renders next to the existing-invoice list — the
    operator sees what's already there before they click.
- The list also includes voided invoices so the operator can see
  "this job had a previous invoice that was voided, and now we
  want a fresh one."

### What the schema does NOT enforce

- No unique constraint on `(job_id)`.
- No CHECK preventing > 1 invoice per job.

Hard-blocking is deliberately out of scope. The UI surfaces the
risk; the operator decides.

---

## 17. Invoice List / Detail Direction

Document the likely Phase 11 UI surfaces.

### Invoices list (`/admin/invoices`)

Columns (suggested):

- Status badge (tinted by §7 taxonomy).
- Invoice number / short id.
- Contact name.
- Property line (when available).
- Source job link.
- `total_cents` (right-aligned).
- `amount_paid_cents`.
- `balance_cents` (emphasized when > 0).
- `paid_at` (when set).
- `receipt_sent_at` (icon: ✓ / —).
- Created date.

Filters (Phase 11 ships minimal):

- Status pill filter (matching §7).
- Optional simple search on contact / invoice number.

No saved views, no advanced filters, no multi-select.

### Invoice detail (`/admin/invoices/[invoiceId]`)

Sections:

- **Header** — status badge, totals summary
  (Total / Paid / Balance), Mark Paid + Mark Receipt Sent
  affordances (gated by §§12–13).
- **Contact / property links** — small KV strip, linking to the
  Phase 4 customer-hub.
- **Source job link** — deep link to `/admin/jobs/[jobId]`.
- **Line items** — table of `invoice_line_items` (Name / Qty /
  Unit / Total). Read-only in Phase 11 (no add/edit/remove UI
  yet).
- **Payments** — table of `invoice_payments`
  (Date / Method / Amount / Notes). Each row is a record of a
  past payment; no inline edit.

### Job detail integration

`/admin/jobs/[jobId]` gains:

- A **Complete Job** button (only when no invoice exists for the
  job, per §16; otherwise the button slot shows a "Job already
  invoiced" hint with a link).
- A small **Invoices** section listing existing invoices for the
  job (status, total, balance, link to detail).
- A **Create invoice** fallback button (the §4B path), positioned
  to be discoverable but not the default.

### Contact detail integration

`/admin/contacts/[contactId]` (Phase 4 customer hub) **could**
also surface a small Invoices section. Phase 11C decides whether
that ships in 11C or is deferred to 11F polish. Recommended: ship
the Invoices section on the contact hub if it's a small
copy-paste of the Phase 4 patterns; otherwise defer.

---

## 18. Activity Behavior

Phase 11 should align with the existing Phase 9/10 soft-fail
activity pattern.

### Recommended activity types

| `activity_type` | When written |
|---|---|
| `job.completed_with_invoice` | After the Complete Job flow successfully creates an invoice. Details: `{ job_id, invoice_id, line_item_count, total_cents }`. |
| `invoice.created_from_job` | After any successful job → invoice creation (Complete Job + Manual Create). Details: `{ job_id, line_item_count, total_cents, source: 'job_completion' \| 'manual' }`. |
| `invoice.payment_recorded` | After a successful payment insert. Details: `{ amount_cents, payment_method, paid_at, balance_cents }`. |
| `invoice.marked_paid` | Only when the payment-recorded call flipped status `unpaid → paid`. Details: `{ paid_at, total_cents }`. |
| `invoice.receipt_marked_sent` | When the operator clicks Mark Receipt Sent. Details: `{ receipt_sent_at }`. |

### Posture

- Every write is **soft-fail** — `void createActivity({...})`.
- Activity failure does **not** roll back the invoice / payment /
  status mutation.
- **No message-automation calls.** Phase 3 engine stays out of
  Phase 11. Phase 6D GHL guardrail is not even reached.

---

## 19. Simulation Awareness

Invoices and payments are core CRM/business records — they are
`business_id`-scoped like every other Phase 4–10 core table, so
they **work automatically inside both real and simulation
workspaces** — but Phase 11 does not deliberately wire simulation
gameplay to create invoices or record payments.

### Phase 11 stance

- Schema is simulation-safe (no `business_id` exception).
- Server actions remain workspace-agnostic — the active business
  resolves the same way it does for contacts, jobs, etc.
- **No invoice creation from simulation outcomes** in Phase 11.
- **No simulated payments.**
- **No simulated receipt sending.**
- **No real customer notifications** trigger on any invoice or
  payment event, real or simulated. The Phase 6D GHL guardrail
  continues to short-circuit messaging in simulation, but Phase
  11 doesn't even reach for the messaging engine.

A future "Simulation Outcomes" phase could eventually generate
simulated invoices and payments from completed jobs; that is not
Phase 11.

---

## 20. Likely Schema Needs

Document the likely Phase 11 schema. Phase 11B will land the
migration.

### `invoices` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. |
| `business_id` | uuid NOT NULL | FK → `businesses(id)` ON DELETE CASCADE. |
| `contact_id` | uuid NOT NULL | FK → `contacts(id)` ON DELETE CASCADE. |
| `property_id` | uuid NULL | FK → `properties(id)` ON DELETE SET NULL. |
| `job_id` | uuid NOT NULL | FK → `jobs(id)` ON DELETE CASCADE. Phase 11 invariant: no free-floating invoices (§4). |
| `invoice_number` | text NULL | Human-friendly id. Optional in Phase 11B; auto-generation can land in 11C/F. |
| `status` | text NOT NULL DEFAULT `'unpaid'` | CHECK enum: `draft \| unpaid \| paid \| void`. |
| `source` | text NOT NULL DEFAULT `'job_completion'` | CHECK enum: `job_completion \| manual`. Drives "Created from completion" vs "Manually created" display + activity. |
| `subtotal_cents` | bigint NOT NULL DEFAULT 0 | App-maintained snapshot. CHECK >= 0. |
| `total_cents` | bigint NOT NULL DEFAULT 0 | App-maintained snapshot. CHECK >= 0. Phase 11 = `subtotal_cents`. |
| `amount_paid_cents` | bigint NOT NULL DEFAULT 0 | App-maintained snapshot. CHECK >= 0. |
| `balance_cents` | bigint NOT NULL DEFAULT 0 | App-maintained snapshot. May be negative briefly during overpayment guards; final CHECK could be `>= -100` to allow rounding tolerance, but Phase 11B picks the final number. |
| `paid_at` | timestamptz NULL | Set when status flips `unpaid → paid`. |
| `receipt_sent_at` | timestamptz NULL | §13. |
| `created_at` / `updated_at` | timestamptz | Standard. |

**Indexes (suggested):**

- `(business_id)`
- `(business_id, status)`
- `(business_id, created_at desc)`
- `(business_id, paid_at)` — for "paid in the last X" queries
- `(contact_id)` — for the contact hub
- `(job_id)` — for the job detail integration

**RLS:** Pattern B (members SELECT; INSERT/UPDATE/DELETE through
service-role server actions). Matches every Phase 4–10 core
table.

### `invoice_line_items` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. |
| `business_id` | uuid NOT NULL | FK → `businesses(id)` ON DELETE CASCADE. |
| `invoice_id` | uuid NOT NULL | FK → `invoices(id)` ON DELETE CASCADE. |
| `job_line_item_id` | uuid NULL | FK → `job_line_items(id)` ON DELETE SET NULL. |
| `service_id` | uuid NULL | FK → `services(id)` ON DELETE SET NULL. |
| `name` | text NOT NULL | CHECK `length(btrim(name)) > 0`. |
| `description` | text NULL | |
| `quantity` | numeric(10,2) NOT NULL DEFAULT 1 | CHECK > 0. |
| `unit_price_cents` | bigint NOT NULL | CHECK >= 0. |
| `total_cents` | bigint NOT NULL | CHECK >= 0. App-computed. |
| `sort_order` | integer NULL | |
| `source` | text NOT NULL | CHECK enum: `job \| custom`. |
| `created_at` / `updated_at` | timestamptz | Standard. |

**Indexes (suggested):**

- `(business_id)`
- `(business_id, invoice_id)`
- `(invoice_id, sort_order asc nulls last, created_at asc)`
- `(job_line_item_id)` — for traceability

**RLS:** Pattern B.

### `invoice_payments` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()`. |
| `business_id` | uuid NOT NULL | FK → `businesses(id)` ON DELETE CASCADE. |
| `invoice_id` | uuid NOT NULL | FK → `invoices(id)` ON DELETE CASCADE. |
| `amount_cents` | bigint NOT NULL | CHECK > 0. |
| `payment_method` | text NOT NULL | CHECK enum: `cash \| check \| card \| zelle \| other`. |
| `paid_at` | timestamptz NOT NULL | Operator-supplied; defaults to `now()` in the modal. |
| `notes` | text NULL | |
| `created_at` | timestamptz | Standard. |

**Indexes (suggested):**

- `(business_id)`
- `(business_id, invoice_id)`
- `(business_id, paid_at desc)`

**RLS:** Pattern B.

### Money convention

`bigint` cents everywhere. Phase 11 follows the Phase 5+ standard.
Boundary conversion happens in the action layer (dollars input →
cents) the same way Phase 9D's `parseDollarsToCents` does.

### What Phase 11 does NOT add

- No `invoice_refunds` table.
- No `payment_processor_transactions` table.
- No `taxes` / `discounts` / `surcharges` columns.
- No `due_at` / `overdue_at` columns.
- No `sent_at` / `email_sent_at` / `sms_sent_at` columns (only
  `receipt_sent_at`).
- No QuickBooks / Xero / accounting-sync columns.
- No customer-facing public columns (no public token, no shareable
  link).
- No changes to existing tables beyond what's strictly necessary
  (likely nothing — the new tables hang off existing `jobs` /
  `contacts` / `properties` / `services` via FK).

---

## 21. Recommended Implementation Plan

Phase 11 splits into six sub-phases. Each subsequent sub-phase is
gated on the previous one passing review.

### Phase 11A — Docs only ✅ (this file)

- Source-of-truth doc (this file).
- Phase 11 pointer in `CLAUDE.md` and `README.md`.
- **No code, no schema, no business-logic change.**

### Phase 11B — Schema + server foundation (no UI)

- One additive migration: `invoices` + `invoice_line_items` +
  `invoice_payments` tables. RLS Pattern B, indexes, CHECK
  constraints, status + source + payment-method enums.
- Pure validation helpers
  (`validateInvoiceForm`, `validateInvoiceLineItemForm`,
  `validatePaymentForm`, `parseDollarsToCents` reuse).
- Pure total helpers (`computeInvoiceLineItemTotal`,
  `computeInvoiceSubtotal`, `recomputeInvoiceTotals`).
- Pure constants / enums (`INVOICE_STATUSES`, `INVOICE_SOURCES`,
  `PAYMENT_METHODS`, `INVOICE_LINE_ITEM_SOURCES`).
- Server-only data loaders (`listInvoices`, `getInvoice`,
  `getInvoiceLineItems`, `getInvoicePayments`,
  `listInvoicesForJob`, `listInvoicesForContact`).
- Server-only write helpers (`createInvoiceFromJob`,
  `recordInvoicePayment`, `markReceiptSent`).
- Pure unit tests for every helper.
- **No UI yet.**

### Phase 11C — CRM nav + list + read-only detail

- Add **Invoices** to the CRM group; update
  `nav-config.test.ts`.
- `/admin/invoices` list page (status filter; columns from §17).
- `/admin/invoices/[invoiceId]` read-only detail (header,
  contact/property KV, source job link, line items table,
  payments table).
- Job detail page surfaces existing invoices for the job
  (`listInvoicesForJob`) — read-only section.
- **No create / pay / receipt actions yet.**

### Phase 11D — Complete Job → Create Invoice + manual fallback

- `<CompleteJobModal />` on the job detail page (§5).
- `completeJobAction` server action — eligibility guard +
  `updateJobStatus('completed')` + `createInvoiceFromJob`.
- `createInvoiceFromJobAction` for the manual fallback path
  (§4B).
- Soft-fail activity rows: `job.completed_with_invoice`,
  `invoice.created_from_job`.

### Phase 11E — Mark Paid + Mark Receipt Sent

- `<MarkPaidModal />` on `/admin/invoices/[invoiceId]` (§12).
- `recordInvoicePaymentAction` — inserts `invoice_payments` +
  recomputes summary on the invoice row.
- `markReceiptSentAction` — sets `receipt_sent_at = now()`
  (§13).
- Soft-fail activity rows: `invoice.payment_recorded`,
  `invoice.marked_paid` (when status flipped),
  `invoice.receipt_marked_sent`.

### Phase 11F — Polish + QA report

- Optional contact-hub invoices section (§17) if not landed
  earlier.
- Activity row coverage audit.
- `docs/PHASE_11_QA_REPORT.md` — Definition-of-Done checklist,
  Do-Not-Build audit, regression checks, security/schema review.

Adjust the split if implementation review surfaces a safer order.

---

## 22. Do Not Build in Phase 11

Pinned for clarity. Phase 11 must not build any of:

- **Online payment processing.** No Stripe, no Square, no
  payment-link generation, no webhook handlers.
- **Payment processor integration of any kind.**
- **Payment links.**
- **Customer payment portal.** No customer-facing accept-and-pay
  page.
- **Automatic receipt sending.** No email templates, no SMS
  templates, no provider integration.
- **SMS / email receipt delivery.**
- **Message-automation outcomes** from any invoice / payment /
  receipt event. The Phase 3 engine stays out of Phase 11.
- **Customer-facing invoice or receipt pages.**
- **PDF generation.**
- **Taxes.** No tax-rate columns, no tax-on-line-item logic.
- **Discounts.** No line-level, invoice-level, or global discounts.
- **Deposits / partial deposits / hold deposits.**
- **Refunds.** No refund row, no refund UI, no
  `invoice_refunds` table.
- **QuickBooks / Xero / accounting sync** of any kind.
- **Recurring invoices.** No `recurrence` / `rrule` columns.
- **Recurring jobs** (covered by Phase 10 Do-Not-Build).
- **Full scheduling changes** (Phase 10 owns scheduling; Phase 11
  doesn't touch it).
- **Crew / technician assignment.**
- **Route optimization.**
- **Public `/q` changes.**
- **Simulation-driven invoicing / payment generation.** No
  Door Hanger / simulation_activity → invoice path.
- **AI / context-engine expansion.** No model imports.
- **Plugin builder / marketplace.**
- **Data import / export.**
- **Edit / delete / archive flows on `invoices` /
  `invoice_line_items` / `invoice_payments` beyond what Phase
  11D/E explicitly ships** (Complete Job creates an invoice;
  Mark Paid inserts a payment; Mark Receipt Sent updates a
  timestamp).
- **Multi-currency.** USD only.
- **Per-business invoice-number sequences** beyond a simple
  default (Phase 11C/F decides whether to ship auto-numbering).

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 Do-Not-Build
lists remain in force. If a Phase 11 task touches any of the
above, **stop and ask first.**

---

## 23. Success Definition

### Phase 11A is successful when

- Source-of-truth doc exists. ✅ (this file).
- Invoice definition is documented. ✅ (§2).
- Quote / job / invoice / payment distinction is documented. ✅
  (§§2, 6).
- Job completion → invoice flow is documented. ✅ (§§3, 5).
- Invoice snapshot rule is documented. ✅ (§6).
- Invoice statuses are documented. ✅ (§7).
- Invoice line items are documented. ✅ (§8).
- Payment model is documented. ✅ (§§10–11).
- Paid-in-full UI decision is documented. ✅ (§12).
- Receipt tracking decision is documented. ✅ (§13).
- CRM nav placement is documented. ✅ (§14).
- Multiple-invoices-per-job decision is documented. ✅ (§16).
- Likely schema needs are documented. ✅ (§20).
- Implementation plan is documented. ✅ (§21).
- Do-Not-Build list is documented. ✅ (§22).
- `CLAUDE.md` carries a Phase 11 pointer paragraph.
- `README.md` Status section names Phase 11 and links to this
  doc.
- **No app code, no business logic, no database schema changes**
  in Phase 11A.

### Phase 11 close is successful when

- `invoices`, `invoice_line_items`, `invoice_payments` tables
  exist (Phase 11B migration).
- **Invoices** nav exists under CRM (Phase 11C).
- `/admin/invoices` list and `/admin/invoices/[invoiceId]`
  detail exist (Phase 11C).
- Invoice can be created from a completed job (Phase 11D).
- Manual fallback "Create invoice from job" exists (Phase 11D).
- Invoice line items copied from `job_line_items` (Phase 11D).
- Invoice can be marked paid with method + paid_at + notes
  (Phase 11E).
- Payment record persisted in `invoice_payments` (Phase 11E).
- Invoice `amount_paid_cents` + `balance_cents` + `status` +
  `paid_at` update after payment (Phase 11E).
- `receipt_sent_at` can be marked manually (Phase 11E).
- **No online payments / customer notifications / taxes /
  refunds / payment processors built** (Do-Not-Build audit
  clean).
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass.
- `docs/PHASE_11_QA_REPORT.md` exists and signs off the
  Definition-of-Done + Do-Not-Build audit.

---

## 24. Phase 11A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [x] `CLAUDE.md` carries a Phase 11 pointer paragraph.
- [x] `README.md` Status section names Phase 11 and links to this
      doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 11A ends at docs only. Phase 11B is the first step that
touches code, and it only ships after this doc is reviewed and
approved.

---

## Appendix A — Phase 11B schema + server foundation (delivered)

**Status:** migration + pure helpers + server-only loaders +
server-only create / payment / receipt helpers + 54 pure unit
tests. **Migration not applied** — operator runs `supabase db
push` when ready. **No UI shipped in Phase 11B.**
**Added:** 2026-06-03.

### Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260603130000_phase_11_invoices.sql` | Creates `invoices` + `invoice_line_items` + `invoice_payments` tables, indexes, CHECK constraints (status / source / payment-method enums + non-negative money + positive amount), RLS Pattern B (members SELECT). Single transaction, idempotent `drop policy if exists`. |
| `src/core/invoices/constants.ts` | Pinned enums + type guards: `INVOICE_STATUSES`, `INVOICE_SOURCES`, `INVOICE_LINE_ITEM_SOURCES`, `PAYMENT_METHODS`. |
| `src/core/invoices/totals.ts` | Pure: `computeInvoiceLineItemTotal`, `computeInvoiceSubtotal`, `computeInvoiceTotal` (== subtotal in Phase 11), `computeAmountPaid`, `computeInvoiceBalance`, `deriveInvoicePaymentStatus`. Defensive clamping (negative / non-finite → 0). |
| `src/core/invoices/validation.ts` | Pure: `validateInvoiceForm`, `validateInvoiceLineItemForm`, `validatePaymentForm`, `isReceiptMarkableStatus`. Payment validator includes the overpayment guard (rejects `amountCents > currentBalanceCents`). |
| `src/core/invoices/display.ts` | Pure: `invoiceStatusLabel` / `invoiceStatusTone`, `invoiceSourceLabel`, `invoiceLineItemSourceLabel`, `paymentMethodLabel`, `receiptDisplay` / `receiptDisplayLabel`. Re-exports `formatCentsAsDollars` from the jobs display helpers. |
| `src/core/invoices/admin-data.ts` | Server-only loaders: `listInvoices`, `getInvoice`, `getInvoiceLineItems`, `getInvoicePayments`, `listInvoicesForJob`, `listInvoicesForContact`. Joins contact full_name + property address line + job title; clamps limit to [1, 500]; returns `[]` / `null` on any error. |
| `src/core/invoices/admin-create.ts` | Server-only writers: `createInvoiceFromJob`, `recordInvoicePayment`, `markReceiptSent`. Ordered writes + `recomputeInvoiceTotals` after every mutation. Loads source job via `getJob` + `getJobLineItems` (Phase 9B helpers) to copy line items as a snapshot. |
| `src/core/invoices/totals.test.ts` | 19 tests pinning total math (line item, subtotal/total, amount paid, balance clamping, derive-status across `unpaid` / `draft` / `paid` / `void` + edge cases). |
| `src/core/invoices/validation.test.ts` | 25 tests pinning enums + form / line-item / payment / receipt-status validators including the overpayment guard. |
| `src/core/invoices/display.test.ts` | 10 tests pinning all 4 status labels + tones, both source labels, both line-item source labels, all 5 payment-method labels, formatCentsAsDollars round-trip, receipt-display state machine. |
| `schema.md` §22g | Documents the three new tables, indexes, CHECKs, RLS Pattern B, status-flip rule. |

### Migration shape

Three new tables added in one migration. CHECKs:

- `invoices.invoice_number` non-empty when present.
- `invoices.status` in (`draft`, `unpaid`, `paid`, `void`).
- `invoices.source` in (`job_completion`, `manual`).
- `invoices.{subtotal_cents, total_cents, amount_paid_cents,
  balance_cents}` ≥ 0.
- `invoice_line_items.name` non-empty.
- `invoice_line_items.quantity` > 0.
- `invoice_line_items.{unit_price_cents, total_cents}` ≥ 0.
- `invoice_line_items.source` in (`job`, `custom`).
- `invoice_payments.amount_cents` > 0.
- `invoice_payments.payment_method` in (`cash`, `check`, `card`,
  `zelle`, `other`).

Six indexes on `invoices`, four on `invoice_line_items`, three on
`invoice_payments`. RLS Pattern B SELECT policy on each.

### Helper behavior

- **Totals.** `computeInvoiceLineItemTotal` rounds `qty × cents`
  to nearest cent and clamps non-finite / negative. Subtotal +
  total are sums of `total_cents`. `computeAmountPaid` ignores
  non-positive payment rows. `computeInvoiceBalance` clamps at
  zero — overpayment is caught at the validator layer, not by
  letting the balance go negative.
- **deriveInvoicePaymentStatus** decides whether to flip
  `unpaid` / `draft` → `paid` and what `paid_at` to write. `paid`
  is idempotent; `void` is never auto-flipped; negative balance
  is treated defensively as zero (i.e. paid). The helper is the
  testable single source of truth — the writer just applies the
  decision.
- **Validation.** Invoice form requires contact + job. Line item
  validator mirrors the Phase 9B job-line-item validator
  (name + qty > 0 + price ≥ 0 + integer cents + valid source).
  Payment validator covers method enum + positive integer amount
  + paid_at parses + overpayment guard against the supplied
  `currentBalanceCents`. Notes trimmed to 2000 chars.

### Loader behavior

- Service-role + business-scoped + read-only.
- Joins pull contact `full_name`, property `address_line_1, city,
  state`, job `title`, and (for line items) service `name`.
- All loaders return `[]` / `null` on missing input or DB error
  (matches Phase 9/10 posture).
- Payments are sorted `paid_at desc`; line items by `sort_order
  nulls last, created_at asc`.

### Writer behavior

- **`createInvoiceFromJob`** — verifies the job belongs to the
  business via `getJob`, loads `job_line_items`, inserts the
  parent `invoices` row with zeroed summary, bulk-inserts copied
  line items (`source='job'`, `job_line_item_id` preserved), then
  recomputes the summary from the freshly inserted rows.
  Snapshot semantics (§6 of the Phase 11 doc): later edits to
  `job_line_items` do NOT silently rewrite the invoice. Defaults
  `source='job_completion'`, `status='unpaid'`.
- **`recordInvoicePayment`** — loads the invoice summary,
  rejects payments on `void` invoices, runs the validator
  (including the overpayment guard against the live balance),
  inserts an `invoice_payments` row, recomputes the summary, and
  applies the `deriveInvoicePaymentStatus` decision (status flip
  + `paid_at`) only when something actually changed.
- **`markReceiptSent`** — requires status `paid`; sets
  `receipt_sent_at` to the supplied ISO string or `now()`.

### Atomicity

Phase 11B follows the Phase 5B / 7D-1 / 8B / 9B pattern: ordered
writes + recompute. Acceptable trade-off: a partial commit (e.g.
parent row landed but line item insert failed) returns an error
but leaves the parent row behind. Real-usage incidents would
motivate promoting to a Postgres RPC; none are introduced here.

### What Phase 11B deliberately does NOT do

- No UI — no `/admin/invoices` page, no CRM nav entry, no
  server actions wired to forms.
- No `activities` / `events` / `notes` writes (deferred to Phase
  11D/E).
- No message-engine calls; no customer notifications.
- No payment-processor / Stripe / Square integration.
- No refund / void server actions.
- No edit / delete UI for invoices, line items, or payments.
- No Postgres RPC. Ordered writes + recompute matches existing
  patterns.
- No simulation-driven invoicing.
- No public `/q` change.
- No changes to `jobs` / `contacts` / `properties` / `services`
  schema.

### Not applied

The migration is **created but not applied**. Operator runs
`supabase db push` when ready. Re-applying is safe in dev
(`create table` is the standard pattern; `CREATE POLICY` is
preceded by `DROP POLICY IF EXISTS`).

---

## Appendix B — Phase 11C Invoices nav + list + read-only detail + job-detail section (delivered)

**Status:** the read-only Invoices surface is live. CRM nav now
includes **Invoices** as the fourth entry; `/admin/invoices` list
+ `/admin/invoices/[invoiceId]` detail ship; the job detail page
gains a read-only Invoices section. **No mutations, no
Complete Job modal, no Mark Paid, no Mark Receipt Sent.** **No
schema changes.** **Added:** 2026-06-03.

### Files

| File | Purpose |
|---|---|
| `src/components/admin/nav-config.ts` | Added the fourth CRM entry: **Invoices** → `/admin/invoices`, icon `receipt`. |
| `src/components/admin/nav-config.test.ts` | CRM group test now requires `[contacts, quotes, jobs, invoices]`; updated the "Invoices not built" assertion to reflect that Phase 11C ships Invoices (Properties remains not built). |
| `src/components/admin/icons.tsx` | Added a `receipt` icon (outline 24×24 with classic zig-zag bottom and three list lines). |
| `src/app/admin/invoices/page.tsx` | List page. Renders `<AdminShell>` + status-filter pills + invoices list. Each row shows short id (link to detail), status + source badges, contact + property line, source job link, created date, total, amount paid, balance, paid date, receipt status. Empty state mentions Complete Job → Create Invoice ships in 11D. |
| `src/app/admin/invoices/[invoiceId]/page.tsx` | Read-only detail. Sections: header (status + source badges + back link), Summary (Total / Amount Paid / Balance / Receipt + paid_at / receipt_sent_at timestamps), Customer + property (linked back to contact + source job), Line items table (Item / Source / Qty / Unit / Total + Subtotal + Total footer rows), Payments table (Paid at / Method / Amount / Notes), created/updated timestamps. Uses `notFound()` for missing invoices. |
| `src/app/admin/jobs/[jobId]/page.tsx` | Loads `listInvoicesForJob` alongside the existing job + line-items + services parallel fetch. Adds a new **Invoices** SectionCard below Line items showing each invoice's short id (link to detail), status + source badges, receipt status, total, balance. Empty state: "No invoices created for this job yet." |

### Nav behavior

- CRM group now contains `Contacts → Quotes → Jobs → Invoices` in
  that order.
- Nav active-state highlight pins Invoices on `/admin/invoices`
  and `/admin/invoices/<id>` via Phase 7C's
  `resolveActiveNavHref` (longest-prefix wins).

### Invoices list behavior

- Status-filter pills: `All / Draft / Unpaid / Paid / Void`.
  Filter routes via `?status=…`; unknown values fall back to
  "All".
- Each row links the short id (invoice number or first 8 chars of
  uuid) to the detail page. Source job link inline.
- Empty state copy adapts to whether the filter is "All" (mentions
  Phase 11D Complete Job flow) or a specific status (suggests
  trying a different filter).
- **No Create invoice button** — the brief explicitly bars it.
  The read-only contract stays unambiguous; Phase 11D will wire
  the real flow from the Job detail page.

### Invoice detail behavior

- Header surfaces title (`Invoice {shortId}`), status + source
  badges, and a "← All invoices" back link.
- Summary section renders Total / Amount Paid / Balance / Receipt
  in a 4-column KV strip plus an optional row for paid_at /
  receipt_sent_at timestamps.
- Customer + property section links to the Phase 4 contact hub +
  the Phase 9 job detail page.
- Line items table reuses the existing `formatJobQuantity` helper
  for quantity display; subtotal + total foot rows mirror the
  Phase 9C job detail layout.
- Payments table renders `paid_at / method / amount / notes`;
  empty state mentions Mark Paid ships in 11E.
- Missing invoice → `notFound()` (Next.js 404).

### Job detail invoice section

- New **Invoices** `<SectionCard>` below Line items.
- Uses `listInvoicesForJob` (Phase 11B server loader).
- Empty state: "No invoices created for this job yet." (No
  "Coming next" affordance — Phase 11D will add the real
  Complete Job button.)
- Each row links to the invoice detail and shows status badge,
  source badge, receipt status, total, balance.

### Tests / gates

- 1 nav-config test updated to expect the 4-entry CRM ordering;
  1 negative-assertion test updated to confirm Invoices is now
  present.
- Targeted: `nav-config` (25) + invoices `totals` (19) +
  invoices `validation` (25) + invoices `display` (10) →
  **79 / 79**.
- `npx tsc --noEmit` clean.
- `npm run test` → **763 / 763** across 65 files (unchanged from
  Phase 11B close — no new pure helpers introduced).
- `npm run lint` clean.
- `npm run build` green; `/admin/invoices` lands at **226 B**;
  `/admin/invoices/[invoiceId]` at **226 B**; `/admin/jobs/[jobId]`
  unchanged at **4.27 kB** (the new invoice section is server-
  rendered with no extra client JS).

### What Phase 11C deliberately does NOT do

- No Complete Job button / modal (Phase 11D).
- No Manual Create Invoice from Job button (Phase 11D).
- No Mark Paid button / modal (Phase 11E).
- No Mark Receipt Sent button (Phase 11E).
- No invoice editing UI.
- No void / delete actions.
- No payment-processor / Stripe / Square integration.
- No customer notifications, no SMS, no email — the message
  engine is not even reached from any Phase 11 path.
- No simulation-driven invoicing.
- No public `/q` changes.
- No schema changes (Phase 11B migration covers everything Phase
  11C reads).

---

## Appendix C — Phase 11D Complete Job → Create Invoice + Manual fallback (delivered)

**Status:** the job detail page is now interactive. A **Complete
Job and create invoice** confirmation modal ships, plus a
**Create invoice from this job (manual)** fallback button. Both
paths share the Phase 11B `createInvoiceFromJob` helper. Two
soft-fail activity rows per success (`job.completed_with_invoice`,
`invoice.created_from_job`). **No Mark Paid, no Mark Receipt Sent,
no invoice editing, no schema changes.** **Added:** 2026-06-03.

### Files

| File | Purpose |
|---|---|
| `src/core/invoices/job-completion.ts` | Pure: `isJobCompletionEligibleStatus` (true for `draft` / `unscheduled` / `scheduled` / `in_progress`), `deriveCompleteJobButtonState` (returns `"primary"` / `"deemphasized"` / `"hidden"` based on status + existing invoice count — drives the §16 "discourage duplicates" UX). |
| `src/core/invoices/job-completion.test.ts` | 5 pure tests pinning eligibility across all 6 job statuses + the three button states across the relevant inputs. |
| `src/app/admin/jobs/actions.ts` | Added two server actions: `completeJobAndCreateInvoiceAction` and `createInvoiceFromJobAction`. Both re-verify ownership + (for completion) status eligibility before invoking Phase 9B `updateJobStatus` and Phase 11B `createInvoiceFromJob`. Soft-fail `createActivity` rows; revalidates `/admin/jobs`, `/admin/jobs/[jobId]`, `/admin/invoices`, `/admin/invoices/[invoiceId]`, and `/admin/schedule`. |
| `src/app/admin/jobs/[jobId]/complete-job-button.tsx` | Client component. Renders the primary or de-emphasized trigger plus a confirmation modal with a read-only line-items preview (Name / Qty / Unit / Total), the computed job total, and the "this will mark the job completed and create an unpaid invoice" copy. Submit → `completeJobAndCreateInvoiceAction` → `router.push('/admin/invoices/<id>')`. |
| `src/app/admin/jobs/[jobId]/manual-invoice-button.tsx` | Client component. Small de-emphasized button; when the job already has invoices, the click triggers a `window.confirm` listing the count before calling `createInvoiceFromJobAction`. Redirects to the new invoice on success. |
| `src/app/admin/jobs/[jobId]/page.tsx` | Wires both buttons via a new `<InvoiceActions />` sub-component embedded at the top of the existing Invoices SectionCard. Uses `deriveCompleteJobButtonState` to decide which trigger to render and uses an "ineligible-status" branch (e.g. `completed` / `canceled` jobs) that hides the Complete Job button but keeps the manual fallback. |

### Complete Job modal behavior

- Trigger appears at the top of the Invoices section on
  `/admin/jobs/[jobId]`.
- Variant decided by `deriveCompleteJobButtonState`:
  - **`primary`**: status eligible + no existing invoices →
    accent-colored "Complete job and create invoice" CTA.
  - **`deemphasized`**: status eligible + ≥ 1 existing invoice →
    outlined "Complete job and create another invoice" button +
    inline notice listing the existing invoice count
    ("Review existing invoices before adding another").
  - **`hidden`**: status `completed` / `canceled` → button not
    rendered, replaced with a "Complete Job is not available on
    a {status} job" notice plus the manual fallback.
- Modal opens with:
  - Job title + status pill + contact + property line.
  - Read-only line-items table (Name + description / Qty / Unit /
    Total) with a Total foot row (`estimated_total_cents`).
  - Empty-state row when the job has no line items
    ("The invoice will be created with zero total").
  - Copy: *"This will mark the job completed and create an
    unpaid invoice. Payment is recorded separately. No customer
    notification is sent."*
- Submit → `completeJobAndCreateInvoiceAction({ jobId })` →
  redirect to `/admin/invoices/[invoiceId]` on success. Error
  messages render inline. Cancel + backdrop click close the modal
  unless a submit is in flight.

### Complete Job → Invoice behavior

- Server action re-verifies ownership via `getJob` and status
  eligibility via `isJobCompletionEligibleStatus`.
- Calls Phase 9B `updateJobStatus('completed')`.
- Calls Phase 11B `createInvoiceFromJob({ source: 'job_completion' })`
  which:
  - Verifies the job's `business_id` again.
  - Loads `job_line_items` and copies them into
    `invoice_line_items` (`source='job'`, `job_line_item_id`
    preserved, service_id preserved).
  - Inserts the parent `invoices` row with
    `status='unpaid'`, `source='job_completion'`,
    `amount_paid_cents=0`.
  - Recomputes `subtotal_cents` / `total_cents` /
    `balance_cents` from the actual inserted rows.
- Atomicity follows the Phase 9B / 10D / 11B posture: ordered
  writes + recompute. If `createInvoiceFromJob` fails after the
  status flip, the job is left in `completed` and the operator
  can use the manual fallback. No Postgres RPC introduced.
- Soft-fail activities written **after** the writes succeed:
  - `job.completed_with_invoice` (related to the job)
  - `invoice.created_from_job` with `source='job_completion'`
    (related to the invoice)
- Revalidates the five paths listed above so the jobs list,
  detail, schedule, invoices list, and the new invoice detail
  page are all fresh on the next render.

### Manual Create Invoice fallback behavior

- Available alongside Complete Job on every variant
  (`primary` / `deemphasized` / `hidden`).
- Calls `createInvoiceFromJobAction({ jobId })` which calls
  `createInvoiceFromJob({ source: 'manual' })`.
- **Does not change job status.**
- When the job already has invoices, a `window.confirm` listing
  the count appears before the action fires (soft block — the
  operator can still proceed; per §16 there is no hard limit).
- Activity row: `invoice.created_from_job` with `source='manual'`.
- Redirects to `/admin/invoices/[invoiceId]` on success.

### Status-rule recap

| Job status | Complete Job | Manual fallback |
|---|---|---|
| `draft` | ✅ primary / de-emphasized | ✅ allowed |
| `unscheduled` | ✅ primary / de-emphasized | ✅ allowed |
| `scheduled` | ✅ primary / de-emphasized | ✅ allowed |
| `in_progress` | ✅ primary / de-emphasized | ✅ allowed |
| `completed` | ❌ hidden | ✅ allowed (re-invoice scenarios) |
| `canceled` | ❌ hidden | ✅ allowed (partial-work scenarios) |

The pure `deriveCompleteJobButtonState` helper centralises the UI
rule so the eligibility decision stays testable. The server
actions re-enforce the same rules — UI gating is convenience, not
security.

### Activity behavior

Two new activity types ship — all via the existing Phase 1
`createActivity` helper, all soft-fail (non-blocking on the
underlying mutation):

| `activity_type` | Source | Details payload |
|---|---|---|
| `job.completed_with_invoice` | `completeJobAndCreateInvoiceAction` | `invoice_id`, `line_item_count`, `total_cents`. |
| `invoice.created_from_job` | Both actions | `job_id`, `line_item_count`, `total_cents`, `source: 'job_completion' \| 'manual'`. |

- No `sendSms` / `sendEmail` / `notification_logs` /
  `sendInternalSmsNotification` calls.
- No `message-automation` triggers.
- Phase 6D GHL guardrail is not reached from any Phase 11D path.

### Tests / gates

- 5 new `job-completion` pure tests.
- Targeted: invoices `totals` (19) + `validation` (25) + `display`
  (10) + `job-completion` (5) + `nav-config` (25) = **84/84**.
- `npx tsc --noEmit` clean.
- `npm run test` → **768/768** across 66 files (was 763/763 ×
  65 at Phase 11C close — Phase 11D adds 5 tests + 1 file).
- `npm run lint` clean.
- `npm run build` green; `/admin/jobs/[jobId]` grew **4.27 kB →
  5.32 kB** (added Complete Job modal + manual button client
  bundles). `/admin/invoices` and `/admin/invoices/[invoiceId]`
  unchanged at 226 B each.

### What Phase 11D deliberately does NOT do

- **No Mark Paid UI / action.** Phase 11E ships
  `recordInvoicePaymentAction` + the modal.
- **No Mark Receipt Sent UI / action.** Phase 11E.
- **No invoice editing.** No line item add / remove / reorder /
  edit on invoices.
- **No invoice voiding** UI. The `void` status exists in the
  enum (Phase 11B); no UI surfaces it yet.
- **No online payments / Stripe / Square / payment links.**
- **No customer notifications.** No SMS, no email, no GHL.
- **No message-automation outcomes.**
- **No taxes / discounts / refunds.**
- **No simulation-driven invoicing.**
- **No public `/q` changes.**
- **No new database table or column.** Phase 11B schema covers
  everything Phase 11D writes.
- **No new low-level DB helpers.** Both actions compose existing
  Phase 9B `updateJobStatus` and Phase 11B `createInvoiceFromJob`.
- **No hard block on duplicate invoices.** Per §16 — UI
  discourages, operator decides.

### Assumptions

- The Phase 11B `createInvoiceFromJob` snapshot rule already
  matches the brief (copies `job_line_items` →
  `invoice_line_items` with `job_line_item_id` preserved + zero
  `amount_paid_cents` + `balance_cents = total_cents`); no
  changes were required to the Phase 11B helpers in this phase.
- The Complete Job + Manual buttons are both rendered server-side
  and lift to client components only inside the small modal /
  button shells — `/admin/invoices/*` pages stayed server-only
  (226 B each), no UI changes there.
- `router.push` on success rather than `router.refresh` →
  navigates directly to the new invoice detail. The Phase 9D
  pattern (`router.refresh()`) is used by mutations that keep
  the operator on the same page; creation flows that produce a
  new entity navigate to it.

---

## Appendix D — Phase 11E Mark Paid + Mark Receipt Sent (delivered)

**Status:** the money loop closes. Invoice detail now ships a
**Mark Paid** modal that records a payment row + recomputes
summary fields + flips status to `paid` when balance hits zero,
plus a **Mark Receipt Sent** button that stores a manual
timestamp. Both compose the Phase 11B server helpers. Three
soft-fail activity types ship. **No online payments, no receipt
sending, no SMS/email, no customer notifications, no schema
changes.** **Added:** 2026-06-03.

### Files

| File | Purpose |
|---|---|
| `src/core/invoices/eligibility.ts` | Pure UI helpers: `isMarkPaidEligible({ status, balanceCents })` (true for `draft` / `unpaid` AND `balance > 0`), `isMarkReceiptSentEligible({ status, receiptSentAtIso })` (true only when `status === 'paid'` AND `receipt_sent_at` is null). |
| `src/core/invoices/eligibility.test.ts` | 9 pure tests pinning both helpers across all status / balance combinations. |
| `src/app/admin/invoices/actions.ts` | Two server actions: `recordInvoicePaymentAction` and `markReceiptSentAction`. Both re-verify business ownership via `getInvoice`, delegate to the Phase 11B `recordInvoicePayment` / `markReceiptSent` helpers, write soft-fail `createActivity` rows, and revalidate `/admin/invoices`, `/admin/invoices/[invoiceId]`, and `/admin/jobs/[jobId]` (when the invoice has a `job_id`). |
| `src/app/admin/invoices/[invoiceId]/mark-paid-button.tsx` | Client component. Renders an accent-colored **Mark paid** button + modal with `Amount (USD)` dollar input (defaults to formatted balance), `Payment method` select (cash / check / card / zelle / other, default cash), `Paid at` datetime-local (default now), and `Notes` textarea. Submit → `recordInvoicePaymentAction` → `router.refresh()` on success. |
| `src/app/admin/invoices/[invoiceId]/mark-receipt-sent-button.tsx` | Client component. Outlined button + `window.confirm` ("Mark receipt as sent? This only records that you sent it manually. It will not send an email or text.") → `markReceiptSentAction` → `router.refresh()`. |
| `src/app/admin/invoices/[invoiceId]/page.tsx` | Wires both buttons into the Summary section below the KV strip + paid_at/receipt_sent_at row. Uses `isMarkPaidEligible` / `isMarkReceiptSentEligible` to decide which (if any) to render. Updates the payments empty-state copy to point at the new Mark Paid affordance. |

### Mark Paid modal behavior

- Trigger renders only when `isMarkPaidEligible` returns true
  (`draft` / `unpaid` AND `balance_cents > 0`).
- Modal pre-fills:
  - `amount` → `balance_cents` formatted as `"NN.NN"` dollars.
  - `payment_method` → `cash`.
  - `paid_at` → operator's local now (`datetime-local` format).
  - `notes` → blank.
- Submit calls `recordInvoicePaymentAction`. The action:
  - Parses `amountDollars` via the existing
    `parseDollarsToCents` helper (`NEGATIVE` / `NOT_A_NUMBER` /
    null → field error on `amountDollars`).
  - Loads the invoice via `getInvoice` to read the live
    `balance_cents` and the `job_id` for revalidation.
  - Delegates to the Phase 11B `recordInvoicePayment` helper,
    which:
    - Rejects on `void` (`INVALID_STATUS`).
    - Runs the Phase 11B `validatePaymentForm` overpayment guard
      against the live balance.
    - Inserts an `invoice_payments` row.
    - Recomputes `amount_paid_cents` + `balance_cents`.
    - Applies the pure `deriveInvoicePaymentStatus` decision:
      `unpaid` / `draft` → `paid` with `paid_at` set to the
      payment's `paid_at` when the balance hits zero; `paid`
      stays paid; `void` never auto-flips.
- On success the modal closes and `router.refresh()` re-runs
  the Server Component loader so the summary, payments table,
  status badge, and (when status flipped) Mark Receipt Sent
  affordance all update.
- Field-level errors surface inline; server-error message
  surfaces below the form.
- Backdrop click + Cancel close the modal unless a submit is in
  flight.

### Payment recording behavior

- `recordInvoicePaymentAction` returns
  `{ paymentId, amountPaidCents, balanceCents, status, paidAtIso,
  statusFlippedToPaid }`.
- `statusFlippedToPaid` is computed server-side by comparing the
  pre-payment status against the post-payment status — drives
  the dual-activity write below.
- Overpayment guarded twice:
  - Validator (Phase 11B): rejects `amountCents > currentBalance`.
  - DB CHECK (Phase 11B migration): `invoices.balance_cents >= 0`
    as the safety net.
- Money path: `amountDollars` (string) → `parseDollarsToCents`
  (cents) → `validatePaymentForm` (cents) → DB insert (cents) →
  summary recompute (cents).
- After a successful payment the schedule + job detail pages
  also revalidate so any cross-page state is fresh.

### Mark Receipt Sent behavior

- Trigger renders only when `isMarkReceiptSentEligible` returns
  true (status `paid` AND `receipt_sent_at` is null).
- `window.confirm` prompt before the action fires.
- Action calls Phase 11B `markReceiptSent` which:
  - Re-verifies business ownership.
  - Rejects unless status `paid` (`INVALID_STATUS`).
  - Sets `receipt_sent_at` to operator-supplied ISO or `now()`.
- On success `router.refresh()` so the receipt-sent timestamp
  + Receipt label both update and the button disappears.
- Per §13: **no SMS, no email, no message-automation call.**
  Operator separately delivers the receipt out-of-band.

### Invoice detail UI states (recap)

| Invoice state | Mark Paid | Mark Receipt Sent |
|---|---|---|
| `draft` + balance > 0 | ✅ | ❌ |
| `unpaid` + balance > 0 | ✅ | ❌ |
| `paid` + receipt_sent_at null | ❌ (balance is 0) | ✅ |
| `paid` + receipt_sent_at set | ❌ | ❌ (shows timestamp) |
| `void` | ❌ | ❌ |

### Activity behavior

Three new activity types ship — all via the existing Phase 1
`createActivity` helper, all soft-fail (non-blocking on the
underlying mutation):

| `activity_type` | Source | Details payload |
|---|---|---|
| `invoice.payment_recorded` | `recordInvoicePaymentAction` (always on success) | `amount_cents`, `payment_method`, `balance_cents`, `status`. |
| `invoice.marked_paid` | `recordInvoicePaymentAction` (only when status flipped) | `paid_at`, `total_cents`. |
| `invoice.receipt_marked_sent` | `markReceiptSentAction` | `receipt_sent_at`, `job_id`. |

- No `sendSms` / `sendEmail` / `notification_logs` /
  `sendInternalSmsNotification` calls.
- No `message-automation` triggers.
- Phase 6D GHL guardrail is not reached from any Phase 11 path.

### Tests / gates

- 9 new `eligibility` pure tests.
- Targeted: invoices `totals` (19) + `validation` (25) +
  `display` (10) + `job-completion` (5) + `eligibility` (9) =
  **68/68**.
- `npx tsc --noEmit` clean.
- `npm run test` → **777/777** across 67 files (was 768/768 ×
  66 at Phase 11D close — Phase 11E adds 9 tests + 1 file).
- `npm run lint` clean.
- `npm run build` green; `/admin/invoices/[invoiceId]` grew
  **226 B → 2.64 kB** (Mark Paid modal + Mark Receipt Sent
  client bundles). `/admin/invoices` unchanged at **223 B**.

### What Phase 11E deliberately does NOT do

- **No online payments / payment processor integration / payment
  links.**
- **No automatic receipt sending.** No PDF generation, no email
  template, no SMS template.
- **No customer-facing invoice or receipt page.**
- **No customer notifications** on any payment / receipt event.
- **No message-automation outcomes.**
- **No taxes / discounts / refunds.**
- **No invoice editing.** Line items remain read-only after
  creation.
- **No invoice voiding UI.** The `void` status exists in the
  Phase 11B enum; no action surfaces it yet.
- **No partial-payment split UX.** The operator can record
  multiple payments by submitting the modal multiple times; the
  schema sums correctly.
- **No overpayment-credit row.** Overpayments are rejected at the
  validator + DB-CHECK layers.
- **No simulation-driven payments.**
- **No public `/q` changes.**
- **No new database table or column.** Phase 11B schema covers
  everything Phase 11E writes.
- **No new low-level DB helpers.** Both actions compose the
  existing Phase 11B `recordInvoicePayment` + `markReceiptSent`.

### Assumptions

- `parseDollarsToCents` (originally added in
  `src/core/door-hanger/calculations.ts` for Phase 5 and reused
  in Phase 9D's manual job-create + Phase 10D's overlap check)
  remains the single dollars-input → cents-cents boundary for
  the admin. Phase 11E reuses it rather than duplicating the
  parser.
- The Phase 11B helpers handle the entire status-flip + paid_at
  + summary-recompute logic; the Phase 11E actions only:
  (1) re-verify ownership, (2) compute `statusFlippedToPaid` for
  the dual activity write, and (3) revalidate the affected
  paths. No double accounting.
- `router.refresh` (not `router.push`) on success — the operator
  stays on the invoice detail so they can immediately see the
  new payment row and the updated balance/status.
- Manual confirm for Mark Receipt Sent uses `window.confirm` —
  acceptable per the Phase 10D / Phase 11D precedent for
  irreversible-feeling actions. Mark Paid uses a full modal
  because it captures multiple fields.
