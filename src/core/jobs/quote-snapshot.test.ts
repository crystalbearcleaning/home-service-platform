import { describe, expect, it } from "vitest";

import {
  buildQuoteJobTitle,
  parseQuoteLineItemsSnapshot,
} from "./quote-snapshot";

describe("parseQuoteLineItemsSnapshot", () => {
  it("parses a well-formed Auto-Quote LineItem array (dollars → cents)", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: [
        {
          option_key: "three_month",
          label: "Every 3 Months — Exterior",
          amount: 200,
          kind: "option_exterior",
        },
        {
          option_key: "interior_window_cleaning",
          label: "Interior Window Cleaning",
          amount: 125,
          kind: "add_on",
        },
      ],
    });
    expect(r.source).toBe("line_items_snapshot");
    expect(r.warnings).toEqual([]);
    expect(r.lineItems).toHaveLength(2);
    expect(r.lineItems[0]).toMatchObject({
      name: "Every 3 Months — Exterior",
      unitPriceCents: 20000,
      totalCents: 20000,
      source: "quote",
      sortOrder: 0,
      serviceId: null,
    });
    expect(r.lineItems[1]).toMatchObject({
      name: "Interior Window Cleaning",
      unitPriceCents: 12500,
      totalCents: 12500,
      sortOrder: 1,
    });
  });

  it("falls back to selected_total + option label when snapshot is missing", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: null,
      selectedTotalDollars: 249,
      selectedOptionKey: "three_month",
      optionsSnapshot: [
        {
          option_key: "three_month",
          display_label: "Every 3 Months — Recommended",
        },
      ],
    });
    expect(r.source).toBe("selected_total_fallback");
    // No warning for the clean null-snapshot case (older quotes).
    expect(r.warnings).toEqual([]);
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]).toMatchObject({
      name: "Every 3 Months — Recommended",
      unitPriceCents: 24900,
      totalCents: 24900,
    });
  });

  it("falls back to selected_total when snapshot is malformed", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: "not-an-array",
      selectedTotalDollars: 199,
      selectedOptionKey: null,
    });
    expect(r.source).toBe("selected_total_fallback");
    expect(r.lineItems[0]?.name).toBe("Quoted work");
    expect(r.lineItems[0]?.unitPriceCents).toBe(19900);
  });

  it("falls back to selected_total when snapshot is empty", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: [],
      selectedTotalDollars: 99,
    });
    expect(r.source).toBe("selected_total_fallback");
    expect(r.lineItems[0]?.unitPriceCents).toBe(9900);
  });

  it("skips individual unparseable rows but keeps the good ones", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: [
        { label: "Good", amount: 100, kind: "option_exterior" },
        { label: "", amount: 50, kind: "option_exterior" }, // bad: empty label
        { label: "Negative", amount: -10 }, // bad: negative amount
        { label: "Stringy", amount: "$75.50" }, // good: parses
      ],
    });
    expect(r.source).toBe("line_items_snapshot");
    expect(r.lineItems).toHaveLength(2);
    expect(r.warnings.length).toBe(2);
    expect(r.lineItems.map((li) => li.name)).toEqual(["Good", "Stringy"]);
    expect(r.lineItems[1]?.unitPriceCents).toBe(7550);
  });

  it("returns 'empty' source when neither snapshot nor selected_total is usable", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: null,
      selectedTotalDollars: null,
    });
    expect(r.source).toBe("empty");
    expect(r.lineItems).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never throws on garbage input", () => {
    expect(() =>
      parseQuoteLineItemsSnapshot({
        lineItemsSnapshot: { not: "an array" } as unknown,
        selectedTotalDollars: "not-a-number",
      }),
    ).not.toThrow();
  });

  it("accepts selectedTotalDollars as a numeric string", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: null,
      selectedTotalDollars: "199.99",
    });
    if (r.source !== "selected_total_fallback") throw new Error("expected fallback");
    // Math.round(199.99 * 100) = 19999
    expect(r.lineItems[0]?.unitPriceCents).toBe(19999);
  });
});

describe("buildQuoteJobTitle", () => {
  it("prefers the option label from options_snapshot", () => {
    const t = buildQuoteJobTitle({
      selectedOptionKey: "three_month",
      optionsSnapshot: [
        {
          option_key: "three_month",
          display_label: "Every 3 Months — Recommended",
        },
      ],
      contactFullName: "Smith",
    });
    expect(t).toBe("Every 3 Months — Recommended");
  });

  it("falls back to '{contact} — Job' when no option label", () => {
    const t = buildQuoteJobTitle({
      selectedOptionKey: null,
      contactFullName: "Smith",
    });
    expect(t).toBe("Smith — Job");
  });

  it("falls back to the default when nothing is available", () => {
    const t = buildQuoteJobTitle({ selectedOptionKey: null });
    expect(t).toBe("Quoted work");
  });
});
