import { describe, it, expect } from "vitest";
import {
  calculatePrices,
  DEFAULT_PRICING_CONFIG,
  parsePriceRules,
  REQUIRED_PRICE_RULE_KEYS,
} from "./pricing";

// ---------------------------------------------------------------------------
// calculatePrices — pure math
// ---------------------------------------------------------------------------
describe("calculatePrices", () => {
  it("typical 2,500 sqft home picks formula prices, not minimum", () => {
    const result = calculatePrices(2500, DEFAULT_PRICING_CONFIG);
    // base = 2500 * 0.10 = 250
    expect(result.base_exterior_before_minimum).toBe(250);
    // one_time = max(250, 199) = 250 -> rounded 250
    expect(result.one_time_exterior).toBe(250);
    // six_month = max(250 * 0.90, 199) = 225 -> rounded 225
    expect(result.six_month_exterior).toBe(225);
    // three_month = max(250 * 0.80, 199) = 200 -> rounded 200
    expect(result.three_month_exterior).toBe(200);
    // interior = round(250 * 0.50) = 125
    expect(result.interior_add_on).toBe(125);
    expect(result.minimum_applied.one_time).toBe(false);
    expect(result.minimum_applied.six_month).toBe(false);
    expect(result.minimum_applied.three_month).toBe(false);
  });

  it("uses the 0.90 multiplier for the 6-month option", () => {
    const result = calculatePrices(3000, DEFAULT_PRICING_CONFIG);
    // base 300, six_month = round(300 * 0.90) = 270
    expect(result.six_month_exterior).toBe(270);
  });

  it("uses the 0.80 multiplier for the 3-month option", () => {
    const result = calculatePrices(3000, DEFAULT_PRICING_CONFIG);
    // base 300, three_month = round(300 * 0.80) = 240
    expect(result.three_month_exterior).toBe(240);
  });

  it("interior add-on uses the rounded one_time * 0.50", () => {
    const result = calculatePrices(2347, DEFAULT_PRICING_CONFIG);
    // base = 234.70; one_time = round(max(234.70, 199)) = 235
    // interior = round(235 * 0.50) = 118
    expect(result.one_time_exterior).toBe(235);
    expect(result.interior_add_on).toBe(118);
  });

  it("applies minimum to all three options for a small home (1,000 sqft)", () => {
    const result = calculatePrices(1000, DEFAULT_PRICING_CONFIG);
    // base = 100. one_time max(100, 199) = 199.
    // six_month max(90, 199) = 199. three_month max(80, 199) = 199.
    expect(result.one_time_exterior).toBe(199);
    expect(result.six_month_exterior).toBe(199);
    expect(result.three_month_exterior).toBe(199);
    expect(result.minimum_applied.one_time).toBe(true);
    expect(result.minimum_applied.six_month).toBe(true);
    expect(result.minimum_applied.three_month).toBe(true);
    // interior = round(199 * 0.50) = 100 (Math.round half-to-even → 99.5 -> 100)
    expect(result.interior_add_on).toBe(100);
  });

  it("partial minimum: large enough for one_time but not six/three_month", () => {
    // sqft where base*0.90 < 199 but base*1.0 > 199
    // base*0.90 = 199 -> base = 221.11; pick sqft 2100 -> base 210
    //   one_time max(210, 199) = 210 (no minimum)
    //   six_month max(189, 199) = 199 (minimum applied)
    //   three_month max(168, 199) = 199 (minimum applied)
    const result = calculatePrices(2100, DEFAULT_PRICING_CONFIG);
    expect(result.one_time_exterior).toBe(210);
    expect(result.minimum_applied.one_time).toBe(false);
    expect(result.six_month_exterior).toBe(199);
    expect(result.minimum_applied.six_month).toBe(true);
    expect(result.three_month_exterior).toBe(199);
    expect(result.minimum_applied.three_month).toBe(true);
  });

  it("rounds to the nearest whole dollar when rounding=nearest_dollar", () => {
    // 2347 sqft -> base 234.70 -> all option prices are non-integers
    const result = calculatePrices(2347, DEFAULT_PRICING_CONFIG);
    expect(Number.isInteger(result.one_time_exterior)).toBe(true);
    expect(Number.isInteger(result.six_month_exterior)).toBe(true);
    expect(Number.isInteger(result.three_month_exterior)).toBe(true);
    expect(Number.isInteger(result.interior_add_on)).toBe(true);
    // 234.70 -> rounds to 235
    expect(result.one_time_exterior).toBe(235);
    // 234.70 * 0.90 = 211.23 -> 211
    expect(result.six_month_exterior).toBe(211);
    // 234.70 * 0.80 = 187.76 < 199 -> 199
    expect(result.three_month_exterior).toBe(199);
  });

  it("leaves prices unrounded when rounding=none", () => {
    const config = { ...DEFAULT_PRICING_CONFIG, rounding: "none" as const };
    const result = calculatePrices(2347, config);
    // 234.70, no minimum applied
    expect(result.one_time_exterior).toBeCloseTo(234.7);
    expect(result.six_month_exterior).toBeCloseTo(211.23);
    expect(result.interior_add_on).toBeCloseTo(234.7 * 0.5);
  });

  it("interior_add_on minimum_applied is always false (it follows one_time)", () => {
    const result = calculatePrices(500, DEFAULT_PRICING_CONFIG);
    expect(result.minimum_applied.interior_add_on).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePriceRules — DB row parser
// ---------------------------------------------------------------------------

function rule(key: string, ruleType: string, ruleConfig: unknown) {
  return { key, rule_type: ruleType, rule_config: ruleConfig };
}

const SEEDED_RULES = [
  rule("minimum", "minimum", { min_price: 199, currency: "USD" }),
  rule("base_exterior", "formula", { formula: "sqft * 0.10", rounding: "none" }),
  rule("one_time_exterior", "formula", {
    formula: "max(base_exterior, 199)",
    multiplier: 1.0,
    rounding: "nearest_dollar",
  }),
  rule("six_month_exterior", "formula", {
    formula: "max(base_exterior * 0.90, 199)",
    multiplier: 0.9,
    rounding: "nearest_dollar",
  }),
  rule("three_month_exterior", "formula", {
    formula: "max(base_exterior * 0.80, 199)",
    multiplier: 0.8,
    rounding: "nearest_dollar",
  }),
  rule("interior_add_on", "add_on", {
    formula: "one_time_exterior * 0.50",
    multiplier: 0.5,
    rounding: "nearest_dollar",
  }),
];

describe("parsePriceRules", () => {
  it("parses the seeded Phase 1 rules into a typed config", () => {
    const result = parsePriceRules(SEEDED_RULES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual({
      minimum: 199,
      baseExteriorPerSqft: 0.1,
      oneTimeMultiplier: 1.0,
      sixMonthMultiplier: 0.9,
      threeMonthMultiplier: 0.8,
      interiorMultiplier: 0.5,
      rounding: "nearest_dollar",
    });
  });

  it("reports every missing required rule by key", () => {
    const result = parsePriceRules([SEEDED_RULES[0]!, SEEDED_RULES[1]!]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missingKeys?.sort()).toEqual(
      [
        "one_time_exterior",
        "six_month_exterior",
        "three_month_exterior",
        "interior_add_on",
      ].sort(),
    );
  });

  it("errors when minimum.min_price is missing", () => {
    const rules = SEEDED_RULES.map((r) =>
      r.key === "minimum" ? rule("minimum", "minimum", {}) : r,
    );
    const result = parsePriceRules(rules);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/minimum/);
  });

  it("errors when base_exterior formula can't be parsed", () => {
    const rules = SEEDED_RULES.map((r) =>
      r.key === "base_exterior"
        ? rule("base_exterior", "formula", { formula: "wat" })
        : r,
    );
    const result = parsePriceRules(rules);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/base_exterior/);
  });

  it("accepts an explicit per_sqft override on base_exterior", () => {
    const rules = SEEDED_RULES.map((r) =>
      r.key === "base_exterior"
        ? rule("base_exterior", "formula", {
            formula: "sqft * 0.10",
            per_sqft: 0.12,
          })
        : r,
    );
    const result = parsePriceRules(rules);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.baseExteriorPerSqft).toBe(0.12);
  });

  it("errors when a multiplier is missing on one of the plan rules", () => {
    const rules = SEEDED_RULES.map((r) =>
      r.key === "six_month_exterior"
        ? rule("six_month_exterior", "formula", {
            formula: "max(base_exterior * 0.90, 199)",
          })
        : r,
    );
    const result = parsePriceRules(rules);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/six_month_exterior/);
  });

  it("REQUIRED_PRICE_RULE_KEYS matches the documented Phase 1 set", () => {
    expect([...REQUIRED_PRICE_RULE_KEYS].sort()).toEqual(
      [
        "minimum",
        "base_exterior",
        "one_time_exterior",
        "six_month_exterior",
        "three_month_exterior",
        "interior_add_on",
      ].sort(),
    );
  });
});
