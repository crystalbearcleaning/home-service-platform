import type {
  NormalizedPropertyData,
  PropertyDataConfidence,
  PropertyDataStatus,
  SafeProviderSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// Pure transformation: RentCast property record → NormalizedPropertyData.
// No fetch, no env reads, no DB. Safe to unit test in isolation.
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function positiveIntOrNull(v: unknown): number | null {
  const n = numberOrNull(v);
  if (n === null) return null;
  if (n <= 0) return null;
  return Math.trunc(n);
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// A "not found" / null-input shape. Reused so the missing path is
// always exactly one object literal.
export function missingPropertyData(): NormalizedPropertyData {
  const snapshot: SafeProviderSnapshot = {
    id: null,
    formattedAddress: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    squareFootage: null,
    lotSize: null,
    yearBuilt: null,
  };
  return {
    square_footage: null,
    property_type: null,
    lot_size_sqft: null,
    year_built: null,
    bedrooms: null,
    bathrooms: null,
    data_source: "rentcast",
    data_confidence: "unknown",
    property_data_status: "missing",
    provider_property_id: null,
    provider_snapshot: snapshot,
  };
}

// Map a single RentCast property record (object) into our normalized
// shape. Accepts unknown so callers don't have to upcast.
export function normalizePropertyData(raw: unknown): NormalizedPropertyData {
  if (!isObject(raw)) {
    return missingPropertyData();
  }

  const id = stringOrNull(raw.id);
  const formattedAddress = stringOrNull(raw.formattedAddress);
  const propertyType = stringOrNull(raw.propertyType);
  const squareFootage = positiveIntOrNull(raw.squareFootage);
  const lotSize = positiveIntOrNull(raw.lotSize);
  const yearBuilt = positiveIntOrNull(raw.yearBuilt);
  const bedrooms = numberOrNull(raw.bedrooms);
  const bathrooms = numberOrNull(raw.bathrooms);

  // Phase 1 rule: status keyed on square_footage only.
  const status: PropertyDataStatus =
    squareFootage !== null ? "found" : "missing";

  // Confidence inference:
  //   sqft present                 -> high
  //   no sqft but provider id    -> low
  //   neither sqft nor id           -> unknown
  const confidence: PropertyDataConfidence =
    squareFootage !== null ? "high" : id !== null ? "low" : "unknown";

  const snapshot: SafeProviderSnapshot = {
    id,
    formattedAddress,
    propertyType,
    bedrooms,
    bathrooms,
    squareFootage,
    lotSize,
    yearBuilt,
  };

  return {
    square_footage: squareFootage,
    property_type: propertyType,
    lot_size_sqft: lotSize,
    year_built: yearBuilt,
    bedrooms,
    bathrooms,
    data_source: "rentcast",
    data_confidence: confidence,
    property_data_status: status,
    provider_property_id: id,
    provider_snapshot: snapshot,
  };
}

// Helper used by the lookup wrapper: given the raw RentCast response
// (typically an array), pick the first usable item and normalize.
// Returns the missing shape if the response is empty / not an array.
export function normalizeFirstProperty(
  rawResponse: unknown,
): NormalizedPropertyData {
  if (Array.isArray(rawResponse)) {
    return rawResponse.length > 0
      ? normalizePropertyData(rawResponse[0])
      : missingPropertyData();
  }
  if (isObject(rawResponse)) {
    return normalizePropertyData(rawResponse);
  }
  return missingPropertyData();
}
