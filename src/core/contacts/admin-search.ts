// Pure search/filter for the Phase 4 Contacts list. Mirrors the Phase
// 3D admin-search helper — AND-tokens across name / phone / email /
// every attached property address. Kept pure so the page can pass any
// list shape and unit tests don't need a database.

export type ContactSearchable = {
  fullName: string;
  phone: string;
  email: string;
  // Concatenated addresses (one per property) so a contact with
  // multiple properties matches a query for any of them.
  addressesJoined: string;
};

export function tokenizeContactSearch(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function contactMatches<T extends ContactSearchable>(
  row: T,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    row.fullName,
    row.phone,
    row.email,
    row.addressesJoined,
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function filterContacts<T extends ContactSearchable>(
  rows: T[],
  query: string | null | undefined,
): T[] {
  const tokens = tokenizeContactSearch(query);
  if (tokens.length === 0) return rows;
  return rows.filter((r) => contactMatches(r, tokens));
}
