// Public surface for the Window Cleaning Auto-Quote Plugin.
//
// ⚠️ SERVER-SIDE ONLY barrel. Re-exports `quote.ts` and `config-loader.ts`
// which `import "server-only"`. Client Components must NOT import from
// this barrel. For pure types and pricing math use the file paths
// directly:
//   import type { QuoteOption, QuoteOutput, ... } from "@/plugins/window-cleaning-auto-quote/types";
//   import { calculatePrices, DEFAULT_PRICING_CONFIG } from "@/plugins/window-cleaning-auto-quote/pricing";

export { calculateWindowCleaningQuote, buildQuoteOutput } from "./quote";
export { loadAutoQuoteConfig } from "./config-loader";
export {
  calculatePrices,
  parsePriceRules,
  DEFAULT_PRICING_CONFIG,
  REQUIRED_PRICE_RULE_KEYS,
} from "./pricing";
export { WINDOW_CLEANING_AUTO_QUOTE } from "./manifest";

export type {
  AutoQuoteError,
  AutoQuoteErrorCode,
  AutoQuoteResult,
  CalculationSnapshot,
  LineItem,
  LoadedConfig,
  LoadedService,
  LoadedServicePlan,
  OptionKey,
  AddOnKey,
  ParsedPricingConfig,
  PriceSnapshot,
  QuoteAddOn,
  QuoteCalculationInput,
  QuoteOption,
  QuoteOutput,
  SelectedAddOn,
} from "./types";
