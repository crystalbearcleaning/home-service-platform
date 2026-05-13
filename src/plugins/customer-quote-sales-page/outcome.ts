// Pure outcome decider. Given the geo + property-data + auto-quote
// results we've already gathered, produce a discriminated outcome
// describing what to write to quote_page_interactions and what to
// render to the customer. No DB, no fetch — safe to unit test.

import type { ServiceAreaMatch } from "@/core/geo";
import type { NormalizedPropertyData } from "@/core/property-data";
import type {
  AutoQuoteResult,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote";
import type {
  InteractionStatus,
  PropertyDataStatus,
  ServiceAreaStatus,
} from "./types";

export type OutcomeInputs = {
  serviceArea: ServiceAreaMatch;
  property: NormalizedPropertyData | null;
  quote: AutoQuoteResult | null;
};

export type DecidedOutcome = {
  interactionStatus: InteractionStatus;
  serviceAreaStatus: ServiceAreaStatus;
  propertyDataStatus: PropertyDataStatus;
  quotePreview: QuoteOutput | null;
  reason: string | null;
  providerError: string | null;
};

export function decideOutcome(inputs: OutcomeInputs): DecidedOutcome {
  const { serviceArea, property, quote } = inputs;

  // Out of area takes precedence — we deliberately never ran the
  // RentCast / Auto-Quote calls when this is the case.
  if (!serviceArea.inArea) {
    return {
      interactionStatus: "out_of_area",
      serviceAreaStatus: "out_of_area",
      propertyDataStatus: "not_requested",
      quotePreview: null,
      reason: serviceArea.reason,
      providerError: null,
    };
  }

  // In area but RentCast lookup failed (hard error from the provider).
  if (property === null) {
    return {
      interactionStatus: "error",
      serviceAreaStatus: "in_area",
      propertyDataStatus: "error",
      quotePreview: null,
      reason: "Property data lookup failed.",
      providerError: "RentCast call failed.",
    };
  }

  // In area but sqft missing -> manual quote fallback signal.
  if (property.property_data_status !== "found") {
    return {
      interactionStatus: "property_data_missing",
      serviceAreaStatus: "in_area",
      propertyDataStatus: property.property_data_status as PropertyDataStatus,
      quotePreview: null,
      reason: "Square footage missing for this property.",
      providerError: null,
    };
  }

  // In area + sqft present. We should have run Auto-Quote.
  if (!quote) {
    return {
      interactionStatus: "error",
      serviceAreaStatus: "in_area",
      propertyDataStatus: "found",
      quotePreview: null,
      reason: "Auto-Quote was not invoked despite found square footage.",
      providerError: null,
    };
  }

  if (!quote.ok) {
    return {
      interactionStatus: "error",
      serviceAreaStatus: "in_area",
      propertyDataStatus: "found",
      quotePreview: null,
      reason: `Auto-Quote error: ${quote.error.message}`,
      providerError: quote.error.code,
    };
  }

  // Defensive — even with sqft present the plugin can flip to
  // manual_quote_required for input-validation reasons. Treat that as
  // the same fallback branch.
  if (quote.data.manual_quote_required) {
    return {
      interactionStatus: "property_data_missing",
      serviceAreaStatus: "in_area",
      propertyDataStatus: "missing",
      quotePreview: null,
      reason:
        quote.data.reason ?? "Auto-Quote flagged manual_quote_required.",
      providerError: null,
    };
  }

  return {
    interactionStatus: "quote_generated",
    serviceAreaStatus: "in_area",
    propertyDataStatus: "found",
    quotePreview: quote.data,
    reason: null,
    providerError: null,
  };
}
