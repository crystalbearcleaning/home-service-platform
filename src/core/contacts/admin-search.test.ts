import { describe, expect, it } from "vitest";
import {
  contactMatches,
  filterContacts,
  tokenizeContactSearch,
} from "./admin-search";

const ROWS = [
  {
    fullName: "Jane Smith",
    phone: "+15615551234",
    email: "jane@example.com",
    addressesJoined: "8126 Valhalla Dr Boca Raton FL",
  },
  {
    fullName: "John Doe",
    phone: "+15615559999",
    email: "john@example.com",
    addressesJoined: "100 Ocean Ave Delray Beach FL",
  },
  {
    fullName: "Maria Garcia",
    phone: "+15615557777",
    email: "maria@crystalbear.com",
    addressesJoined: "",
  },
];

describe("tokenizeContactSearch", () => {
  it("returns empty for null / undefined / empty / whitespace", () => {
    expect(tokenizeContactSearch(null)).toEqual([]);
    expect(tokenizeContactSearch(undefined)).toEqual([]);
    expect(tokenizeContactSearch("")).toEqual([]);
    expect(tokenizeContactSearch("  ")).toEqual([]);
  });
  it("lowercases and splits on whitespace", () => {
    expect(tokenizeContactSearch("Jane  Smith")).toEqual(["jane", "smith"]);
  });
});

describe("contactMatches", () => {
  it("returns true for empty tokens", () => {
    expect(contactMatches(ROWS[0]!, [])).toBe(true);
  });
  it("matches against name", () => {
    expect(contactMatches(ROWS[0]!, ["jane"])).toBe(true);
  });
  it("matches against phone fragment", () => {
    expect(contactMatches(ROWS[1]!, ["5559999"])).toBe(true);
  });
  it("matches against email domain", () => {
    expect(contactMatches(ROWS[2]!, ["crystalbear"])).toBe(true);
  });
  it("matches against address", () => {
    expect(contactMatches(ROWS[0]!, ["valhalla"])).toBe(true);
  });
  it("AND semantics", () => {
    expect(contactMatches(ROWS[0]!, ["jane", "boca"])).toBe(true);
    expect(contactMatches(ROWS[0]!, ["jane", "delray"])).toBe(false);
  });
});

describe("filterContacts", () => {
  it("returns full list for empty query", () => {
    expect(filterContacts(ROWS, "")).toHaveLength(3);
    expect(filterContacts(ROWS, null)).toHaveLength(3);
  });
  it("filters by partial name", () => {
    const r = filterContacts(ROWS, "jane");
    expect(r.map((x) => x.fullName)).toEqual(["Jane Smith"]);
  });
  it("filters by partial address", () => {
    const r = filterContacts(ROWS, "delray");
    expect(r.map((x) => x.fullName)).toEqual(["John Doe"]);
  });
  it("returns empty when nothing matches", () => {
    expect(filterContacts(ROWS, "zzznope")).toEqual([]);
  });
});
