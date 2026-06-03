// Phase 11B — pure presentation helpers for the future Phase 11C UI.
//
// No DB, no env, no `server-only`. Safe to import from client or
// server. Centralised so list, detail, and any modals render the
// same labels + tones.
//
// Money formatting reuses the Phase 9C jobs helper to keep one
// USD format across the admin.

import { formatCentsAsDollars } from "@/core/jobs/display";

import type {
  InvoiceLineItemSource,
  InvoiceSource,
  InvoiceStatus,
  PaymentMethod,
} from "./constants";

export { formatCentsAsDollars };

export type InvoiceStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  paid: "Paid",
  void: "Void",
};

const STATUS_TONES: Record<InvoiceStatus, InvoiceStatusTone> = {
  draft: "neutral",
  unpaid: "warning",
  paid: "success",
  void: "danger",
};

const SOURCE_LABELS: Record<InvoiceSource, string> = {
  job_completion: "From completed job",
  manual: "Manual",
};

const LINE_ITEM_SOURCE_LABELS: Record<InvoiceLineItemSource, string> = {
  job: "From job",
  custom: "Custom",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  zelle: "Zelle",
  other: "Other",
};

export function invoiceStatusLabel(status: string): string {
  return STATUS_LABELS[status as InvoiceStatus] ?? status;
}

export function invoiceStatusTone(status: string): InvoiceStatusTone {
  return STATUS_TONES[status as InvoiceStatus] ?? "neutral";
}

export function invoiceSourceLabel(source: string): string {
  return SOURCE_LABELS[source as InvoiceSource] ?? source;
}

export function invoiceLineItemSourceLabel(source: string): string {
  return LINE_ITEM_SOURCE_LABELS[source as InvoiceLineItemSource] ?? source;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

// Phase 11 receipt display states (§13). `paid_at` is the
// authoritative "is it paid" timestamp; `receipt_sent_at` is the
// manual sent flag operators tick after delivering the receipt
// out of band.
export function receiptDisplay(input: {
  status: string;
  receiptSentAtIso: string | null | undefined;
}): "not_paid" | "not_sent" | "sent" {
  if (input.status !== "paid") return "not_paid";
  return input.receiptSentAtIso ? "sent" : "not_sent";
}

export function receiptDisplayLabel(input: {
  status: string;
  receiptSentAtIso: string | null | undefined;
}): string {
  switch (receiptDisplay(input)) {
    case "not_paid":
      return "—";
    case "not_sent":
      return "Not sent";
    case "sent":
      return "Sent";
  }
}
