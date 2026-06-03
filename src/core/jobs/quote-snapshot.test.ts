import { describe, expect, it } from "vitest";

import {
  buildQuoteJobTitle,
  parseQuoteLineItemsSnapshot,
} from "./quote-snapshot";

// The full pricing grid the Phase 1 Auto-Quote Plugin writes into
// `quotes.line_items_snapshot`: every option + every add-on. The
// customer picks one option (and optional add-ons); the job should
// snapshot only the selection, not the whole grid.
const FULL_PRICING_GRID = [
  {
    option_key: "one_time",
    label: "One-Time Cleaning",
    amount: 250,
    kind: "option_exterior",
  },
  {
    option_key: "six_month",
    label: "Every 6 Months — Exterior",
    amount: 225,
    kind: "option_exterior",
  },
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
];

describe("parseQuoteLineItemsSnapshot — selection filtering (Phase 9E bugfix)", () => {
  it("copies ONLY the selected option (not every option) when no add-ons are selected", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "three_month",
      selectedAddOns: [],
      selectedTotalDollars: 200,
    });
    expect(r.source).toBe("line_items_snapshot");
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]).toMatchObject({
      name: "Every 3 Months — Exterior",
      unitPriceCents: 20000,
      totalCents: 20000,
      source: "quote",
    });
    // No "One-Time", "Every 6 Months", or interior add-on rows.
    const names = r.lineItems.map((li) => li.name);
    expect(names).not.toContain("One-Time Cleaning");
    expect(names).not.toContain("Every 6 Months — Exterior");
    expect(names).not.toContain("Interior Window Cleaning");
  });

  it("includes a selected add-on alongside the selected option", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "three_month",
      selectedAddOns: [
        {
          add_on_key: "interior_window_cleaning",
          service_id: "svc-abc",
          price: 125,
        },
      ],
      selectedTotalDollars: 325,
    });
    expect(r.source).toBe("line_items_snapshot");
    expect(r.lineItems).toHaveLength(2);
    expect(r.lineItems[0]?.name).toBe("Every 3 Months — Exterior");
    expect(r.lineItems[1]?.name).toBe("Interior Window Cleaning");

    const total = r.lineItems.reduce((sum, li) => sum + li.totalCents, 0);
    expect(total).toBe(32500);
    // And matches selected_total when consistent.
    expect(total).toBe(Math.round(325 * 100));
  });

  it("omits all add-ons when selectedAddOns is empty (the original bug)", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "three_month",
      selectedAddOns: [],
      selectedTotalDollars: 200,
    });
    expect(r.lineItems.map((li) => li.name)).not.toContain(
      "Interior Window Cleaning",
    );
  });

  it("omits all add-ons when selectedAddOns is missing / ambiguous (never include all by default)", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "six_month",
      // selectedAddOns intentionally omitted.
      selectedTotalDollars: 225,
    });
    expect(r.source).toBe("line_items_snapshot");
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]?.name).toBe("Every 6 Months — Exterior");
  });

  it("accepts selectedAddOns as a bare string-array shape too", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "one_time",
      selectedAddOns: ["interior_window_cleaning"],
      selectedTotalDollars: 375,
    });
    expect(r.lineItems).toHaveLength(2);
    expect(r.lineItems[0]?.name).toBe("One-Time Cleaning");
    expect(r.lineItems[1]?.name).toBe("Interior Window Cleaning");
  });

  it("ignores a selectedAddOn whose key has no matching add_on row in the snapshot", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "one_time",
      selectedAddOns: [{ add_on_key: "gutter_cleaning", price: 80 }],
      selectedTotalDollars: 250,
    });
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]?.name).toBe("One-Time Cleaning");
  });
});

describe("parseQuoteLineItemsSnapshot — fallback paths", () => {
  it("falls back to selected_total when no selected_option_key is set even though the snapshot has rows", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      // selectedOptionKey intentionally null — the old behaviour was
      // to blindly copy every row; the fix routes to the safe fallback.
      selectedOptionKey: null,
      selectedTotalDollars: 199,
    });
    expect(r.source).toBe("selected_total_fallback");
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]?.unitPriceCents).toBe(19900);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("falls back to selected_total when selected_option_key does not match any snapshot row", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: FULL_PRICING_GRID,
      selectedOptionKey: "mystery_option",
      selectedTotalDollars: 199,
    });
    expect(r.source).toBe("selected_total_fallback");
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]?.unitPriceCents).toBe(19900);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("falls back to selected_total + option label when snapshot is null", () => {
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

  it("returns 'empty' source when nothing is usable", () => {
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
        selectedAddOns: { also: "wrong" } as unknown,
      }),
    ).not.toThrow();
  });

  it("accepts selectedTotalDollars as a numeric string", () => {
    const r = parseQuoteLineItemsSnapshot({
      lineItemsSnapshot: null,
      selectedTotalDollars: "199.99",
    });
    if (r.source !== "selected_total_fallback") throw new Error("expected fallback");
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
