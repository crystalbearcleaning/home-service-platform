# Phase 11 QA Report

**Date:** 2026-06-03
**Step:** Phase 11F — Phase 11 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_11_INVOICE_AND_PAYMENT_RECORDING_FOUNDATION.md`
(Appendix A — Phase 11B schema + server foundation,
Appendix B — Phase 11C nav + list + read-only detail + job-detail
section, Appendix C — Phase 11D Complete Job + manual fallback,
Appendix D — Phase 11E Mark Paid + Mark Receipt Sent).

This pass closes out Phase 11 (Invoice + Payment Recording
Foundation). Phase 11 ships the **billing snapshot layer**: three
new tables (`invoices`, `invoice_line_items`, `invoice_payments`),
the Jobber-style **Complete Job → Create Invoice → Record Payment
→ Mark Receipt Sent** workflow, and a manual fallback for
operator edge cases. **No online payment processing, no Stripe /
Square / payment-link integration, no customer payment portal, no
automatic receipt sending, no SMS / email, no taxes / discounts /
deposits / refunds, no QuickBooks / Xero / accounting sync, no
recurring invoices, no public `/q` changes.** Mark Receipt Sent
records a manual timestamp only.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **777 / 777** tests across 67 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/invoices` at 223 B, `/admin/invoices/[invoiceId]` at 2.64 kB, `/admin/jobs/[jobId]` at 5.32 kB, `/q` unchanged at 6.55 kB. |

DB-side verification (via `supabase db query --linked`):

| Check | Result |
|---|---|
| `invoices` table | ✅ exists, RLS enabled |
| `invoice_line_items` table | ✅ exists, RLS enabled |
| `invoice_payments` table | ✅ exists, RLS enabled |
| `invoices_members_select` policy | ✅ SELECT, `authenticated` |
| `invoice_line_items_members_select` policy | ✅ SELECT, `authenticated` |
| `invoice_payments_members_select` policy | ✅ SELECT, `authenticated` |
| `invoices` CHECK constraints | ✅ 7 present (`status`, `source`, `subtotal_nonneg`, `total_nonneg`, `amount_paid_nonneg`, `balance_nonneg`, `invoice_number_nonempty`) |
| `invoice_line_items` CHECK constraints | ✅ 5 present (`name_nonempty`, `quantity_positive`, `unit_price_nonneg`, `total_nonneg`, `source_check`) |
| `invoice_payments` CHECK constraints | ✅ 2 present (`amount_positive`, `method_check`) |
| `invoices` indexes | ✅ 7 (6 + pkey) |
| `invoice_line_items` indexes | ✅ 5 (4 + pkey) |
| `invoice_payments` indexes | ✅ 4 (3 + pkey) |
| No public/customer-facing columns added | ✅ confirmed; no `public_token` / `share_token` / `customer_view_*` columns on any of the three tables |

---

## 2. What shipped in Phase 11 (recap)

- **Phase 11A** — source-of-truth doc + Phase 11 pointer
  paragraphs in `CLAUDE.md` / `README.md`. **Docs only.**
- **Phase 11B** — additive migration
  `20260603130000_phase_11_invoices.sql`: `invoices`,
  `invoice_line_items`, `invoice_payments` tables with all
  CHECKs + RLS Pattern B. Pure helpers
  (`constants` / `totals` / `validation` / `display`),
  server-only data loaders, server-only write helpers
  (`createInvoiceFromJob`, `recordInvoicePayment`,
  `markReceiptSent`). 54 pure unit tests.
- **Phase 11C** — Invoices nav under CRM (fourth entry, with
  new `receipt` icon), `/admin/invoices` list with status-pill
  filter, `/admin/invoices/[invoiceId]` read-only detail
  (summary + customer/property + line items table + payments
  table), `/admin/jobs/[jobId]` invoices section read-only.
- **Phase 11D** — Complete Job → Create Invoice confirmation
  modal + manual Create Invoice fallback on the job detail page;
  `completeJobAndCreateInvoiceAction` +
  `createInvoiceFromJobAction`; pure
  `isJobCompletionEligibleStatus` /
  `deriveCompleteJobButtonState`; two new soft-fail activity
  types (`job.completed_with_invoice`,
  `invoice.created_from_job`). 5 pure tests.
- **Phase 11E** — Mark Paid modal + Mark Receipt Sent button on
  the invoice detail; `recordInvoicePaymentAction` +
  `markReceiptSentAction`; pure `isMarkPaidEligible` /
  `isMarkReceiptSentEligible`; three new soft-fail activity
  types (`invoice.payment_recorded`, `invoice.marked_paid`,
  `invoice.receipt_marked_sent`). 9 pure tests.
- **Phase 11F** (this step) — closing QA pass + this report. No
  app code, no schema, no business-logic changes in this step.

---

## 3. Phase 11 Definition of Done — checklist

Drawn from §23 of the Phase 11 doc + each appendix.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | Phase 11 doc + Appendices A / B / C / D. |
| `invoices`, `invoice_line_items`, `invoice_payments` tables exist | ✅ | DB-verified §1. |
| Invoices nav under CRM | ✅ | Fourth CRM entry, pinned by `nav-config.test.ts`. |
| `/admin/invoices` list + `/admin/invoices/[invoiceId]` detail | ✅ | Phase 11C. |
| Invoice can be created from a completed job | ✅ | Phase 11D `completeJobAndCreateInvoiceAction`. |
| Manual fallback "Create invoice from job" exists | ✅ | Phase 11D `createInvoiceFromJobAction`. |
| Invoice line items copied from `job_line_items` | ✅ | Phase 11B `createInvoiceFromJob` snapshot logic. |
| Invoice can be marked paid with method + paid_at + notes | ✅ | Phase 11E Mark Paid modal. |
| Payment record persisted in `invoice_payments` | ✅ | Phase 11B `recordInvoicePayment` insert. |
| Invoice `amount_paid_cents` + `balance_cents` + `status` + `paid_at` update after payment | ✅ | `recomputeInvoiceTotals` + `deriveInvoicePaymentStatus`. |
| `receipt_sent_at` can be marked manually | ✅ | Phase 11E `markReceiptSentAction`. |
| No online payments / customer notifications / taxes / refunds / payment processors built | ✅ | Do-Not-Build audit §11 below. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_11_QA_REPORT.md` exists | ✅ | This file. |
| `CLAUDE.md` Phase 11 pointer | ✅ | Added in Phase 11A. |
| `README.md` Phase 11 status block | ✅ | Added in Phase 11A. |

Phase 1+2+3+4+5+6+7+8+9+10 Definition-of-Done items remain in
force.

---

## 4. Schema / RLS / security verification

| Check | Result |
|---|---|
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| Service-role client confined to `import "server-only"` modules | ✅ — `admin-data.ts`, `admin-create.ts` both server-only; actions are `"use server"` and call only the server-only helpers |
| RLS posture on all three new tables | ✅ Pattern B (members SELECT; writes via service-role server actions) |
| Phase 11 schema migrations | ✅ single migration `20260603130000_phase_11_invoices.sql` |
| No new secrets surface | ✅ none introduced |
| New external API calls from Phase 11 code | ✅ none — invoices is pure DB reads + writes |
| Cross-business leakage check | ✅ every server helper re-verifies the invoice's `business_id` via `getInvoice` or `loadOwnedInvoiceSummary`; loaders filter by `business_id`; FK CASCADE on `business_id` enforces tenant cleanup |
| No public/customer-facing columns on any new table | ✅ confirmed; no `public_token` / `share_token` columns; no customer-portal columns |

### CHECK / index summary (from §1 DB verification)

- `invoices`: 7 CHECKs + 6 secondary indexes + pkey.
- `invoice_line_items`: 5 CHECKs + 4 secondary indexes + pkey.
- `invoice_payments`: 2 CHECKs + 3 secondary indexes + pkey.

---

## 5. Helper / validation / display verification

| Check | Result |
|---|---|
| `INVOICE_STATUSES`, `INVOICE_SOURCES`, `INVOICE_LINE_ITEM_SOURCES`, `PAYMENT_METHODS` pinned in code + DB | ✅ — TS constants mirror the migration CHECK enums; `validation.test.ts` pins each taxonomy |
| `computeInvoiceLineItemTotal` rounds `qty × cents`, clamps negatives | ✅ — 4 cases |
| `computeInvoiceSubtotal` / `computeInvoiceTotal` sum + ignore invalid rows | ✅ — 4 cases (Phase 11 has `total === subtotal` pinned explicitly) |
| `computeAmountPaid` ignores zero / negative / non-finite payments | ✅ — 3 cases |
| `computeInvoiceBalance` clamps at zero (overpayment caught upstream) | ✅ — 3 cases including `paid >= total` and negative inputs |
| `deriveInvoicePaymentStatus` flips `unpaid` / `draft` → `paid` when balance hits zero | ✅ — pinned across `unpaid`, `draft`, `paid` (idempotent), `void` (never auto-flips), and negative-balance defensive cases (6 total) |
| `validateInvoiceForm` requires contact + job; honors defaults; rejects unknown status / source; trims invoice_number; rejects too-long | ✅ — 5 cases |
| `validateInvoiceLineItemForm` rejects empty name / non-positive qty / negative price / non-integer cents / unknown source / negative sort order | ✅ — 7 cases |
| `validatePaymentForm` rejects non-positive amount / non-integer cents / unknown method / missing or invalid `paid_at` | ✅ — 6 cases |
| Overpayment guard — `validatePaymentForm` rejects `amount > current balance` | ✅ — dedicated case; also allows missing `currentBalanceCents` (no check) |
| `isReceiptMarkableStatus` is true only for `paid` | ✅ — 1 case spanning 5 statuses |
| Display: invoice status labels + tones (`draft`→neutral, `unpaid`→warning, `paid`→success, `void`→danger) | ✅ — pinned across all 4 statuses + fallback |
| Display: source labels (`From completed job` / `Manual`) | ✅ |
| Display: line-item source labels (`From job` / `Custom`) | ✅ |
| Display: all 5 payment-method labels | ✅ |
| Receipt display state machine (`not_paid` / `not_sent` / `sent`) | ✅ — 3 cases |
| `isJobCompletionEligibleStatus` accepts `draft`/`unscheduled`/`scheduled`/`in_progress`; rejects `completed`/`canceled`/unknown | ✅ — 2 cases spanning all 6 statuses |
| `deriveCompleteJobButtonState` returns `primary` / `deemphasized` / `hidden` correctly | ✅ — 3 cases |
| `isMarkPaidEligible` true only when status `draft` / `unpaid` AND balance > 0 | ✅ — 6 cases including non-finite balance |
| `isMarkReceiptSentEligible` true only when status `paid` AND receipt null | ✅ — 3 cases spanning paid + already-sent + non-paid statuses |

Total pure invoice tests: **68** across 5 files
(19 totals + 25 validation + 10 display + 5 job-completion +
9 eligibility).

---

## 6. Server loader / writer verification

| Check | Result |
|---|---|
| `listInvoices` business-scoped + status-filtered | ✅ — `.eq("business_id", ...)`; optional `.eq("status", ...)`; joins contact + property + job |
| `getInvoice` business-scoped + null-safe | ✅ — `.eq("business_id", ...)`, `.eq("id", invoiceId)`, returns `null` on missing |
| `getInvoiceLineItems` business-scoped + ordered (`sort_order nulls last, created_at asc`) | ✅ |
| `getInvoicePayments` business-scoped + sorted (`paid_at desc`) | ✅ |
| `listInvoicesForJob` business-scoped + sorted by `created_at desc` | ✅ |
| `listInvoicesForContact` business-scoped + sorted by `created_at desc` | ✅ |
| `createInvoiceFromJob` verifies job ownership via `getJob` | ✅ |
| `createInvoiceFromJob` preserves `job_id`, `contact_id`, `property_id` (copied from job) | ✅ |
| `createInvoiceFromJob` copies `job_line_items` → `invoice_line_items` with `job_line_item_id` + `service_id` preserved; sets `source='job'` | ✅ |
| `createInvoiceFromJob` defaults `status='unpaid'`, `source='job_completion'`, sets `amount_paid_cents=0`; recomputes summary | ✅ |
| `recordInvoicePayment` re-verifies ownership; rejects `void` invoices | ✅ |
| `recordInvoicePayment` runs the overpayment guard via the validator | ✅ |
| `recordInvoicePayment` inserts `invoice_payments` row | ✅ |
| `recordInvoicePayment` recomputes `subtotal_cents` / `total_cents` / `amount_paid_cents` / `balance_cents` via `recomputeInvoiceTotals` | ✅ |
| `recordInvoicePayment` applies `deriveInvoicePaymentStatus` decision (flip `unpaid` / `draft` → `paid` + set `paid_at` to the payment's `paid_at`) only when something changed | ✅ |
| `markReceiptSent` requires `status='paid'`; rejects with `INVALID_STATUS` otherwise | ✅ |
| `markReceiptSent` sets `receipt_sent_at` to provided ISO or `now()` | ✅ |
| Loaders return `[]` / `null` on error (no throw) | ✅ — matches Phase 9 / 10 posture |
| Writers compose existing Phase 9B / Phase 11B helpers; no new low-level DB helpers introduced in 11C/D/E | ✅ |

---

## 7. Invoices list / detail verification

### 7.1 `/admin/invoices`

| Step | Status |
|---|---|
| CRM nav shows Invoices as the fourth entry | ✅ — pinned by `nav-config.test.ts` CRM-order test |
| Page loads when active business is set | ✅ |
| Status pill filter `All / Draft / Unpaid / Paid / Void` routes via `?status=…` | ✅ |
| Unknown status query → falls back to `All` | ✅ |
| Empty state copy (mentions Phase 11D Complete Job flow) | ✅ |
| Row shows status badge, source badge, contact + property line, source-job link, created date, total, amount paid, balance, paid_at, receipt state | ✅ |
| Short id falls back to first 8 chars of uuid when `invoice_number` is null | ✅ |
| No Create invoice button | ✅ — read-only contract per the brief |

### 7.2 `/admin/invoices/[invoiceId]`

| Step | Status |
|---|---|
| Page loads for a valid invoice | ✅ |
| Missing invoice → `notFound()` (Next.js 404) | ✅ |
| Header shows status badge + source badge + back link | ✅ |
| Summary KV strip: Total / Amount Paid / Balance / Receipt | ✅ |
| Optional `paid_at` + `receipt_sent_at` timestamp row | ✅ |
| Mark Paid button renders only when `isMarkPaidEligible` is true | ✅ |
| Mark Receipt Sent button renders only when `isMarkReceiptSentEligible` is true | ✅ |
| Customer + property + source-job section linked to Phase 4 hub + Phase 9 job detail | ✅ |
| Line items table: Item (name + description + service name) / Source / Qty / Unit / Total + Subtotal + Total foot rows | ✅ |
| Payments table: Paid at / Method / Amount / Notes (sorted `paid_at desc`) | ✅ |
| Empty states for line items + payments | ✅ |
| Created / updated timestamps surfaced at the bottom | ✅ |

---

## 8. Job detail invoice integration verification

| Step | Status |
|---|---|
| `/admin/jobs/[jobId]` shows `Invoices ({count})` SectionCard | ✅ — Phase 11C |
| Existing invoices listed with status + source badges + receipt status + total + balance + link to detail | ✅ |
| `InvoiceActions` slot shows Complete Job button + manual fallback for eligible statuses | ✅ — Phase 11D |
| Variant decided by `deriveCompleteJobButtonState`: `primary` (no invoices), `deemphasized` (≥ 1 invoice), `hidden` (`completed` / `canceled`) | ✅ |
| Existing invoices surfaced **before** any duplicate-create CTA via the Phase 11C list above the actions | ✅ |
| `hidden` variant ⇒ manual fallback still available with "Complete Job is not available on a {status} job" notice | ✅ |
| Completed / canceled jobs match Phase 11D decisions (Complete Job hidden, manual fallback allowed) | ✅ |
| No Mark Paid / Mark Receipt Sent on job detail (correctly lives on invoice detail) | ✅ |

---

## 9. Complete Job → Invoice verification

| Step | Status |
|---|---|
| Trigger appears at the top of the Invoices section on `/admin/jobs/[jobId]` | ✅ |
| Modal previews job title, status pill, contact, property, read-only line items table with Total foot row | ✅ |
| Empty-state row when the job has no line items ("The invoice will be created with zero total") | ✅ |
| Copy mentions unpaid invoice + no customer notification | ✅ |
| Confirm calls `completeJobAndCreateInvoiceAction({ jobId })` | ✅ |
| Action re-verifies ownership + status eligibility server-side | ✅ |
| Calls Phase 9B `updateJobStatus('completed')` | ✅ |
| Calls Phase 11B `createInvoiceFromJob({ source: 'job_completion' })` | ✅ |
| Invoice created `unpaid`, line items copied with `source='job'`, `job_line_item_id` preserved | ✅ |
| `amount_paid_cents=0`, `balance_cents = total_cents` | ✅ |
| Redirect to `/admin/invoices/[invoiceId]` on success | ✅ |
| Soft-fail `job.completed_with_invoice` activity row written | ✅ — non-blocking |
| Soft-fail `invoice.created_from_job` activity row written (with `source='job_completion'`) | ✅ — non-blocking |
| Activity failure does not roll back mutation | ✅ — `void createActivity({...})` posture |
| Revalidates `/admin/jobs`, `/admin/jobs/[jobId]`, `/admin/invoices`, `/admin/invoices/[invoiceId]`, `/admin/schedule` | ✅ |
| No message-automation calls, no SMS, no email | ✅ — grep audit §10 below |

---

## 10. Manual Create Invoice fallback verification

| Step | Status |
|---|---|
| Manual button surfaces on every variant (primary / deemphasized / hidden) | ✅ |
| Confirm prompt appears when existing invoices > 0 (soft block; operator can proceed per §16) | ✅ |
| Action calls `createInvoiceFromJob({ source: 'manual' })` | ✅ |
| Job status NOT changed by the manual action | ✅ |
| Same snapshot semantics: copies `job_line_items` → `invoice_line_items` | ✅ |
| Redirect to `/admin/invoices/[invoiceId]` on success | ✅ |
| Soft-fail `invoice.created_from_job` activity row written (with `source='manual'`) | ✅ |
| No message-automation calls | ✅ |

---

## 11. Mark Paid verification

| Step | Status |
|---|---|
| Mark Paid button renders only when eligible (`draft` / `unpaid` AND `balance > 0`) | ✅ |
| Modal pre-fills: amount = formatted balance, method = cash, paid_at = local now, notes blank | ✅ |
| Payment method enum has all 5 options (cash / check / card / zelle / other) | ✅ |
| Dollars → cents conversion via `parseDollarsToCents` at the action boundary | ✅ |
| Action loads invoice via `getInvoice` to read live balance + `job_id` for revalidation | ✅ |
| Phase 11B `recordInvoicePayment` rejects on `void` (`INVALID_STATUS`) | ✅ |
| Phase 11B validator runs overpayment guard against live balance | ✅ |
| `invoice_payments` row inserted | ✅ |
| `amount_paid_cents` + `balance_cents` recomputed | ✅ |
| When balance hits zero: status flips to `paid`, `paid_at` is set | ✅ |
| `statusFlippedToPaid` computed server-side from pre vs post status | ✅ |
| Soft-fail `invoice.payment_recorded` activity row written (always on success) | ✅ |
| Soft-fail `invoice.marked_paid` activity row written ONLY when status flipped | ✅ |
| Activity failure does not roll back payment | ✅ |
| `router.refresh()` on success | ✅ — summary, payments table, status badge, Mark Receipt Sent affordance all update |
| Field-level errors surface inline; server-error message surfaces below the form | ✅ |
| No online payment / payment link / processor / customer portal added | ✅ |

---

## 12. Mark Receipt Sent verification

| Step | Status |
|---|---|
| Button renders only when status `paid` AND `receipt_sent_at` is null | ✅ |
| `window.confirm` copy explicitly states no email / text is sent | ✅ |
| Phase 11B `markReceiptSent` rejects unless `status='paid'` | ✅ |
| `receipt_sent_at` set to operator-supplied ISO or server `now()` | ✅ |
| Button disappears after the mark (eligibility flips false) | ✅ |
| Soft-fail `invoice.receipt_marked_sent` activity row written | ✅ |
| No SMS / email / message-automation call | ✅ — grep audit §13 below |

---

## 13. Activity behavior

Phase 11 ships **five** soft-fail activity types — all via the
existing Phase 1 `createActivity` helper, all non-blocking on the
underlying mutation:

| `activity_type` | Source | Details payload |
|---|---|---|
| `job.completed_with_invoice` | `completeJobAndCreateInvoiceAction` | `invoice_id`, `line_item_count`, `total_cents`. |
| `invoice.created_from_job` | Both create actions | `job_id`, `line_item_count`, `total_cents`, `source: 'job_completion' \| 'manual'`. |
| `invoice.payment_recorded` | `recordInvoicePaymentAction` (every success) | `amount_cents`, `payment_method`, `balance_cents`, `status`. |
| `invoice.marked_paid` | `recordInvoicePaymentAction` (only when status flipped) | `paid_at`, `total_cents`. |
| `invoice.receipt_marked_sent` | `markReceiptSentAction` | `receipt_sent_at`, `job_id`. |

Audit:

- `grep -rn 'sendInternalSmsNotification\|notification_logs\|sendSms\|sendEmail'` across `src/app/admin/invoices` and `src/core/invoices` → **0 matches.**
- Phase 6D GHL guardrail is not reached from any Phase 11 path.
- No customer notifications, no message-automation triggers.

---

## 14. Do-Not-Build audit

Audited against §22 of the Phase 11 doc + each appendix's
"What did NOT ship" section. Every item is confirmed **NOT**
present in Phase 11 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Online payment processing | ✅ not built | No Stripe / Square / processor imports in `src/app/admin/invoices` or `src/core/invoices`. |
| Stripe / Square / payment processor integration | ✅ not built | Same. |
| Payment links | ✅ not built | No public-token / shareable-link columns in the migration. |
| Customer payment portal | ✅ not built | Invoices are admin-only; no public route under `/q` or elsewhere. |
| Automatic receipt sending | ✅ not built | Mark Receipt Sent stores a timestamp; no template engine. |
| SMS / email receipt delivery | ✅ not built | Grep §13 audit returned 0 matches. |
| Message-automation outcomes | ✅ not built | Phase 3 engine untouched from any Phase 11 module. |
| Customer-facing invoice or receipt pages | ✅ not built | No public column / route / page. |
| PDF generation | ✅ not built | No `pdf-lib` / `puppeteer` / similar imports. |
| Taxes | ✅ not built | No tax columns or modules. |
| Discounts | ✅ not built | No discount columns or modules. |
| Deposits | ✅ not built | No deposit columns or modules. |
| Refunds | ✅ not built | No refund table, no refund action. |
| QuickBooks / Xero / accounting sync | ✅ not built | No sync columns or modules. |
| Recurring invoices | ✅ not built | No recurrence / rrule columns. |
| Recurring jobs | ✅ not built | Covered by Phase 10 Do-Not-Build. |
| Full scheduling changes | ✅ not built | Phase 10 owns scheduling; Phase 11 doesn't touch it. |
| Crew / technician assignment | ✅ not built | No crew columns. |
| Route optimization | ✅ not built | No optimization modules. |
| Public `/q` changes | ✅ not built | `/q` unchanged at **6.55 kB** (matches Phase 10 close). |
| Simulation-driven invoicing / payment generation | ✅ not built | No simulation → invoice / payment path. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Plugin builder / marketplace | ✅ not built | Plugin registry unchanged. |
| Data import / export | ✅ not built | No importer / exporter code. |
| Multi-currency | ✅ not built | USD only; bigint cents. |
| Invoice editing | ✅ not built | Line items + invoice fields read-only post-create. |
| Invoice voiding UI | ✅ not built | `void` status exists in the enum for future use; no action surfaces it. |
| Edit / delete / archive beyond Phase 11D/E actions | ✅ not built | Only Complete Job + manual create + Mark Paid + Mark Receipt Sent surfaces. |
| New low-level DB write helpers | ✅ not built | Phase 11C/D/E actions compose existing Phase 9B + 11B helpers. |
| New columns on existing tables | ✅ not built | Phase 11B migration adds only the three new tables; no `ALTER TABLE`. |

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 Do-Not-Build
lists remain in force; nothing in Phase 11 touched any of those
items.

---

## 15. Regression checks

| Surface | Status |
|---|---|
| `/admin/invoices` loads | ✅ (223 B) |
| `/admin/invoices/[invoiceId]` loads | ✅ (2.64 kB) |
| `/admin/jobs` loads | ✅ (223 B) |
| `/admin/jobs/[jobId]` loads | ✅ (5.32 kB) |
| `/admin/jobs/new` loads | ✅ (3.48 kB) |
| `/admin/schedule` loads | ✅ (4.5 kB) |
| `/admin/contacts` loads | ✅ (1.31 kB) |
| `/admin/contacts/[contactId]` loads | ✅ (1.89 kB) |
| `/admin/quotes` loads | ✅ (1.77 kB) |
| `/admin/quotes/[quoteId]` loads | ✅ (818 B) |
| `/admin/marketing/door-hangers` loads | ✅ (7.56 kB) |
| `/admin/marketing/door-hangers/routes` loads | ✅ (5.55 kB) |
| `/admin/simulation` loads | ✅ (1.66 kB) |
| `/admin/simulation/play` loads | ✅ (3.42 kB) |
| `/admin/message-automations` loads | ✅ (1.46 kB) |
| `/admin/tasks` loads | ✅ (919 B) |
| `/q` loads | ✅ (**6.55 kB** — unchanged from Phase 10 close) |
| Workspace switcher still works | ✅ — Phase 6D code untouched. |
| Simulation Mode banner still works | ✅ — Phase 6D code untouched. |
| Nav active-state highlights one item per page | ✅ — Phase 7C `resolveActiveNavHref` covers `/admin/invoices` + `/admin/invoices/<id>`. |

---

## 16. Known issues / accepted limitations

None of these block Phase 11 sign-off.

1. **No online payment processing.** Phase 11 records payments
   that the operator collected out of band (cash / check / Zelle
   / manually-entered card). A future Payments phase introduces
   a processor.
2. **Receipt sending is manual.** `receipt_sent_at` is a
   timestamp the operator ticks after delivering the receipt
   out of band. No template engine, no provider integration.
3. **No partial-payment split UX.** The operator can submit the
   Mark Paid modal multiple times; the schema rolls each row up
   into `amount_paid_cents`. A future polish step could add a
   "split this payment" affordance on top.
4. **No refund / void UI.** The `void` status exists in the
   Phase 11B enum so the column is forward-compatible; no action
   surfaces it yet.
5. **No invoice editing.** Line items + invoice fields are
   read-only after creation. If the original job line items were
   wrong, the operator fixes the job line items (Phase 9D) then
   uses the manual fallback to create a new invoice. A future
   Invoice Editing phase could expose direct edits.
6. **Multiple invoices per job allowed in schema.** §16 — UI
   discourages duplicates via the `deriveCompleteJobButtonState`
   variant logic + the manual-fallback confirm prompt, but the
   DB does not enforce uniqueness. Operator decides.
7. **Ordered writes + recompute, not RPC-atomic.** Matches the
   Phase 5B / 7D-1 / 8B / 9B / 11B posture. If
   `createInvoiceFromJob` fails after the job status flip, the
   job is left in `completed` and the operator can use the
   manual fallback. A future Postgres RPC could wrap this if
   real usage surfaces partial-commit incidents.
8. **`router.refresh` cost on Mark Paid / Mark Receipt Sent.**
   Server Component reload is more bandwidth than an
   optimistic in-page update. Trade-off kept the modal lifecycle
   simple; no stale state to reconcile.
9. **`window.confirm` for Mark Receipt Sent.** Matches the
   Phase 10D unschedule + Phase 11D manual-duplicate-invoice
   precedent. A custom dialog could land in a future polish
   step if it's needed.
10. **No automated browser tests** for the Mark Paid + Mark
    Receipt Sent + Complete Job + manual create flows. The
    build + lint + 777-test suite covers pure helpers + the
    eligibility logic + the loaders; modal-level confirmation
    (click → submit → see updated row) was done manually during
    rollout.
11. **No automated integration test for the activity writes.**
    The `createActivity` helper is exercised via the soft-fail
    `void` pattern; failures are silent by design. Verifying that
    rows actually land is a manual
    `select * from activities where activity_type like 'invoice.%' or activity_type = 'job.completed_with_invoice'`
    check post-action.

---

## 17. Readiness verdict

**Phase 11 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 777 / 777, `lint`,
  `build`).
- All Definition-of-Done criteria pass.
- DB-side verification confirms three new tables, **14 CHECK
  constraints**, **13 secondary indexes** + 3 pkeys, **3 RLS
  Pattern B SELECT policies**, and zero public/customer-facing
  columns.
- The Do-Not-Build audit is clean — no online payments,
  Stripe/Square/processor integration, payment links, customer
  payment portal, automatic receipt sending, SMS/email,
  message-automation outcomes, customer-facing pages, PDF
  generation, taxes, discounts, deposits, refunds, QuickBooks
  sync, recurring invoices, public `/q` changes, simulation
  invoicing, AI expansion, plugin marketplace, import/export,
  multi-currency, or invoice editing / voiding beyond the four
  shipped actions.
- Five soft-fail activity rows ship for every meaningful
  invoice / payment / receipt event; failure is non-blocking;
  no message-engine calls are made anywhere in Phase 11.
- Phase 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10 regression checks
  pass.
- Known issues are minor and documented.

### Phase 11 in one paragraph

Phase 11 ships the **billing snapshot layer** of the CRM as
three new tables — `invoices`, `invoice_line_items`,
`invoice_payments` — plus the Jobber-style **Complete Job →
Create Invoice → Record Payment → Mark Receipt Sent** workflow.
Complete Job freezes a snapshot of the job's line items into the
invoice and flips job status to `completed`; the manual fallback
creates an invoice from a job without changing job status (for
re-invoicing / partial-work scenarios). Mark Paid inserts a row
into `invoice_payments`, recomputes the summary columns on the
parent invoice, and flips status `unpaid` / `draft` → `paid` +
sets `paid_at` when balance hits zero. Mark Receipt Sent stores
a manual timestamp only — no SMS, no email, no template engine,
no provider integration. Online payment processing,
Stripe / Square / payment-link integration, customer payment
portal, receipt sending automation, taxes, discounts, deposits,
refunds, QuickBooks / Xero sync, and recurring invoices are all
explicit future foundation phases.

**Future foundation phases that build on Phase 11 (exact naming
TBD):**

- **Online Payments + Payment Processor Integration** —
  Stripe / Square integration, payment-link generation,
  webhook handlers; persists alongside the existing
  `invoice_payments` table with a payment_method like `stripe`
  or via a sibling `payment_processor_transactions` table.
- **Customer Payment Portal** — public per-invoice routes
  (token-gated) where customers accept-and-pay; introduces the
  first customer-facing surface beyond the public `/q` quote
  page.
- **Automatic Receipt Sending** — receipt templates, provider
  integration (SMS / email), wiring through the Phase 3
  message-automation engine; replaces the manual Mark Receipt
  Sent timestamp.
- **Invoice Taxes + Discounts** — line-level + invoice-level
  tax_rate / discount columns; extends `computeInvoiceTotal` to
  apply them.
- **Refunds** — `invoice_refunds` table or signed
  `invoice_payments` rows; introduces the first negative-money
  flow.
- **Invoice Editing / Voiding** — exposes the `void` status
  + reasonable edit affordances on line items.
- **QuickBooks / Xero Accounting Sync** — sibling sync columns
  on `invoices` + `invoice_payments`; daily reconciliation job.
