// Phase 11B — pure money math for invoices.
//
// Money convention: bigint cents (Phase 5+ standard). All helpers
// clamp non-finite / negative values defensively so the DB CHECKs
// (`*_cents >= 0`, `amount_cents > 0`) never fire on a programmer
// mistake.
//
// Mirrors `src/core/jobs/totals.ts` style.
//
// No DB, no env, no `server-only`. Safe to import from anywhere.

import type { InvoiceStatus } from "./constants";

// Quantity may be fractional (numeric(10,2) in the DB); unit price is
// an integer cents value. We round to the nearest cent.
export function computeInvoiceLineItemTotal(input: {
  quantity: number;
  unitPriceCents: number;
}): number {
  const q = sanitizeQuantity(input.quantity);
  const p = sanitizeUnitPriceCents(input.unitPriceCents);
  return Math.max(0, Math.round(q * p));
}

export function computeInvoiceSubtotal(
  lineItems: ReadonlyArray<{ totalCents: number }>,
): number {
  let sum = 0;
  for (const li of lineItems ?? []) {
    const t = Number(li?.totalCents);
    if (!Number.isFinite(t) || t < 0) continue;
    sum += Math.floor(t);
  }
  return sum;
}

// Phase 11 = subtotal_cents (no taxes / discounts yet).
// Kept as its own helper so a future Taxes phase plugs in cleanly.
export function computeInvoiceTotal(
  lineItems: ReadonlyArray<{ totalCents: number }>,
): number {
  return computeInvoiceSubtotal(lineItems);
}

export function computeAmountPaid(
  payments: ReadonlyArray<{ amountCents: number }>,
): number {
  let sum = 0;
  for (const p of payments ?? []) {
    const a = Number(p?.amountCents);
    if (!Number.isFinite(a) || a <= 0) continue;
    sum += Math.floor(a);
  }
  return sum;
}

export function computeInvoiceBalance(
  totalCents: number,
  amountPaidCents: number,
): number {
  const t = sanitizeNonNegCents(totalCents);
  const p = sanitizeNonNegCents(amountPaidCents);
  return Math.max(0, t - p);
}

// Pure helper used by recordInvoicePayment (Phase 11B) /
// recordInvoicePaymentAction (Phase 11E) to decide whether an
// `unpaid` invoice should flip to `paid` after the payment lands.
// Returns the new status + the paid_at timestamp to write
// (caller falls back to now() when this returns null for paid_at).
//
// Phase 11 status posture:
//   - draft / unpaid → paid when balance hits zero.
//   - draft / unpaid → stays the same when balance > 0.
//   - paid → stays paid (idempotent).
//   - void → never auto-flipped.
export function deriveInvoicePaymentStatus(input: {
  currentStatus: InvoiceStatus;
  balanceCents: number;
  paymentPaidAtIso: string | null;
}): { nextStatus: InvoiceStatus; paidAtIso: string | null } {
  const balance = sanitizeNonNegCents(input.balanceCents);

  if (input.currentStatus === "void") {
    return { nextStatus: "void", paidAtIso: null };
  }

  if (balance > 0) {
    return {
      nextStatus: input.currentStatus,
      paidAtIso: null,
    };
  }

  // balance === 0
  if (input.currentStatus === "paid") {
    return { nextStatus: "paid", paidAtIso: null };
  }
  return {
    nextStatus: "paid",
    paidAtIso: input.paymentPaidAtIso,
  };
}

function sanitizeQuantity(q: number): number {
  if (!Number.isFinite(q)) return 0;
  if (q < 0) return 0;
  return Math.round(q * 100) / 100;
}

function sanitizeUnitPriceCents(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  return Math.floor(p);
}

function sanitizeNonNegCents(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  return Math.floor(v);
}
