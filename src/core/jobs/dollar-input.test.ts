import { describe, expect, it } from "vitest";

import { parseDollarsToCents } from "@/core/door-hanger/calculations";

// The Phase 9D server actions accept `unitPriceDollars: string` from
// the form and convert to bigint cents at the boundary via
// `parseDollarsToCents`. These tests pin the dollar-string semantics
// the form relies on (empty → null cents; numeric → rounded cents;
// negative → reason='NEGATIVE'; junk → reason='NOT_A_NUMBER').

describe("parseDollarsToCents — Phase 9D form boundary", () => {
  it("converts a plain dollar string to cents", () => {
    const r = parseDollarsToCents("249");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.cents).toBe(24900);
  });

  it("converts a fractional dollar string to cents", () => {
    const r = parseDollarsToCents("199.99");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.cents).toBe(19999);
  });

  it("treats empty / whitespace as null cents (Phase 9D form 'unset' signal)", () => {
    const r1 = parseDollarsToCents("");
    const r2 = parseDollarsToCents("   ");
    if (!r1.ok || !r2.ok) throw new Error("expected ok");
    expect(r1.cents).toBeNull();
    expect(r2.cents).toBeNull();
  });

  it("strips $ + commas + whitespace", () => {
    const r = parseDollarsToCents(" $1,234.50 ");
    if (!r.ok) throw new Error("unreachable");
    expect(r.cents).toBe(123450);
  });

  it("rejects negative inputs with reason NEGATIVE", () => {
    const r = parseDollarsToCents("-10");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("NEGATIVE");
  });

  it("rejects non-numeric input with reason NOT_A_NUMBER", () => {
    const r = parseDollarsToCents("not-a-number");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("NOT_A_NUMBER");
  });
});
