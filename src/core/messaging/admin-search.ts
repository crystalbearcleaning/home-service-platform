// Pure search/filter for the Phase 3D Message Automations list. Kept
// pure so the page can pass any list shape and the unit tests don't
// need a database.

export type AutomationSearchable = {
  automationKey: string;
  name: string;
  description: string | null;
};

// Splits the raw user input into trimmed lowercased tokens. Multiple
// tokens are AND-ed (every token must match somewhere in the row).
export function tokenizeSearch(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function automationMatches<T extends AutomationSearchable>(
  row: T,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    row.automationKey,
    row.name,
    row.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function filterAutomations<T extends AutomationSearchable>(
  rows: T[],
  query: string | null | undefined,
): T[] {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) return rows;
  return rows.filter((r) => automationMatches(r, tokens));
}
