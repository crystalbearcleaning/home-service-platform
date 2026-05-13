// Public types for the Customer Quote / Sales Page Plugin.

import type { NormalizedAddress } from "@/core/geo";
import type { NormalizedPropertyData } from "@/core/property-data";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote";

// Lifecycle / interaction status values mirror the schema.md enumeration
// for quote_page_interactions.interaction_status.
export type InteractionStatus =
  | "address_entered"
  | "out_of_area"
  | "property_data_missing"
  | "quote_generated"
  | "contact_submitted"
  | "converted"
  | "abandoned"
  | "error";

export type ServiceAreaStatus = "in_area" | "out_of_area" | "unknown";

export type PropertyDataStatus =
  | "not_requested"
  | "found"
  | "missing"
  | "partial"
  | "error";

export type TrackingContext = {
  source?: string | null;
  tracking_code?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
};

// Result kinds the orchestrator can surface back to the client.
export type AddressLookupKind =
  | "out_of_area"
  | "property_data_missing"
  | "quote_generated";

export type OutOfAreaResult = {
  kind: "out_of_area";
  interactionId: string;
  normalizedAddress: NormalizedAddress;
  formattedAddress: string;
  fallbackMessage: string;
  contactStepMessage: string;
};

export type PropertyDataMissingResult = {
  kind: "property_data_missing";
  interactionId: string;
  normalizedAddress: NormalizedAddress;
  formattedAddress: string;
  fallbackMessage: string;
  contactStepMessage: string;
};

export type QuoteGeneratedResult = {
  kind: "quote_generated";
  interactionId: string;
  normalizedAddress: NormalizedAddress;
  formattedAddress: string;
  quotePreview: QuoteOutput;
};

export type AddressLookupData =
  | OutOfAreaResult
  | PropertyDataMissingResult
  | QuoteGeneratedResult;

export type AddressLookupErrorCode =
  | "UNAUTHORIZED"
  | "BUSINESS_RESOLUTION_FAILED"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "GEO_FAILED"
  | "PROPERTY_DATA_FAILED"
  | "AUTO_QUOTE_FAILED"
  | "INTERACTION_WRITE_FAILED"
  | "INTERNAL"
  | (string & {});

export type AddressLookupError = {
  code: AddressLookupErrorCode;
  message: string;
  retryAfterSeconds?: number;
  details?: unknown;
};

export type AddressLookupResult =
  | { ok: true; data: AddressLookupData }
  | { ok: false; error: AddressLookupError };

// The shape the page renders before any address lookup happens.
export type CustomerQuotePageContext = {
  business: {
    id: string;
    slug: string;
    name: string;
    phone: string | null;
  };
  appSurface: {
    id: string;
    slug: string;
    name: string;
  };
  installedPluginId: string | null;
  pluginVersion: string;
  copy: {
    fallback_property_data_missing: string;
    fallback_out_of_service_area: string;
    customer_quote_trust_points: string[];
    customer_quote_scheduling_copy: string;
    customer_quote_phone_secondary: string;
  };
};

// Re-exports so consumers only need to import from this barrel.
export type {
  NormalizedAddress,
  NormalizedPropertyData,
  QuoteOutput,
};
