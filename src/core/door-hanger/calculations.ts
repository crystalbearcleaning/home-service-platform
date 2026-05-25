// Pure money + inventory math helpers for the Phase 5B-2 Door Hanger
// admin. All money values are bigint cents in the database; UI accepts
// dollars and converts via these helpers.

// Convert a dollar amount (number or string from a form input) into
// integer cents. Returns null when input is null / undefined / empty;
// returns { ok: false } on parse error so callers can surface a
// field-level message.
export type DollarParseResult =
  | { ok: true; cents: number | null }
  | { ok: false; reason: "NOT_A_NUMBER" | "NEGATIVE" };

export function parseDollarsToCents(
  raw: string | number | null | undefined,
): DollarParseResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, cents: null };
  }
  const str = typeof raw === "number" ? String(raw) : raw.trim();
  if (str.length === 0) return { ok: true, cents: null };
  const stripped = str.replace(/[$,\s]/g, "");
  const n = Number(stripped);
  if (!Number.isFinite(n)) return { ok: false, reason: "NOT_A_NUMBER" };
  if (n < 0) return { ok: false, reason: "NEGATIVE" };
  // Multiply by 100 then round to handle floating-point noise.
  return { ok: true, cents: Math.round(n * 100) };
}

export function formatCentsAsDollars(
  cents: number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

// cost_per_hanger derivation. Returns null when either input is missing
// or quantity is zero (avoids div-by-zero). Rounds half-up to the
// nearest cent.
export function computeCostPerHangerCents(input: {
  totalPrintCostCents: number | null;
  quantityReceived: number;
}): number | null {
  if (
    input.totalPrintCostCents === null ||
    !Number.isFinite(input.totalPrintCostCents) ||
    !Number.isFinite(input.quantityReceived) ||
    input.quantityReceived <= 0
  ) {
    return null;
  }
  return Math.round(input.totalPrintCostCents / input.quantityReceived);
}

// material_cost_cents derivation for a distribution session.
export function computeMaterialCostCents(input: {
  hangersDistributed: number;
  costPerHangerCents: number | null;
}): number | null {
  if (
    input.costPerHangerCents === null ||
    !Number.isFinite(input.costPerHangerCents) ||
    !Number.isFinite(input.hangersDistributed) ||
    input.hangersDistributed < 0
  ) {
    return null;
  }
  return input.hangersDistributed * input.costPerHangerCents;
}

// Convert minutes (UI) to seconds (DB). Empty / null → null.
export function minutesToSeconds(
  raw: string | number | null | undefined,
): { ok: true; seconds: number | null } | { ok: false; reason: "NOT_A_NUMBER" | "NEGATIVE" } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, seconds: null };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, reason: "NOT_A_NUMBER" };
  if (n < 0) return { ok: false, reason: "NEGATIVE" };
  return { ok: true, seconds: Math.round(n * 60) };
}

export function quantityRemaining(input: {
  quantityReceived: number;
  quantityUsed: number;
}): number {
  return Math.max(0, input.quantityReceived - input.quantityUsed);
}
