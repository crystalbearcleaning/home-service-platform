import { describe, it, expect } from "vitest";
import { buildQuoteOutput } from "./quote";
import { DEFAULT_PRICING_CONFIG } from "./pricing";
import type { LoadedConfig, QuoteCalculationInput } from "./types";

// Test-only loaded config so the orchestrator can be exercised without
// a real Supabase round-trip.
const FAKE_CONFIG: LoadedConfig = {
  pricing: DEFAULT_PRICING_CONFIG,
  services: {
    exterior: {
      id: "00000000-0000-0000-0000-0000000000e1",
      service_code: "EXT_WINDOW",
      name: "Exterior Window Cleaning",
      is_base_service: true,
      is_add_on: false,
    },
    interior: {
      id: "00000000-0000-0000-0000-0000000000e2",
      service_code: "INT_WINDOW",
      name: "Interior Window Cleaning",
      is_base_service: false,
      is_add_on: true,
    },
  },
  plans: {
    one_time: {
      id: "00000000-0000-0000-0000-000000000a01",
      key: "one_time",
      name: "One-Time Clean",
      display_label: "One-Time",
      frequency_months: null,
      is_recommended: false,
      sort_order: 10,
    },
    six_month: {
      id: "00000000-0000-0000-0000-000000000a02",
      key: "six_month",
      name: "Every 6 Months",
      display_label: "Every 6 Months",
      frequency_months: 6,
      is_recommended: false,
      sort_order: 20,
    },
    three_month: {
      id: "00000000-0000-0000-0000-000000000a03",
      key: "three_month",
      name: "Every 3 Months",
      display_label: "Every 3 Months",
      frequency_months: 3,
      is_recommended: true,
      sort_order: 30,
    },
  },
  priceRulesUsed: [
    "minimum",
    "base_exterior",
    "one_time_exterior",
    "six_month_exterior",
    "three_month_exterior",
    "interior_add_on",
  ],
};

const VALID_INPUT: QuoteCalculationInput = {
  businessId: "00000000-0000-0000-0000-0000000000b1",
  square_footage: 2500,
  property_data_status: "found",
};

describe("buildQuoteOutput", () => {
  it("returns three options + one add-on for a normal home", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.can_quote).toBe(true);
    expect(out.manual_quote_required).toBe(false);
    expect(out.reason).toBeNull();
    expect(out.options).toHaveLength(3);
    expect(out.add_ons).toHaveLength(1);
  });

  it("no option is selected by default", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.selected_option_key).toBeNull();
    expect(out.selected_add_ons).toEqual([]);
    expect(out.options.every((o) => !("selected" in o))).toBe(true);
  });

  it("3-month plan is flagged as recommended", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    const threeMonth = out.options.find((o) => o.option_key === "three_month");
    expect(threeMonth?.is_recommended).toBe(true);
    const oneTime = out.options.find((o) => o.option_key === "one_time");
    expect(oneTime?.is_recommended).toBe(false);
  });

  it("recurring options use 'per visit' suffix in price_label", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(
      out.options.find((o) => o.option_key === "one_time")?.price_label,
    ).toBe("$250");
    expect(
      out.options.find((o) => o.option_key === "six_month")?.price_label,
    ).toBe("$225 per visit");
    expect(
      out.options.find((o) => o.option_key === "three_month")?.price_label,
    ).toBe("$200 per visit");
  });

  it("interior add-on price label mentions the +$ amount", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.add_ons[0]?.display_label).toBe(
      "Add Interior Window Cleaning to This Cleaning: +$125",
    );
    expect(out.add_ons[0]?.price).toBe(125);
  });

  it("price_snapshot mirrors the three option prices + interior", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.price_snapshot).toEqual({
      currency: "USD",
      minimum_price: 199,
      options: { one_time: 250, six_month: 225, three_month: 200 },
      add_ons: { interior_window_cleaning: 125 },
    });
  });

  it("line_items_snapshot has all four entries with kinds", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.line_items_snapshot).toHaveLength(4);
    const kinds = out.line_items_snapshot?.map((li) => li.kind);
    expect(kinds).toEqual([
      "option_exterior",
      "option_exterior",
      "option_exterior",
      "add_on",
    ]);
  });

  it("calculation_snapshot includes every expected field", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    const snap = out.calculation_snapshot;
    expect(snap.square_footage).toBe(2500);
    expect(snap.base_exterior_before_minimum).toBe(250);
    expect(snap.minimum_price).toBe(199);
    expect(snap.six_month_multiplier).toBe(0.9);
    expect(snap.three_month_multiplier).toBe(0.8);
    expect(snap.interior_multiplier).toBe(0.5);
    expect(snap.rounding).toBe("nearest_dollar");
    expect(snap.price_rules_used).toContain("base_exterior");
    expect(snap.minimum_applied).toEqual({
      one_time: false,
      six_month: false,
      three_month: false,
      interior_add_on: false,
    });
    expect(typeof snap.generated_at).toBe("string");
    expect(new Date(snap.generated_at).toString()).not.toBe("Invalid Date");
  });

  it("emits a warning when the minimum is applied", () => {
    const out = buildQuoteOutput(
      { ...VALID_INPUT, square_footage: 1000 },
      FAKE_CONFIG,
    );
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings.join(" ")).toMatch(/Minimum price/);
    expect(out.price_snapshot?.options.one_time).toBe(199);
    expect(out.calculation_snapshot.minimum_applied.one_time).toBe(true);
  });

  it("stamps source_plugin_key and version", () => {
    const out = buildQuoteOutput(VALID_INPUT, FAKE_CONFIG);
    expect(out.source_plugin_key).toBe("window_cleaning_auto_quote");
    expect(out.source_plugin_version).toBe("0.1.0");
  });

  it("respects an override source_plugin_version", () => {
    const out = buildQuoteOutput(
      { ...VALID_INPUT, source_plugin_version: "0.2.0-alpha" },
      FAKE_CONFIG,
    );
    expect(out.source_plugin_version).toBe("0.2.0-alpha");
  });
});

// ---------------------------------------------------------------------------
// Manual-quote fallback shape — exercise it via the manualQuoteOutput
// branch by hitting `calculateWindowCleaningQuote` directly (no DB
// roundtrip needed because the loader is short-circuited before it).
// ---------------------------------------------------------------------------
import { calculateWindowCleaningQuote } from "./quote";

describe("calculateWindowCleaningQuote — manual-quote fallback", () => {
  it("returns manual_quote_required when square_footage is null", async () => {
    const result = await calculateWindowCleaningQuote({
      businessId: "00000000-0000-0000-0000-0000000000b1",
      square_footage: null,
      property_data_status: "found",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.can_quote).toBe(false);
    expect(result.data.manual_quote_required).toBe(true);
    expect(result.data.options).toEqual([]);
    expect(result.data.add_ons).toEqual([]);
    expect(result.data.selected_option_key).toBeNull();
    expect(result.data.reason).toMatch(/square_footage/);
  });

  it("returns manual_quote_required when property_data_status is 'missing'", async () => {
    const result = await calculateWindowCleaningQuote({
      businessId: "00000000-0000-0000-0000-0000000000b1",
      square_footage: 1800,
      property_data_status: "missing",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.manual_quote_required).toBe(true);
    expect(result.data.reason).toMatch(/property_data_status/);
  });

  it("returns INVALID_INPUT when businessId is missing", async () => {
    const result = await calculateWindowCleaningQuote({
      // @ts-expect-error - testing runtime guard
      businessId: undefined,
      square_footage: 1800,
      property_data_status: "found",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects non-positive square_footage as missing", async () => {
    const result = await calculateWindowCleaningQuote({
      businessId: "00000000-0000-0000-0000-0000000000b1",
      square_footage: 0,
      property_data_status: "found",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.manual_quote_required).toBe(true);
  });

  it("manual-fallback output still stamps plugin key + version", async () => {
    const result = await calculateWindowCleaningQuote({
      businessId: "00000000-0000-0000-0000-0000000000b1",
      square_footage: null,
      property_data_status: "missing",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source_plugin_key).toBe("window_cleaning_auto_quote");
    expect(result.data.source_plugin_version).toBe("0.1.0");
  });
});
