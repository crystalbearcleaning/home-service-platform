// Phase 11E — pure UI eligibility helpers for Mark Paid + Mark
// Receipt Sent.
//
// Centralised so the invoice detail page + future tests stay
// aligned with the server-side guards in the corresponding
// actions. No DB, no env, no `server-only`.

import type { InvoiceStatus } from "./constants";
import { isInvoiceStatus } from "./constants";

// Mark Paid is eligible per §12 of the Phase 11 doc when:
//   - status is `draft` or `unpaid` (`paid` already done; `void`
//     never accepts payments per Phase 11B `recordInvoicePayment`)
//   - balance > 0 (Phase 11 UI is paid-in-full first; nothing to
//     record when the balance is already zero).
export function isMarkPaidEligible(input: {
  status: string;
  balanceCents: number;
}): boolean {
  if (!isInvoiceStatus(input.status)) return false;
  const s = input.status as InvoiceStatus;
  if (s !== "draft" && s !== "unpaid") return false;
  if (!Number.isFinite(input.balanceCents)) return false;
  return input.balanceCents > 0;
}

// Mark Receipt Sent is eligible per §13 of the Phase 11 doc when:
//   - status is `paid`
//   - receipt_sent_at is null (no idempotent re-mark UX in Phase
//     11; once sent, the timestamp is final).
export function isMarkReceiptSentEligible(input: {
  status: string;
  receiptSentAtIso: string | null | undefined;
}): boolean {
  if (input.status !== "paid") return false;
  if (input.receiptSentAtIso) return false;
  return true;
}
