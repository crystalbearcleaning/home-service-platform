import "server-only";
import { loadAutoQuoteConfig } from "./config-loader";
import { calculatePrices } from "./pricing";
import { WINDOW_CLEANING_AUTO_QUOTE } from "./manifest";
import type {
  AutoQuoteResult,
  CalculationSnapshot,
  LineItem,
  LoadedConfig,
  PriceSnapshot,
  QuoteAddOn,
  QuoteCalculationInput,
  QuoteOption,
  QuoteOutput,
} from "./types";

// =========================================================================
// Orchestrator. Public entry point for the Window Cleaning Auto-Quote
// Plugin. The pure pricing math lives in pricing.ts; this layer adds:
//
//   * input validation
//   * the manual-quote-required fallback (when sqft / property data is
//     unusable)
//   * loading the typed config from core (config-loader.ts)
//   * shaping the output the future quote flow / admin UI will render
//
// Never throws. Returns AutoQuoteResult.
// =========================================================================

const PLUGIN_KEY = WINDOW_CLEANING_AUTO_QUOTE.pluginKey;
const PLUGIN_VERSION = WINDOW_CLEANING_AUTO_QUOTE.version;

function manualQuoteOutput(
  input: QuoteCalculationInput,
  reason: string,
): QuoteOutput {
  return {
    can_quote: false,
    manual_quote_required: true,
    reason,
    options: [],
    add_ons: [],
    selected_option_key: null,
    selected_add_ons: [],
    line_items_snapshot: null,
    price_snapshot: null,
    calculation_snapshot: {
      square_footage: input.square_footage ?? null,
      base_exterior_before_minimum: null,
      minimum_price: 0,
      one_time_formula: "max(square_footage * per_sqft, minimum)",
      six_month_multiplier: 0,
      three_month_multiplier: 0,
      interior_multiplier: 0,
      minimum_applied: {
        one_time: false,
        six_month: false,
        three_month: false,
        interior_add_on: false,
      },
      rounding: "nearest_dollar",
      price_rules_used: [],
      reason,
      generated_at: new Date().toISOString(),
    },
    warnings: [reason],
    source_plugin_key: PLUGIN_KEY,
    source_plugin_version: input.source_plugin_version ?? PLUGIN_VERSION,
  };
}

function buildOption(
  optionKey: "one_time" | "six_month" | "three_month",
  config: LoadedConfig,
  price: number,
): QuoteOption {
  const plan = config.plans[optionKey];
  const isRecurring = plan.frequency_months !== null;
  return {
    option_key: optionKey,
    service_plan_id: plan.id,
    service_plan_name: plan.name,
    display_label: plan.display_label,
    is_recommended: plan.is_recommended,
    exterior_price: price,
    recurring_interval_months: plan.frequency_months,
    price_label: isRecurring ? `$${price} per visit` : `$${price}`,
  };
}

function buildAddOn(config: LoadedConfig, price: number): QuoteAddOn {
  const interior = config.services.interior;
  return {
    add_on_key: "interior_window_cleaning",
    service_id: interior.id,
    service_code: interior.service_code,
    service_name: interior.name,
    price,
    display_label: `Add ${interior.name} to This Cleaning: +$${price}`,
  };
}

// Pure: assemble the success-case QuoteOutput from input + a
// pre-loaded LoadedConfig. Used directly by tests so the orchestrator
// is testable without a database.
export function buildQuoteOutput(
  input: QuoteCalculationInput,
  config: LoadedConfig,
): QuoteOutput {
  const sqft = input.square_footage as number; // guarded by caller

  const prices = calculatePrices(sqft, config.pricing);

  const options: QuoteOption[] = [
    buildOption("one_time", config, prices.one_time_exterior),
    buildOption("six_month", config, prices.six_month_exterior),
    buildOption("three_month", config, prices.three_month_exterior),
  ];

  const addOn = buildAddOn(config, prices.interior_add_on);

  const lineItems: LineItem[] = [
    {
      option_key: "one_time",
      label: config.plans.one_time.display_label,
      amount: prices.one_time_exterior,
      kind: "option_exterior",
    },
    {
      option_key: "six_month",
      label: `${config.plans.six_month.display_label} (per visit)`,
      amount: prices.six_month_exterior,
      kind: "option_exterior",
    },
    {
      option_key: "three_month",
      label: `${config.plans.three_month.display_label} (per visit)`,
      amount: prices.three_month_exterior,
      kind: "option_exterior",
    },
    {
      option_key: "interior_window_cleaning",
      label: `${config.services.interior.name} add-on`,
      amount: prices.interior_add_on,
      kind: "add_on",
    },
  ];

  const priceSnapshot: PriceSnapshot = {
    currency: "USD",
    minimum_price: config.pricing.minimum,
    options: {
      one_time: prices.one_time_exterior,
      six_month: prices.six_month_exterior,
      three_month: prices.three_month_exterior,
    },
    add_ons: {
      interior_window_cleaning: prices.interior_add_on,
    },
  };

  const calculationSnapshot: CalculationSnapshot = {
    square_footage: sqft,
    base_exterior_before_minimum: prices.base_exterior_before_minimum,
    minimum_price: config.pricing.minimum,
    one_time_formula: `max(square_footage * ${config.pricing.baseExteriorPerSqft} * ${config.pricing.oneTimeMultiplier}, ${config.pricing.minimum})`,
    six_month_multiplier: config.pricing.sixMonthMultiplier,
    three_month_multiplier: config.pricing.threeMonthMultiplier,
    interior_multiplier: config.pricing.interiorMultiplier,
    minimum_applied: prices.minimum_applied,
    rounding: config.pricing.rounding,
    price_rules_used: config.priceRulesUsed,
    reason: null,
    generated_at: new Date().toISOString(),
  };

  const warnings: string[] = [];
  if (
    prices.minimum_applied.one_time ||
    prices.minimum_applied.six_month ||
    prices.minimum_applied.three_month
  ) {
    warnings.push(
      `Minimum price ($${config.pricing.minimum}) applied to at least one option.`,
    );
  }

  return {
    can_quote: true,
    manual_quote_required: false,
    reason: null,
    options,
    add_ons: [addOn],
    selected_option_key: null,
    selected_add_ons: [],
    line_items_snapshot: lineItems,
    price_snapshot: priceSnapshot,
    calculation_snapshot: calculationSnapshot,
    warnings,
    source_plugin_key: PLUGIN_KEY,
    source_plugin_version: input.source_plugin_version ?? PLUGIN_VERSION,
  };
}

// Public entry point. Validates input, branches to the manual-quote
// fallback when needed, loads config, and returns the structured
// AutoQuoteResult.
export async function calculateWindowCleaningQuote(
  input: QuoteCalculationInput,
): Promise<AutoQuoteResult> {
  if (!input || !input.businessId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId is required.",
      },
    };
  }

  // Phase 1 rule: instant quote requires found property data + positive sqft.
  const sqftMissing =
    input.square_footage === null ||
    input.square_footage === undefined ||
    !Number.isFinite(input.square_footage) ||
    (typeof input.square_footage === "number" && input.square_footage <= 0);

  if (input.property_data_status !== "found" || sqftMissing) {
    const reason =
      input.property_data_status !== "found"
        ? `property_data_status is "${input.property_data_status}" (need "found")`
        : "square_footage is missing or non-positive";
    return { ok: true, data: manualQuoteOutput(input, reason) };
  }

  const loaded = await loadAutoQuoteConfig(input.businessId);
  if (!loaded.ok) {
    return loaded;
  }

  return { ok: true, data: buildQuoteOutput(input, loaded.config) };
}
