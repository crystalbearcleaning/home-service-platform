import { describe, expect, it } from "vitest";
import {
  filterQuotes,
  isQuoteStatus,
  QUOTE_STATUS_VALUES,
  quoteMatchesSearch,
  quoteMatchesStatus,
  tokenizeQuoteSearch,
} from "./admin-search";

const ROWS = [
  {
    status: "submitted",
    contactName: "Jane Smith",
    contactEmail: "jane@example.com",
    contactPhone: "+15615551234",
    propertyAddress: "8126 Valhalla Dr, Boca Raton",
  },
  {
    status: "submitted",
    contactName: "John Doe",
    contactEmail: "john@example.com",
    contactPhone: "+15615559999",
    propertyAddress: "100 Ocean Ave, Delray Beach",
  },
  {
    status: "expired",
    contactName: "Maria Garcia",
    contactEmail: "maria@crystalbear.com",
    contactPhone: "+15615557777",
    propertyAddress: null,
  },
  {
    status: "void",
    contactName: "Test User",
    contactEmail: "test@example.com",
    contactPhone: "+15615558888",
    propertyAddress: "999 Test St",
  },
];

describe("tokenizeQuoteSearch", () => {
  it("empty / whitespace / null → []", () => {
    expect(tokenizeQuoteSearch(null)).toEqual([]);
    expect(tokenizeQuoteSearch("")).toEqual([]);
    expect(tokenizeQuoteSearch("  ")).toEqual([]);
  });
  it("lowercases + splits", () => {
    expect(tokenizeQuoteSearch("Jane  Boca")).toEqual(["jane", "boca"]);
  });
});

describe("isQuoteStatus", () => {
  it("accepts every known status", () => {
    for (const s of QUOTE_STATUS_VALUES) expect(isQuoteStatus(s)).toBe(true);
  });
  it("rejects unknown / empty / casing variants", () => {
    expect(isQuoteStatus("Submitted")).toBe(false);
    expect(isQuoteStatus("")).toBe(false);
    expect(isQuoteStatus("nope")).toBe(false);
  });
});

describe("quoteMatchesSearch", () => {
  it("returns true for empty tokens", () => {
    expect(quoteMatchesSearch(ROWS[0]!, [])).toBe(true);
  });
  it("matches name / email / phone / address", () => {
    expect(quoteMatchesSearch(ROWS[0]!, ["jane"])).toBe(true);
    expect(quoteMatchesSearch(ROWS[1]!, ["john@"])).toBe(true);
    expect(quoteMatchesSearch(ROWS[2]!, ["5557777"])).toBe(true);
    expect(quoteMatchesSearch(ROWS[0]!, ["valhalla"])).toBe(true);
  });
  it("AND semantics — all tokens must match", () => {
    expect(quoteMatchesSearch(ROWS[0]!, ["jane", "boca"])).toBe(true);
    expect(quoteMatchesSearch(ROWS[0]!, ["jane", "delray"])).toBe(false);
  });
  it("tolerates null address / email / phone", () => {
    expect(quoteMatchesSearch(ROWS[2]!, ["maria"])).toBe(true);
  });
});

describe("quoteMatchesStatus", () => {
  it("null / empty / 'all' → match anything", () => {
    expect(quoteMatchesStatus(ROWS[0]!, null)).toBe(true);
    expect(quoteMatchesStatus(ROWS[0]!, "")).toBe(true);
    expect(quoteMatchesStatus(ROWS[0]!, "all")).toBe(true);
  });
  it("exact match on the status column", () => {
    expect(quoteMatchesStatus(ROWS[0]!, "submitted")).toBe(true);
    expect(quoteMatchesStatus(ROWS[0]!, "expired")).toBe(false);
  });
});

describe("filterQuotes", () => {
  it("returns the full list with no filters", () => {
    expect(filterQuotes(ROWS, {})).toHaveLength(4);
  });
  it("filters by search", () => {
    expect(filterQuotes(ROWS, { query: "delray" }).map((r) => r.contactName)).toEqual(["John Doe"]);
  });
  it("filters by status", () => {
    expect(filterQuotes(ROWS, { status: "expired" })).toHaveLength(1);
    expect(filterQuotes(ROWS, { status: "void" })).toHaveLength(1);
    expect(filterQuotes(ROWS, { status: "submitted" })).toHaveLength(2);
  });
  it("combines search + status with AND", () => {
    expect(
      filterQuotes(ROWS, { query: "jane", status: "submitted" }),
    ).toHaveLength(1);
    expect(
      filterQuotes(ROWS, { query: "jane", status: "expired" }),
    ).toHaveLength(0);
  });
});
