import { describe, expect, it } from "vitest";

import { computeJobEstimatedTotal, computeJobLineItemTotal } from "./totals";

describe("computeJobLineItemTotal", () => {
  it("returns rounded quantity × unitPriceCents", () => {
    expect(computeJobLineItemTotal({ quantity: 1, unitPriceCents: 24900 })).toBe(
      24900,
    );
    expect(computeJobLineItemTotal({ quantity: 2, unitPriceCents: 7500 })).toBe(
      15000,
    );
  });

  it("supports fractional quantity with rounding", () => {
    expect(
      computeJobLineItemTotal({ quantity: 1.5, unitPriceCents: 10000 }),
    ).toBe(15000);
    // 0.33 × 10000 = 3300 (already integer)
    expect(
      computeJobLineItemTotal({ quantity: 0.33, unitPriceCents: 10000 }),
    ).toBe(3300);
    // 0.333 truncated to 0.33 at the numeric(10,2) precision.
    expect(
      computeJobLineItemTotal({ quantity: 0.333, unitPriceCents: 10000 }),
    ).toBe(3300);
  });

  it("clamps negative + non-finite inputs to 0", () => {
    expect(
      computeJobLineItemTotal({ quantity: -1, unitPriceCents: 10000 }),
    ).toBe(0);
    expect(
      computeJobLineItemTotal({ quantity: 1, unitPriceCents: -100 }),
    ).toBe(0);
    expect(
      computeJobLineItemTotal({
        quantity: Number.NaN,
        unitPriceCents: 10000,
      }),
    ).toBe(0);
    expect(
      computeJobLineItemTotal({
        quantity: 1,
        unitPriceCents: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });

  it("zero quantity or unit price yields zero", () => {
    expect(computeJobLineItemTotal({ quantity: 0, unitPriceCents: 10000 })).toBe(
      0,
    );
    expect(computeJobLineItemTotal({ quantity: 5, unitPriceCents: 0 })).toBe(0);
  });
});

describe("computeJobEstimatedTotal", () => {
  it("sums positive integer totalCents", () => {
    expect(
      computeJobEstimatedTotal([
        { totalCents: 24900 },
        { totalCents: 15000 },
        { totalCents: 7500 },
      ]),
    ).toBe(47400);
  });

  it("returns 0 for empty / nullish lists", () => {
    expect(computeJobEstimatedTotal([])).toBe(0);
    expect(
      computeJobEstimatedTotal(
        null as unknown as ReadonlyArray<{ totalCents: number }>,
      ),
    ).toBe(0);
  });

  it("ignores negative / non-finite line totals", () => {
    expect(
      computeJobEstimatedTotal([
        { totalCents: 1000 },
        { totalCents: -500 },
        { totalCents: Number.NaN },
        { totalCents: 500 },
      ]),
    ).toBe(1500);
  });

  it("floors fractional line totals (defensive — DB stores bigint)", () => {
    expect(computeJobEstimatedTotal([{ totalCents: 99.7 }])).toBe(99);
  });
});
