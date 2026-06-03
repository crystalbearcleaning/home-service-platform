// Phase 11B — pure validation for invoices + invoice_line_items +
// invoice_payments.
//
// Mirrors the CHECK constraints in
// `supabase/migrations/20260603130000_phase_11_invoices.sql` so the
// operator gets field-level errors before any DB round-trip. The
// server-only create / update helpers re-validate before inserting.
//
// No DB, no env, no `server-only`. Safe to import from anywhere.

import {
  isInvoiceLineItemSource,
  isInvoiceSource,
  isInvoiceStatus,
  isPaymentMethod,
  type InvoiceLineItemSource,
  type InvoiceSource,
  type InvoiceStatus,
  type PaymentMethod,
} from "./constants";

const INVOICE_NUMBER_MAX = 60;
const LINE_NAME_MAX = 200;
const LINE_DESCRIPTION_MAX = 2000;
const NOTES_MAX = 2000;

export type FieldError = { field: string; message: string };

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldError[] };

// -------------------------------------------------------------------------
// Invoice form (manual create from job)
// -------------------------------------------------------------------------

export type InvoiceFormInput = {
  contactId: string | null | undefined;
  propertyId?: string | null;
  jobId: string | null | undefined;
  invoiceNumber?: string | null;
  status?: string | null;
  source?: string | null;
};

export type InvoiceValidated = {
  contactId: string;
  propertyId: string | null;
  jobId: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  source: InvoiceSource;
};

export function validateInvoiceForm(
  input: InvoiceFormInput,
  defaults: { status?: InvoiceStatus; source?: InvoiceSource } = {},
): ValidationResult<InvoiceValidated> {
  const errors: FieldError[] = [];

  const contactId = (input.contactId ?? "").trim();
  if (contactId.length === 0) {
    errors.push({ field: "contactId", message: "Contact is required." });
  }
  const jobId = (input.jobId ?? "").trim();
  if (jobId.length === 0) {
    errors.push({ field: "jobId", message: "Source job is required." });
  }

  const propertyId = nullableId(input.propertyId);

  const status: InvoiceStatus = isInvoiceStatus(input.status)
    ? input.status
    : (defaults.status ?? "unpaid");
  if (input.status && !isInvoiceStatus(input.status)) {
    errors.push({ field: "status", message: "Unknown invoice status." });
  }

  const source: InvoiceSource = isInvoiceSource(input.source)
    ? input.source
    : (defaults.source ?? "job_completion");
  if (input.source && !isInvoiceSource(input.source)) {
    errors.push({ field: "source", message: "Unknown invoice source." });
  }

  const invoiceNumber = trimOrNull(
    input.invoiceNumber,
    INVOICE_NUMBER_MAX,
    "invoiceNumber",
    errors,
  );

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      contactId,
      propertyId,
      jobId,
      invoiceNumber,
      status,
      source,
    },
  };
}

// -------------------------------------------------------------------------
// Invoice line item form (copied from job line items in Phase 11D)
// -------------------------------------------------------------------------

export type InvoiceLineItemFormInput = {
  jobLineItemId?: string | null;
  serviceId?: string | null;
  name: string | null | undefined;
  description?: string | null;
  quantity: number | null | undefined;
  unitPriceCents: number | null | undefined;
  sortOrder?: number | null;
  source: string | null | undefined;
};

export type InvoiceLineItemValidated = {
  jobLineItemId: string | null;
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number | null;
  source: InvoiceLineItemSource;
};

export function validateInvoiceLineItemForm(
  input: InvoiceLineItemFormInput,
): ValidationResult<InvoiceLineItemValidated> {
  const errors: FieldError[] = [];

  const jobLineItemId = nullableId(input.jobLineItemId);
  const serviceId = nullableId(input.serviceId);

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    errors.push({ field: "name", message: "Line item name is required." });
  } else if (name.length > LINE_NAME_MAX) {
    errors.push({
      field: "name",
      message: `Name must be ${LINE_NAME_MAX} characters or fewer.`,
    });
  }

  const description = trimOrNull(
    input.description,
    LINE_DESCRIPTION_MAX,
    "description",
    errors,
  );

  const qRaw = input.quantity;
  let quantity = 0;
  if (qRaw === null || qRaw === undefined || !Number.isFinite(Number(qRaw))) {
    errors.push({ field: "quantity", message: "Quantity is required." });
  } else if (Number(qRaw) <= 0) {
    errors.push({
      field: "quantity",
      message: "Quantity must be greater than zero.",
    });
  } else {
    quantity = Math.round(Number(qRaw) * 100) / 100;
  }

  const pRaw = input.unitPriceCents;
  let unitPriceCents = 0;
  if (
    pRaw === null ||
    pRaw === undefined ||
    !Number.isFinite(Number(pRaw))
  ) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price is required.",
    });
  } else if (Number(pRaw) < 0) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price cannot be negative.",
    });
  } else if (!Number.isInteger(Number(pRaw))) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price must be a whole number of cents.",
    });
  } else {
    unitPriceCents = Math.floor(Number(pRaw));
  }

  let source: InvoiceLineItemSource = "job";
  if (!isInvoiceLineItemSource(input.source)) {
    errors.push({ field: "source", message: "Unknown line item source." });
  } else {
    source = input.source;
  }

  let sortOrder: number | null = null;
  if (input.sortOrder !== null && input.sortOrder !== undefined) {
    const s = Number(input.sortOrder);
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 0) {
      errors.push({
        field: "sortOrder",
        message: "Sort order must be a non-negative integer.",
      });
    } else {
      sortOrder = s;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

  return {
    ok: true,
    data: {
      jobLineItemId,
      serviceId,
      name,
      description,
      quantity,
      unitPriceCents,
      totalCents,
      sortOrder,
      source,
    },
  };
}

// -------------------------------------------------------------------------
// Payment form (Phase 11E Mark Paid modal)
// -------------------------------------------------------------------------

export type PaymentFormInput = {
  amountCents: number | null | undefined;
  paymentMethod: string | null | undefined;
  paidAt: string | null | undefined;
  notes?: string | null;
  // Current invoice balance (cents) before this payment. Used to
  // reject overpayment per §12 of the Phase 11 doc.
  currentBalanceCents: number | null | undefined;
};

export type PaymentValidated = {
  amountCents: number;
  paymentMethod: PaymentMethod;
  paidAtIso: string;
  notes: string | null;
};

export function validatePaymentForm(
  input: PaymentFormInput,
): ValidationResult<PaymentValidated> {
  const errors: FieldError[] = [];

  const aRaw = input.amountCents;
  let amountCents = 0;
  if (
    aRaw === null ||
    aRaw === undefined ||
    !Number.isFinite(Number(aRaw))
  ) {
    errors.push({ field: "amountCents", message: "Amount is required." });
  } else if (Number(aRaw) <= 0) {
    errors.push({
      field: "amountCents",
      message: "Amount must be greater than zero.",
    });
  } else if (!Number.isInteger(Number(aRaw))) {
    errors.push({
      field: "amountCents",
      message: "Amount must be a whole number of cents.",
    });
  } else {
    amountCents = Math.floor(Number(aRaw));
  }

  // Overpayment guard. Phase 11 UI starts paid-in-full; the action
  // rejects amounts that would drive balance below zero.
  if (
    amountCents > 0 &&
    input.currentBalanceCents !== null &&
    input.currentBalanceCents !== undefined
  ) {
    const balance = Number(input.currentBalanceCents);
    if (Number.isFinite(balance) && balance >= 0 && amountCents > balance) {
      errors.push({
        field: "amountCents",
        message: "Amount cannot exceed the current balance.",
      });
    }
  }

  let paymentMethod: PaymentMethod = "cash";
  if (!isPaymentMethod(input.paymentMethod)) {
    errors.push({
      field: "paymentMethod",
      message: "Unknown payment method.",
    });
  } else {
    paymentMethod = input.paymentMethod;
  }

  let paidAtIso = "";
  const paidAtRaw = (input.paidAt ?? "").trim();
  if (paidAtRaw.length === 0) {
    errors.push({ field: "paidAt", message: "Paid-at is required." });
  } else {
    const d = new Date(paidAtRaw);
    if (Number.isNaN(d.getTime())) {
      errors.push({
        field: "paidAt",
        message: "Paid-at is not a valid date/time.",
      });
    } else {
      paidAtIso = d.toISOString();
    }
  }

  const notes = trimOrNull(input.notes, NOTES_MAX, "notes", errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { amountCents, paymentMethod, paidAtIso, notes },
  };
}

// -------------------------------------------------------------------------
// Receipt-sent eligibility (Phase 11E Mark Receipt Sent affordance)
// -------------------------------------------------------------------------

// Recommended posture per §13 of the Phase 11 doc: receipt is only
// marked sent on `paid` invoices. The action layer enforces; pure
// helper exposes the decision for UI gating.
export function isReceiptMarkableStatus(status: string): boolean {
  return status === "paid";
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function trimOrNull(
  v: string | null | undefined,
  max: number,
  field: string,
  errors: FieldError[],
): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  if (s.length > max) {
    errors.push({
      field,
      message: `${field} must be ${max} characters or fewer.`,
    });
  }
  return s;
}

function nullableId(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
