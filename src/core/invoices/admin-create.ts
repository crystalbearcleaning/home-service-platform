import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { getJob, getJobLineItems } from "@/core/jobs/admin-data";

import {
  isInvoiceSource,
  type InvoiceSource,
  type InvoiceStatus,
} from "./constants";
import {
  computeAmountPaid,
  computeInvoiceBalance,
  computeInvoiceTotal,
  deriveInvoicePaymentStatus,
} from "./totals";
import {
  validatePaymentForm,
  type PaymentFormInput,
} from "./validation";

// =========================================================================
// Phase 11B — server-only create / update helpers for invoices,
// invoice_line_items, and invoice_payments.
//
// Atomicity: ordered writes + recompute (Phase 5B / 7D-1 / 8B / 9B
// pattern). Every helper that mutates line items or payments
// recomputes the affected summary columns on the parent invoice row
// in the same handler. The DB CHECKs (`subtotal_cents >= 0`,
// `total_cents >= 0`, `amount_paid_cents >= 0`, `balance_cents >= 0`,
// `amount_cents > 0`) are the safety net.
//
// No CRM side effects beyond the rows owned by this module. No
// message-engine calls. No `activities` writes in Phase 11B
// (Phase 11D/E server actions soft-fail-write activity rows).
// =========================================================================

type CreateError = {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
};

export type CreateResult<T> = { ok: true; data: T } | CreateError;

function fail(
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): CreateError {
  return { ok: false, error: { code, message, fieldErrors } };
}

function validationFail(
  errors: { field: string; message: string }[],
): CreateError {
  const fe: Record<string, string> = {};
  for (const e of errors) fe[e.field] = e.message;
  return fail("VALIDATION_FAILED", "One or more fields are invalid.", fe);
}

// -------------------------------------------------------------------------
// createInvoiceFromJob
// -------------------------------------------------------------------------

export type CreateInvoiceFromJobInput = {
  businessId: string;
  jobId: string;
  source?: InvoiceSource; // default 'job_completion'
  invoiceNumber?: string | null;
  status?: InvoiceStatus; // default 'unpaid'
};

export async function createInvoiceFromJob(
  input: CreateInvoiceFromJobInput,
): Promise<
  CreateResult<{
    invoiceId: string;
    lineItemCount: number;
    subtotalCents: number;
    totalCents: number;
    balanceCents: number;
  }>
> {
  if (!input.businessId || !input.jobId) {
    return fail("INVALID_INPUT", "Missing businessId or jobId.");
  }

  // Source / status defaults per §§4, 7 of the Phase 11 doc.
  const source: InvoiceSource = isInvoiceSource(input.source)
    ? input.source
    : "job_completion";
  const status: InvoiceStatus =
    input.status === "draft" ||
    input.status === "unpaid" ||
    input.status === "paid" ||
    input.status === "void"
      ? input.status
      : "unpaid";

  // Verify job belongs to business (and resolve contact / property).
  const job = await getJob({
    businessId: input.businessId,
    jobId: input.jobId,
  });
  if (!job) {
    return fail("FOREIGN_BUSINESS", "Job not found for this business.");
  }

  const lineItems = await getJobLineItems({
    businessId: input.businessId,
    jobId: job.id,
  });

  const invoiceNumber =
    typeof input.invoiceNumber === "string" &&
    input.invoiceNumber.trim().length > 0
      ? input.invoiceNumber.trim()
      : null;

  const sb = createServiceRoleClient();

  // 1) Insert parent invoice row with zeroed summary; we'll recompute
  //    after line items land.
  const { data: invoiceRow, error: invErr } = await sb
    .from("invoices")
    .insert({
      business_id: input.businessId,
      contact_id: job.contactId,
      property_id: job.propertyId,
      job_id: job.id,
      invoice_number: invoiceNumber,
      status,
      source,
      subtotal_cents: 0,
      total_cents: 0,
      amount_paid_cents: 0,
      balance_cents: 0,
      paid_at: null,
      receipt_sent_at: null,
    })
    .select("id")
    .single();
  if (invErr || !invoiceRow) {
    return fail("DB_ERROR", invErr?.message ?? "Invoice insert failed.");
  }
  const invoiceId = invoiceRow.id as string;

  // 2) Bulk-insert invoice_line_items copied from job_line_items.
  if (lineItems.length > 0) {
    const rows = lineItems.map((li, idx) => ({
      business_id: input.businessId,
      invoice_id: invoiceId,
      job_line_item_id: li.id,
      service_id: li.serviceId,
      name: li.name,
      description: li.description,
      quantity: li.quantity,
      unit_price_cents: li.unitPriceCents,
      total_cents: li.totalCents,
      sort_order: li.sortOrder ?? idx,
      source: "job",
    }));
    const { error: liErr } = await sb
      .from("invoice_line_items")
      .insert(rows);
    if (liErr) {
      return fail(
        "DB_ERROR",
        `Invoice ${invoiceId} was created but line item insert failed: ${liErr.message}`,
      );
    }
  }

  // 3) Recompute summary from actual inserted rows.
  const totals = await recomputeInvoiceTotals(input.businessId, invoiceId);
  if (!totals.ok) return totals;

  return {
    ok: true,
    data: {
      invoiceId,
      lineItemCount: lineItems.length,
      subtotalCents: totals.subtotalCents,
      totalCents: totals.totalCents,
      balanceCents: totals.balanceCents,
    },
  };
}

// -------------------------------------------------------------------------
// recordInvoicePayment
// -------------------------------------------------------------------------

export async function recordInvoicePayment(input: {
  businessId: string;
  invoiceId: string;
  form: PaymentFormInput;
}): Promise<
  CreateResult<{
    paymentId: string;
    amountPaidCents: number;
    balanceCents: number;
    status: InvoiceStatus;
    paidAtIso: string | null;
  }>
> {
  if (!input.businessId || !input.invoiceId) {
    return fail("INVALID_INPUT", "Missing businessId or invoiceId.");
  }

  // Load the invoice (we need status + current balance for the
  // overpayment guard + the status-flip decision).
  const own = await loadOwnedInvoiceSummary(input.businessId, input.invoiceId);
  if (!own.ok) return own;

  if (own.summary.status === "void") {
    return fail(
      "INVALID_STATUS",
      "Cannot record a payment on a void invoice.",
      { status: "Invoice is void." },
    );
  }

  // Validate the payment form. The validator runs the overpayment
  // guard against the current balance.
  const v = validatePaymentForm({
    ...input.form,
    currentBalanceCents: own.summary.balanceCents,
  });
  if (!v.ok) return validationFail(v.errors);

  const sb = createServiceRoleClient();

  const { data: payRow, error: payErr } = await sb
    .from("invoice_payments")
    .insert({
      business_id: input.businessId,
      invoice_id: input.invoiceId,
      amount_cents: v.data.amountCents,
      payment_method: v.data.paymentMethod,
      paid_at: v.data.paidAtIso,
      notes: v.data.notes,
    })
    .select("id")
    .single();
  if (payErr || !payRow) {
    return fail("DB_ERROR", payErr?.message ?? "Payment insert failed.");
  }

  // Recompute amount_paid + balance.
  const totals = await recomputeInvoiceTotals(input.businessId, input.invoiceId);
  if (!totals.ok) return totals;

  // Decide whether to flip status + set paid_at.
  const next = deriveInvoicePaymentStatus({
    currentStatus: own.summary.status,
    balanceCents: totals.balanceCents,
    paymentPaidAtIso: v.data.paidAtIso,
  });

  // Apply the status / paid_at update only when something actually
  // changed — keeps the row's `updated_at` honest on no-op calls.
  if (
    next.nextStatus !== own.summary.status ||
    (next.paidAtIso && own.summary.paidAt === null)
  ) {
    const update: Record<string, unknown> = { status: next.nextStatus };
    if (next.paidAtIso && own.summary.paidAt === null) {
      update.paid_at = next.paidAtIso;
    }
    const { error: updErr } = await sb
      .from("invoices")
      .update(update)
      .eq("id", input.invoiceId)
      .eq("business_id", input.businessId);
    if (updErr) {
      return fail(
        "DB_ERROR",
        `Payment recorded but status update failed: ${updErr.message}`,
      );
    }
  }

  return {
    ok: true,
    data: {
      paymentId: payRow.id as string,
      amountPaidCents: totals.amountPaidCents,
      balanceCents: totals.balanceCents,
      status: next.nextStatus,
      paidAtIso:
        next.paidAtIso && own.summary.paidAt === null
          ? next.paidAtIso
          : own.summary.paidAt,
    },
  };
}

// -------------------------------------------------------------------------
// markReceiptSent
// -------------------------------------------------------------------------

export async function markReceiptSent(input: {
  businessId: string;
  invoiceId: string;
  receiptSentAtIso?: string | null; // defaults to now()
}): Promise<CreateResult<{ receiptSentAtIso: string }>> {
  if (!input.businessId || !input.invoiceId) {
    return fail("INVALID_INPUT", "Missing businessId or invoiceId.");
  }

  const own = await loadOwnedInvoiceSummary(input.businessId, input.invoiceId);
  if (!own.ok) return own;

  // Per §13 of the Phase 11 doc: only `paid` invoices can be marked
  // receipt-sent (UI gates this; action enforces).
  if (own.summary.status !== "paid") {
    return fail(
      "INVALID_STATUS",
      "Receipts can only be marked sent on paid invoices.",
      { status: "Invoice is not paid." },
    );
  }

  const ts =
    typeof input.receiptSentAtIso === "string" &&
    input.receiptSentAtIso.length > 0
      ? new Date(input.receiptSentAtIso)
      : new Date();
  if (Number.isNaN(ts.getTime())) {
    return fail("INVALID_INPUT", "Invalid receipt timestamp.", {
      receiptSentAt: "Invalid timestamp.",
    });
  }
  const iso = ts.toISOString();

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("invoices")
    .update({ receipt_sent_at: iso })
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId);
  if (error) return fail("DB_ERROR", error.message);

  return { ok: true, data: { receiptSentAtIso: iso } };
}

// -------------------------------------------------------------------------
// Shared helpers (private)
// -------------------------------------------------------------------------

type InvoiceSummary = {
  status: InvoiceStatus;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  paidAt: string | null;
};

async function loadOwnedInvoiceSummary(
  businessId: string,
  invoiceId: string,
): Promise<{ ok: true; summary: InvoiceSummary } | CreateError> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoices")
    .select(
      "id,business_id,status,total_cents,amount_paid_cents,balance_cents,paid_at",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) return fail("DB_ERROR", error.message);
  if (!data || data.business_id !== businessId) {
    return fail("FOREIGN_BUSINESS", "Invoice not found for this business.");
  }
  return {
    ok: true,
    summary: {
      status: String(data.status ?? "unpaid") as InvoiceStatus,
      totalCents: Number(data.total_cents ?? 0),
      amountPaidCents: Number(data.amount_paid_cents ?? 0),
      balanceCents: Number(data.balance_cents ?? 0),
      paidAt: data.paid_at ? String(data.paid_at) : null,
    },
  };
}

type RecomputeResult =
  | {
      ok: true;
      subtotalCents: number;
      totalCents: number;
      amountPaidCents: number;
      balanceCents: number;
    }
  | { ok: false; error: { code: string; message: string } };

async function recomputeInvoiceTotals(
  businessId: string,
  invoiceId: string,
): Promise<RecomputeResult> {
  const sb = createServiceRoleClient();

  const [liRes, payRes] = await Promise.all([
    sb
      .from("invoice_line_items")
      .select("total_cents")
      .eq("business_id", businessId)
      .eq("invoice_id", invoiceId),
    sb
      .from("invoice_payments")
      .select("amount_cents")
      .eq("business_id", businessId)
      .eq("invoice_id", invoiceId),
  ]);
  if (liRes.error) {
    return { ok: false, error: { code: "DB_ERROR", message: liRes.error.message } };
  }
  if (payRes.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: payRes.error.message },
    };
  }

  const totalCents = computeInvoiceTotal(
    (liRes.data ?? []).map((r) => ({
      totalCents: Number(r.total_cents ?? 0),
    })),
  );
  const subtotalCents = totalCents; // Phase 11 = subtotal
  const amountPaidCents = computeAmountPaid(
    (payRes.data ?? []).map((r) => ({
      amountCents: Number(r.amount_cents ?? 0),
    })),
  );
  const balanceCents = computeInvoiceBalance(totalCents, amountPaidCents);

  const { error: updErr } = await sb
    .from("invoices")
    .update({
      subtotal_cents: subtotalCents,
      total_cents: totalCents,
      amount_paid_cents: amountPaidCents,
      balance_cents: balanceCents,
    })
    .eq("id", invoiceId)
    .eq("business_id", businessId);
  if (updErr) {
    return { ok: false, error: { code: "DB_ERROR", message: updErr.message } };
  }

  return {
    ok: true,
    subtotalCents,
    totalCents,
    amountPaidCents,
    balanceCents,
  };
}
