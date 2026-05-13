// Public types for the Window Cleaning Auto-Quote Plugin.

export type OptionKey = "one_time" | "six_month" | "three_month";

export type AddOnKey = "interior_window_cleaning";

// Plugin input. Mirrors what the future submit-quote-request server
// action will hand us after running geo + RentCast.
export type QuoteCalculationInput = {
  businessId: string;
  square_footage: number | null;
  property_data_status: "found" | "missing" | "partial" | "error" | string;
  property_type?: string | null;
  service_area_id?: string | null;
  source_plugin_version?: string; // override; defaults to manifest.version
  normalized_address?: unknown;
  property_snapshot?: unknown;
};

// Pure pricing config — parsed from core price_rules rows.
export type ParsedPricingConfig = {
  minimum: number;
  baseExteriorPerSqft: number;
  oneTimeMultiplier: number;
  sixMonthMultiplier: number;
  threeMonthMultiplier: number;
  interiorMultiplier: number;
  rounding: "nearest_dollar" | "none";
};

export type LoadedServicePlan = {
  id: string;
  key: string;
  name: string;
  display_label: string;
  frequency_months: number | null;
  is_recommended: boolean;
  sort_order: number;
};

export type LoadedService = {
  id: string;
  service_code: string;
  name: string;
  is_base_service: boolean;
  is_add_on: boolean;
};

export type LoadedConfig = {
  pricing: ParsedPricingConfig;
  services: {
    exterior: LoadedService;
    interior: LoadedService;
  };
  plans: {
    one_time: LoadedServicePlan;
    six_month: LoadedServicePlan;
    three_month: LoadedServicePlan;
  };
  priceRulesUsed: string[];
};

// Output shape ------------------------------------------------------------
export type QuoteOption = {
  option_key: OptionKey;
  service_plan_id: string;
  service_plan_name: string;
  display_label: string;
  is_recommended: boolean;
  exterior_price: number;
  recurring_interval_months: number | null;
  price_label: string;
};

export type QuoteAddOn = {
  add_on_key: AddOnKey;
  service_id: string;
  service_code: string;
  service_name: string;
  price: number;
  display_label: string;
};

export type SelectedAddOn = {
  add_on_key: AddOnKey;
  service_id: string;
  price: number;
};

export type LineItem = {
  option_key: OptionKey | AddOnKey;
  label: string;
  amount: number;
  kind: "option_exterior" | "add_on";
};

export type PriceSnapshot = {
  currency: "USD";
  minimum_price: number;
  options: Record<OptionKey, number>;
  add_ons: Record<AddOnKey, number>;
};

export type CalculationSnapshot = {
  square_footage: number | null;
  base_exterior_before_minimum: number | null;
  minimum_price: number;
  one_time_formula: string;
  six_month_multiplier: number;
  three_month_multiplier: number;
  interior_multiplier: number;
  minimum_applied: {
    one_time: boolean;
    six_month: boolean;
    three_month: boolean;
    interior_add_on: boolean;
  };
  rounding: ParsedPricingConfig["rounding"];
  price_rules_used: string[];
  reason: string | null;
  generated_at: string;
};

export type QuoteOutput = {
  can_quote: boolean;
  manual_quote_required: boolean;
  reason: string | null;
  options: QuoteOption[];
  add_ons: QuoteAddOn[];
  selected_option_key: OptionKey | null;
  selected_add_ons: SelectedAddOn[];
  line_items_snapshot: LineItem[] | null;
  price_snapshot: PriceSnapshot | null;
  calculation_snapshot: CalculationSnapshot;
  warnings: string[];
  source_plugin_key: "window_cleaning_auto_quote";
  source_plugin_version: string;
};

export type AutoQuoteErrorCode =
  | "INVALID_INPUT"
  | "DB_ERROR"
  | "CLIENT_INIT_FAILED"
  | "MISSING_SERVICE"
  | "MISSING_SERVICE_PLAN"
  | "MISSING_PRICE_RULE"
  | "MALFORMED_PRICE_RULE"
  | (string & {});

export type AutoQuoteError = {
  code: AutoQuoteErrorCode;
  message: string;
  details?: unknown;
};

export type AutoQuoteResult =
  | { ok: true; data: QuoteOutput }
  | { ok: false; error: AutoQuoteError };
