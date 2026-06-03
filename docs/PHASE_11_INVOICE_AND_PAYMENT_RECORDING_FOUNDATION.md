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
