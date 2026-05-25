// Pure search/filter for the Phase 4D Quotes list. Mirrors the
// contacts + automations helpers — AND-token semantics across contact
// fields + property address, plus a single optional status filter.

export type QuoteSearchable = {
  status: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  propertyAddress: string | null;
};

export const QUOTE_STATUS_VALUES = [
  "draft",
  "submitted",
  "expired",
  "void",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUS_VALUES)[number];

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUS_VALUES as readonly string[]).includes(value);
}

export function tokenizeQuoteSearch(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function quoteMatchesSearch<T extends QuoteSearchable>(
  row: T,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    row.contactName ?? "",
    row.contactEmail ?? "",
    row.contactPhone ?? "",
    row.propertyAddress ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function quoteMatchesStatus<T extends QuoteSearchable>(
  row: T,
  status: string | null | undefined,
): boolean {
  if (!status || status.length === 0 || status === "all") return true;
  return row.status === status;
}

export function filterQuotes<T extends QuoteSearchable>(
  rows: T[],
  input: { query?: string | null; status?: string | null },
): T[] {
  const tokens = tokenizeQuoteSearch(input.query);
  const status = input.status ?? null;
  if (tokens.length === 0 && (!status || status === "all")) return rows;
  return rows.filter(
    (r) => quoteMatchesSearch(r, tokens) && quoteMatchesStatus(r, status),
  );
}
