// Phase 9B — pure quote → job_line_items parser.
//
// Source of truth:
//   docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md §15
//
// Reads the existing `quotes.line_items_snapshot` jsonb shape written
// by the Phase 1 Auto-Quote Plugin
// (`src/plugins/window-cleaning-auto-quote/types.ts → LineItem`):
//
//   { option_key: string, label: string, amount: number, kind: string }
//
// `amount` is in dollars (numeric). The job snapshot lives in cents.
// `* 100` happens here at the boundary.
//
// Falls back to a single line item built from `selected_total` +
// `selected_option_key` (mapped against `options_snapshot`) when the
// per-item snapshot is missing / unusable. Always returns at least one
// line item when the quote has any non-zero monetary signal at all.
// Never throws.
//
// No DB, no env, no `server-only`. Safe to import from anywhere.

export type ParsedQuoteLineItem = {
  name: string;
  description: string | null;
  quantity: 1;
  unitPriceCents: number;
  totalCents: number;
  // Snapshot does not carry a reliable service_id; left null so the
  // job_line_items row honours the FK ON DELETE SET NULL contract.
  serviceId: null;
  sortOrder: number;
  source: "quote";
};

export type ParseQuoteLineItemsResult = {
  lineItems: ParsedQuoteLineItem[];
  warnings: string[];
  source: "line_items_snapshot" | "selected_total_fallback" | "empty";
};

export type QuoteSnapshotInput = {
  // Direct DB row values (caller pulls these off the quotes row).
  lineItemsSnapshot: unknown;
  optionsSnapshot?: unknown;
  selectedOptionKey?: string | null;
  selectedTotalDollars?: number | string | null;
  // Defaults to "Quoted work" when nothing better can be derived.
  fallbackTitle?: string;
};

const FALLBACK_TITLE = "Quoted work";

export function parseQuoteLineItemsSnapshot(
  input: QuoteSnapshotInput,
): ParseQuoteLineItemsResult {
  const warnings: string[] = [];

  // 1) Preferred path — array of {option_key, label, amount, kind}.
  if (Array.isArray(input.lineItemsSnapshot)) {
    const items: ParsedQuoteLineItem[] = [];
    let sortOrder = 0;
    for (const raw of input.lineItemsSnapshot) {
      const parsed = tryParseLineItemRow(raw, sortOrder);
      if (parsed) {
        items.push(parsed);
        sortOrder += 1;
      } else {
        warnings.push(
          "A quote line item could not be parsed and was skipped.",
        );
      }
    }
    if (items.length > 0) {
      return {
        lineItems: items,
        warnings,
        source: "line_items_snapshot",
      };
    }
    warnings.push(
      "Quote line_items_snapshot was empty or contained only unusable entries; falling back to selected_total.",
    );
  } else if (
    input.lineItemsSnapshot !== null &&
    input.lineItemsSnapshot !== undefined
  ) {
    warnings.push(
      "Quote line_items_snapshot was not a JSON array; falling back to selected_total.",
    );
  }

  // 2) Fallback — one line item from selected_total + option label.
  const fallbackCents = dollarsToCents(input.selectedTotalDollars);
  if (fallbackCents === null) {
    warnings.push(
      "Quote has no usable selected_total; conversion produced zero line items.",
    );
    return { lineItems: [], warnings, source: "empty" };
  }

  const label = resolveOptionLabel(
    input.selectedOptionKey ?? null,
    input.optionsSnapshot,
  );
  const fallbackName = label ?? input.fallbackTitle ?? FALLBACK_TITLE;

  return {
    lineItems: [
      {
        name: fallbackName,
        description:
          input.selectedOptionKey && label
            ? `Quote option: ${input.selectedOptionKey}`
            : null,
        quantity: 1,
        unitPriceCents: fallbackCents,
        totalCents: fallbackCents,
        serviceId: null,
        sortOrder: 0,
        source: "quote",
      },
    ],
    warnings,
    source: "selected_total_fallback",
  };
}

// Pure helper used by createJobFromQuote — builds the job's title from
// the same fields the parser consults. Centralised so the title and
// line items stay consistent.
export function buildQuoteJobTitle(input: {
  selectedOptionKey?: string | null;
  optionsSnapshot?: unknown;
  contactFullName?: string | null;
  fallbackTitle?: string;
}): string {
  const label = resolveOptionLabel(
    input.selectedOptionKey ?? null,
    input.optionsSnapshot,
  );
  if (label && label.trim().length > 0) return label.trim();
  const name = (input.contactFullName ?? "").trim();
  if (name.length > 0) return `${name} — Job`;
  return input.fallbackTitle ?? FALLBACK_TITLE;
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function tryParseLineItemRow(
  raw: unknown,
  sortOrder: number,
): ParsedQuoteLineItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const label = pickFirstString(r.label, r.name);
  if (!label) return null;

  const dollars = pickFirstNumber(r.amount, r.price, r.total);
  if (dollars === null) return null;

  const cents = dollarsToCentsFromNumber(dollars);
  if (cents === null) return null;

  const description = pickFirstString(r.description, r.kind, r.option_key);

  return {
    name: label.trim(),
    description: description ? description.trim() : null,
    quantity: 1,
    unitPriceCents: cents,
    totalCents: cents,
    serviceId: null,
    sortOrder,
    source: "quote",
  };
}

function pickFirstString(
  ...values: ReadonlyArray<unknown>
): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

function pickFirstNumber(
  ...values: ReadonlyArray<unknown>
): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length === 0) continue;
      const n = Number(trimmed.replace(/[$,\s]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function dollarsToCents(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
  return dollarsToCentsFromNumber(n);
}

function dollarsToCentsFromNumber(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 100);
}

function resolveOptionLabel(
  optionKey: string | null,
  optionsSnapshot: unknown,
): string | null {
  if (!optionKey) return null;
  if (!Array.isArray(optionsSnapshot)) return null;
  for (const raw of optionsSnapshot) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const k = typeof r.option_key === "string" ? r.option_key : null;
    if (k !== optionKey) continue;
    const label = pickFirstString(r.display_label, r.label, r.name);
    if (label) return label;
  }
  return null;
}
