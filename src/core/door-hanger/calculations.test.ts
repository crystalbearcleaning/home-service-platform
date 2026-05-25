import { describe, expect, it } from "vitest";
import {
  computeCostPerHangerCents,
  computeMaterialCostCents,
  formatCentsAsDollars,
  minutesToSeconds,
  parseDollarsToCents,
  quantityRemaining,
} from "./calculations";

describe("parseDollarsToCents", () => {
  it("returns null cents for empty / null / undefined", () => {
    expect(parseDollarsToCents(null)).toEqual({ ok: true, cents: null });
    expect(parseDollarsToCents(undefined)).toEqual({ ok: true, cents: null });
    expect(parseDollarsToCents("")).toEqual({ ok: true, cents: null });
    expect(parseDollarsToCents("   ")).toEqual({ ok: true, cents: null });
  });
  it("strips $/,/space then parses", () => {
    expect(parseDollarsToCents("$1,234.56")).toEqual({ ok: true, cents: 123456 });
    expect(parseDollarsToCents(" 42 ")).toEqual({ ok: true, cents: 4200 });
  });
  it("rounds floating-point noise to whole cents", () => {
    expect(parseDollarsToCents("0.1")).toEqual({ ok: true, cents: 10 });
    expect(parseDollarsToCents("19.995")).toEqual({ ok: true, cents: 2000 });
  });
  it("rejects non-numbers and negatives", () => {
    expect(parseDollarsToCents("abc").ok).toBe(false);
    expect(parseDollarsToCents("-5")).toEqual({ ok: false, reason: "NEGATIVE" });
  });
});

describe("formatCentsAsDollars", () => {
  it("formats with 2 decimals", () => {
    expect(formatCentsAsDollars(0)).toBe("$0.00");
    expect(formatCentsAsDollars(1234)).toBe("$12.34");
    expect(formatCentsAsDollars(123456)).toBe("$1234.56");
  });
  it("returns em-dash for null / undefined / non-finite", () => {
    expect(formatCentsAsDollars(null)).toBe("—");
    expect(formatCentsAsDollars(undefined)).toBe("—");
    expect(formatCentsAsDollars(Number.NaN)).toBe("—");
  });
});

describe("computeCostPerHangerCents", () => {
  it("returns total/qty rounded to cents", () => {
    expect(
      computeCostPerHangerCents({ totalPrintCostCents: 100000, quantityReceived: 500 }),
    ).toBe(200);
  });
  it("rounds half-up to nearest cent", () => {
    expect(
      computeCostPerHangerCents({ totalPrintCostCents: 100, quantityReceived: 3 }),
    ).toBe(33);
  });
  it("returns null when total cost missing", () => {
    expect(
      computeCostPerHangerCents({ totalPrintCostCents: null, quantityReceived: 500 }),
    ).toBeNull();
  });
  it("returns null when quantity is zero (no div-by-zero)", () => {
    expect(
      computeCostPerHangerCents({ totalPrintCostCents: 100, quantityReceived: 0 }),
    ).toBeNull();
  });
});

describe("computeMaterialCostCents", () => {
  it("returns hangers × cost_per_hanger", () => {
    expect(
      computeMaterialCostCents({ hangersDistributed: 50, costPerHangerCents: 200 }),
    ).toBe(10000);
  });
  it("returns null when cost_per_hanger is unknown", () => {
    expect(
      computeMaterialCostCents({ hangersDistributed: 50, costPerHangerCents: null }),
    ).toBeNull();
  });
  it("returns 0 for zero hangers when cost is known", () => {
    expect(
      computeMaterialCostCents({ hangersDistributed: 0, costPerHangerCents: 200 }),
    ).toBe(0);
  });
});

describe("minutesToSeconds", () => {
  it("converts minutes to seconds", () => {
    expect(minutesToSeconds("75")).toEqual({ ok: true, seconds: 4500 });
    expect(minutesToSeconds(2.5)).toEqual({ ok: true, seconds: 150 });
  });
  it("returns null seconds for empty / null", () => {
    expect(minutesToSeconds(null)).toEqual({ ok: true, seconds: null });
    expect(minutesToSeconds("")).toEqual({ ok: true, seconds: null });
  });
  it("rejects negatives + non-numbers", () => {
    expect(minutesToSeconds("-5").ok).toBe(false);
    expect(minutesToSeconds("abc").ok).toBe(false);
  });
});

describe("quantityRemaining", () => {
  it("returns received - used", () => {
    expect(quantityRemaining({ quantityReceived: 500, quantityUsed: 120 })).toBe(380);
  });
  it("floors at zero", () => {
    expect(quantityRemaining({ quantityReceived: 10, quantityUsed: 99 })).toBe(0);
  });
});
