"use server";

import { revalidatePath } from "next/cache";

import { createActivity } from "@/core/activity/logger";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { parseDollarsToCents } from "@/core/door-hanger/calculations";
import { getInvoice } from "@/core/invoices/admin-data";
import {
  markReceiptSent,
  recordInvoicePayment,
} from "@/core/invoices/admin-create";
import type { PaymentMethod } from "@/core/invoices/constants";

// =========================================================================
// Phase 11E — /admin/invoices server actions.
//
// Two actions: recordInvoicePaymentAction + markReceiptSentAction.
// Both compose the Phase 11B server-only helpers (which run
// validation + the overpayment / status-flip / paid_at logic in
// the same handler). Soft-fail activity rows; no message-engine
// calls; no customer notifications.
// =========================================================================

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

async function requireBusiness(): Promise<
  | { ok: true; userId: string; businessId: string }
  | { ok: false; error: { code: string; message: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign-in required." },
    };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

function revalidateAfterInvoiceMutation(
  invoiceId: string,
  jobId: string | null,
) {
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  if (jobId) revalidatePath(`/admin/jobs/${jobId}`);
}

// -------------------------------------------------------------------------
// recordInvoicePaymentAction
// -------------------------------------------------------------------------

export type RecordPaymentInput = {
  invoiceId: string;
  amountDollars: string;
  paymentMethod: PaymentMethod;
  paidAt: string; // datetime-local string
  notes?: string | null;
};

export type RecordPaymentPayload = {
  paymentId: string;
  amountPaidCents: number;
  balanceCents: number;
  status: "draft" | "unpaid" | "paid" | "void";
  paidAtIso: string | null;
  statusFlippedToPaid: boolean;
};

export async function recordInvoicePaymentAction(
  input: RecordPaymentInput,
): Promise<ActionResult<RecordPaymentPayload>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.invoiceId?.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing invoiceId." },
    };
  }

  // Boundary: dollars input → integer cents. Surface as a field
  // error so the modal can highlight the amount input.
  const cents = parseDollarsToCents(input.amountDollars);
  if (!cents.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Amount is invalid.",
        fieldErrors: {
          amountDollars:
            cents.reason === "NEGATIVE"
              ? "Amount cannot be negative."
              : "Amount must be a number.",
        },
      },
    };
  }
  if (cents.cents === null) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Amount is required.",
        fieldErrors: { amountDollars: "Amount is required." },
      },
    };
  }

  // Load the invoice first so we know whether to revalidate the
  // job detail and whether the status actually flipped.
  const invoiceBefore = await getInvoice({
    businessId: auth.businessId,
    invoiceId: input.invoiceId,
  });
  if (!invoiceBefore) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Invoice not found." },
    };
  }
  const statusBefore = invoiceBefore.status;

  const result = await recordInvoicePayment({
    businessId: auth.businessId,
    invoiceId: input.invoiceId,
    form: {
      amountCents: cents.cents,
      paymentMethod: input.paymentMethod,
      paidAt: input.paidAt,
      notes: input.notes ?? null,
      // The Phase 11B validator's overpayment guard runs against
      // this value. We pass the live balance read above.
      currentBalanceCents: invoiceBefore.balanceCents,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };

  const statusFlippedToPaid =
    statusBefore !== "paid" && result.data.status === "paid";

  // Soft-fail activity row per §18 of the Phase 11 doc. Failure is
  // non-blocking — the payment exists and the summary is correct.
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "invoice.payment_recorded",
    summary: `Payment recorded on invoice`,
    relatedObjectType: "invoice",
    relatedObjectId: input.invoiceId,
    details: {
      amount_cents: cents.cents,
      payment_method: input.paymentMethod,
      balance_cents: result.data.balanceCents,
      status: result.data.status,
    },
  });

  if (statusFlippedToPaid) {
    void createActivity({
      businessId: auth.businessId,
      actorType: "user",
      actorUserId: auth.userId,
      activityType: "invoice.marked_paid",
      summary: `Invoice marked paid in full`,
      relatedObjectType: "invoice",
      relatedObjectId: input.invoiceId,
      details: {
        paid_at: result.data.paidAtIso,
        total_cents: invoiceBefore.totalCents,
      },
    });
  }

  revalidateAfterInvoiceMutation(input.invoiceId, invoiceBefore.jobId);

  return {
    ok: true,
    data: {
      paymentId: result.data.paymentId,
      amountPaidCents: result.data.amountPaidCents,
      balanceCents: result.data.balanceCents,
      status: result.data.status,
      paidAtIso: result.data.paidAtIso,
      statusFlippedToPaid,
    },
  };
}

// -------------------------------------------------------------------------
// markReceiptSentAction
// -------------------------------------------------------------------------

export async function markReceiptSentAction(input: {
  invoiceId: string;
}): Promise<ActionResult<{ receiptSentAtIso: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.invoiceId?.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing invoiceId." },
    };
  }

  // Lookup the invoice so we can revalidate the job detail page
  // and record useful activity metadata.
  const invoiceBefore = await getInvoice({
    businessId: auth.businessId,
    invoiceId: input.invoiceId,
  });
  if (!invoiceBefore) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Invoice not found." },
    };
  }

  const result = await markReceiptSent({
    businessId: auth.businessId,
    invoiceId: input.invoiceId,
  });
  if (!result.ok) return { ok: false, error: result.error };

  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "invoice.receipt_marked_sent",
    summary: `Receipt marked sent`,
    relatedObjectType: "invoice",
    relatedObjectId: input.invoiceId,
    details: {
      receipt_sent_at: result.data.receiptSentAtIso,
      job_id: invoiceBefore.jobId,
    },
  });

  revalidateAfterInvoiceMutation(input.invoiceId, invoiceBefore.jobId);

  return {
    ok: true,
    data: { receiptSentAtIso: result.data.receiptSentAtIso },
  };
}
