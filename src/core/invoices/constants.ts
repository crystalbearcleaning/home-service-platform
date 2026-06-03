// Phase 11B — pure enums for invoices + invoice_line_items +
// invoice_payments.
//
// Kept in sync with the CHECK constraints in
// `supabase/migrations/20260603130000_phase_11_invoices.sql`.
// No DB, no env, no `server-only`. Safe to import from anywhere.

export const INVOICE_STATUSES = [
  "draft",
  "unpaid",
  "paid",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_SOURCES = ["job_completion", "manual"] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

export const INVOICE_LINE_ITEM_SOURCES = ["job", "custom"] as const;
export type InvoiceLineItemSource =
  (typeof INVOICE_LINE_ITEM_SOURCES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "check",
  "card",
  "zelle",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return (
    typeof v === "string" &&
    (INVOICE_STATUSES as readonly string[]).includes(v)
  );
}

export function isInvoiceSource(v: unknown): v is InvoiceSource {
  return (
    typeof v === "string" &&
    (INVOICE_SOURCES as readonly string[]).includes(v)
  );
}

export function isInvoiceLineItemSource(
  v: unknown,
): v is InvoiceLineItemSource {
  return (
    typeof v === "string" &&
    (INVOICE_LINE_ITEM_SOURCES as readonly string[]).includes(v)
  );
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return (
    typeof v === "string" &&
    (PAYMENT_METHODS as readonly string[]).includes(v)
  );
}
