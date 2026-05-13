import type { ParsedPricingConfig } from "./types";

// ---------------------------------------------------------------------------
// Pure pricing layer. No DB, no fetch, no env. Safe to unit-test in
// isolation and safe to import from any context (the orchestrator that
// touches Supabase is in quote.ts / config-loader.ts).
// ---------------------------------------------------------------------------

// Documented Phase 1 defaults (matches decision 0001 §1 and the seed).
// Exposed for tests and as a defensive fallback config consumers can
// pass in if they don't want to load from the DB.
export const DEFAULT_PRICING_CONFIG: ParsedPricingConfig = {
  minimum: 199,
  baseExteriorPerSqft: 0.1,
  oneTimeMultiplier: 1.0,
  sixMonthMultiplier: 0.9,
  threeMonthMultiplier: 0.8,
  interiorMultiplier: 0.5,
  rounding: "nearest_dollar",
};

// All Phase 1 price_rules keys, in the order the seed declares them.
export const REQUIRED_PRICE_RULE_KEYS = [
  "minimum",
  "base_exterior",
  "one_time_exterior",
  "six_month_exterior",
  "three_month_exterior",
  "interior_add_on",
] as const;

export type PriceRuleKey = (typeof REQUIRED_PRICE_RULE_KEYS)[number];

export type RawPriceRule = {
  key: string;
  rule_type: string;
  rule_config: unknown;
};

// ---------------------------------------------------------------------------
// Rule config parser
// ---------------------------------------------------------------------------
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asPositive(v: unknown): number | null {
  const n = asNumber(v);
  return n !== null && n > 0 ? n : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// Extract the per-sqft multiplier from base_exterior's rule_config.
// Prefers an explicit `per_sqft` / `multiplier` numeric field if the
// seed is ever updated; otherwise parses the documented `sqft * N`
// formula string. Returns null on any failure.
function readBaseExteriorPerSqft(config: unknown): number | null {
  const obj = asObject(config);
  if (!obj) return null;
  const explicit =
    asPositive(obj.per_sqft) ??
    asPositive(obj.per_sqft_multiplier) ??
    asPositive(obj.multiplier);
  if (explicit !== null) return explicit;
  const formula = asString(obj.formula);
  if (!formula) return null;
  const match = formula.match(/sqft\s*\*\s*([\d.]+)/i);
  if (!match || !match[1]) return null;
  return asPositive(Number.parseFloat(match[1]));
}

function readMultiplier(config: unknown): number | null {
  const obj = asObject(config);
  if (!obj) return null;
  return asNumber(obj.multiplier);
}

function readMinimum(config: unknown): number | null {
  const obj = asObject(config);
  if (!obj) return null;
  return asPositive(obj.min_price);
}

function readRounding(config: unknown): "nearest_dollar" | "none" {
  const obj = asObject(config);
  if (!obj) return "nearest_dollar";
  const value = asString(obj.rounding);
  return value === "none" ? "none" : "nearest_dollar";
}

export type ParsePriceRulesResult =
  | { ok: true; config: ParsedPricingConfig }
  | { ok: false; error: string; missingKeys?: string[] };

// Parse the rows pulled from core.price_rules into a typed
// ParsedPricingConfig. Returns a discriminated union so callers can
// surface specific errors (which rule key was missing / malformed).
export function parsePriceRules(rules: RawPriceRule[]): ParsePriceRulesResult {
  const byKey: Record<string, RawPriceRule> = {};
  for (const rule of rules) {
    byKey[rule.key] = rule;
  }

  const missingKeys = REQUIRED_PRICE_RULE_KEYS.filter((k) => !byKey[k]);
  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: `Missing required price_rules: ${missingKeys.join(", ")}`,
      missingKeys: [...missingKeys],
    };
  }

  const minimum = readMinimum(byKey.minimum!.rule_config);
  if (minimum === null) {
    return {
      ok: false,
      error: 'price_rules.minimum.rule_config.min_price is missing or invalid',
    };
  }

  const baseExteriorPerSqft = readBaseExteriorPerSqft(
    byKey.base_exterior!.rule_config,
  );
  if (baseExteriorPerSqft === null) {
    return {
      ok: false,
      error:
        'price_rules.base_exterior could not parse a positive per-sqft multiplier',
    };
  }

  const oneTimeMultiplier = readMultiplier(
    byKey.one_time_exterior!.rule_config,
  );
  if (oneTimeMultiplier === null) {
    return {
      ok: false,
      error: 'price_rules.one_time_exterior.rule_config.multiplier missing',
    };
  }

  const sixMonthMultiplier = readMultiplier(
    byKey.six_month_exterior!.rule_config,
  );
  if (sixMonthMultiplier === null) {
    return {
      ok: false,
      error: 'price_rules.six_month_exterior.rule_config.multiplier missing',
    };
  }

  const threeMonthMultiplier = readMultiplier(
    byKey.three_month_exterior!.rule_config,
  );
  if (threeMonthMultiplier === null) {
    return {
      ok: false,
      error: 'price_rules.three_month_exterior.rule_config.multiplier missing',
    };
  }

  const interiorMultiplier = readMultiplier(
    byKey.interior_add_on!.rule_config,
  );
  if (interiorMultiplier === null) {
    return {
      ok: false,
      error: 'price_rules.interior_add_on.rule_config.multiplier missing',
    };
  }

  // Rounding flag is per-rule in the seed; we read the one_time rule's
  // value as the authoritative project-wide rounding mode.
  const rounding = readRounding(byKey.one_time_exterior!.rule_config);

  return {
    ok: true,
    config: {
      minimum,
      baseExteriorPerSqft,
      oneTimeMultiplier,
      sixMonthMultiplier,
      threeMonthMultiplier,
      interiorMultiplier,
      rounding,
    },
  };
}

// ---------------------------------------------------------------------------
// Pure pricing math
// ---------------------------------------------------------------------------
function applyRounding(
  value: number,
  mode: ParsedPricingConfig["rounding"],
): number {
  return mode === "nearest_dollar" ? Math.round(value) : value;
}

export type CalculatedPrices = {
  base_exterior_before_minimum: number;
  one_time_exterior: number;
  six_month_exterior: number;
  three_month_exterior: number;
  interior_add_on: number;
  minimum_applied: {
    one_time: boolean;
    six_month: boolean;
    three_month: boolean;
    interior_add_on: boolean;
  };
};

// Apply the Phase 1 formulas:
//   base = sqft * perSqft
//   one_time = round(max(base * oneTimeMul, minimum))
//   six_month = round(max(base * sixMonthMul, minimum))
//   three_month = round(max(base * threeMonthMul, minimum))
//   interior = round(one_time * interiorMul)
//
// `minimum_applied` flags are based on whether the minimum clamp
// changed the result for that option. Interior add-on is never
// clamped to the minimum (it's a fraction of the already-clamped
// one_time price).
export function calculatePrices(
  squareFootage: number,
  config: ParsedPricingConfig,
): CalculatedPrices {
  const baseExterior = squareFootage * config.baseExteriorPerSqft;

  const oneTimeRaw = baseExterior * config.oneTimeMultiplier;
  const sixMonthRaw = baseExterior * config.sixMonthMultiplier;
  const threeMonthRaw = baseExterior * config.threeMonthMultiplier;

  const oneTime = applyRounding(
    Math.max(oneTimeRaw, config.minimum),
    config.rounding,
  );
  const sixMonth = applyRounding(
    Math.max(sixMonthRaw, config.minimum),
    config.rounding,
  );
  const threeMonth = applyRounding(
    Math.max(threeMonthRaw, config.minimum),
    config.rounding,
  );
  const interior = applyRounding(
    oneTime * config.interiorMultiplier,
    config.rounding,
  );

  return {
    base_exterior_before_minimum: baseExterior,
    one_time_exterior: oneTime,
    six_month_exterior: sixMonth,
    three_month_exterior: threeMonth,
    interior_add_on: interior,
    minimum_applied: {
      one_time: oneTimeRaw < config.minimum,
      six_month: sixMonthRaw < config.minimum,
      three_month: threeMonthRaw < config.minimum,
      interior_add_on: false,
    },
  };
}
