// Phase 1 normalized property-data shape. Plugins must never read raw
// RentCast responses directly — they consume this shape via the core
// property data provider.

export type PropertyDataSource = "rentcast";

export type PropertyDataStatus = "found" | "missing" | "partial" | "error";

export type PropertyDataConfidence = "high" | "medium" | "low" | "unknown";

// Selected/safe subset of a RentCast property record. We do not store
// owner info, sale history, taxes, features, etc. Only the dimensions
// we need for quote calculation + debugging.
export type SafeProviderSnapshot = {
  id: string | null;
  formattedAddress: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
};

export type NormalizedPropertyData = {
  square_footage: number | null;
  property_type: string | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  data_source: PropertyDataSource;
  data_confidence: PropertyDataConfidence;
  property_data_status: PropertyDataStatus;
  provider_property_id: string | null;
  provider_snapshot: SafeProviderSnapshot;
};

export type PropertyDataErrorCode =
  | "MISSING_KEY"
  | "INVALID_INPUT"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_RESPONSE"
  | (string & {});

export type PropertyDataError = {
  code: PropertyDataErrorCode;
  message: string;
  details?: unknown;
};

export type PropertyDataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PropertyDataError };

// Minimal address shape the provider needs. Compatible with B5's
// NormalizedAddress — only the fields we read are required.
export type PropertyLookupAddress = {
  formatted_address: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
