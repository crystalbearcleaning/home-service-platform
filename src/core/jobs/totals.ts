// Phase 9B — pure money / total math for jobs + job_line_items.
//
// Money convention: bigint cents (Phase 5+ standard). All helpers
// clamp non-finite / negative values defensively so the DB CHECKs
// (`unit_price_cents >= 0`, `total_cents >= 0`,
// `estimated_total_cents >= 0`) never fire on a programmer mistake.
//
// No DB, no env, no `server-only`. Safe to import from anywhere.

// quantity may be fractional (numeric(10,2) in the DB); unit price is
// an integer cents value. We round to the nearest cent.
export function computeJobLineItemTotal(input: {
  quantity: number;
  unitPriceCents: number;
}): number {
  const q = sanitizeQuantity(input.quantity);
  const p = sanitizeUnitPriceCents(input.unitPriceCents);
  return Math.max(0, Math.round(q * p));
}

export function computeJobEstimatedTotal(
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

function sanitizeQuantity(q: number): number {
  if (!Number.isFinite(q)) return 0;
  if (q < 0) return 0;
  // Two-decimal precision matches numeric(10,2) in the DB.
  return Math.round(q * 100) / 100;
}

function sanitizeUnitPriceCents(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  return Math.floor(p);
}
