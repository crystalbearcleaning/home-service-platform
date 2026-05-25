// Pure helpers for the Phase 5C RentCast route generation flow.
// No DB, no fetch, no env. Tested independently of the server-only
// search call so the API request shape + candidate safe-subset are
// pinned by unit tests.

// =========================================================================
// Limits
// =========================================================================
// RentCast Property Records search caps `limit` at 500 per request.
// Phase 5C makes ONE batch search per preview — no pagination. If the
// operator asks for more, we surface a friendly error.
export const RENTCAST_MAX_LIMIT = 500;
export const RENTCAST_MIN_LIMIT = 1;
export const DEFAULT_TARGET_HOME_COUNT = 100;
export const DEFAULT_RADIUS_MILES = 0.5;
export const RADIUS_MIN_MILES = 0.05;
export const RADIUS_MAX_MILES = 10;

// Phase 5C makes exactly ONE RentCast request per preview. Exposed as a
// constant so the UI can show "Estimated RentCast requests: 1" from
// the same source the engine asserts.
export const RENTCAST_PREVIEW_REQUEST_COUNT = 1 as const;

export type ClampLimitResult =
  | { ok: true; limit: number }
  | {
      ok: false;
      code: "OVER_BATCH_LIMIT" | "INVALID_TARGET";
      message: string;
    };

// Clamp the operator's target count into RentCast's batch limit.
export function clampTargetToBatchLimit(target: number): ClampLimitResult {
  if (!Number.isFinite(target) || !Number.isInteger(target) || target <= 0) {
    return {
      ok: false,
      code: "INVALID_TARGET",
      message: "Target home count must be a positive integer.",
    };
  }
  if (target > RENTCAST_MAX_LIMIT) {
    return {
      ok: false,
      code: "OVER_BATCH_LIMIT",
      message: `RentCast allows up to ${RENTCAST_MAX_LIMIT} homes per request. Pagination is out of scope for Phase 5C — pick a smaller target.`,
    };
  }
  return { ok: true, limit: Math.max(RENTCAST_MIN_LIMIT, target) };
}

// =========================================================================
// Search params
// =========================================================================
// Build the query string for a single RentCast Property Records search.
// Centred on lat/lng + radius (miles), with optional propertyType. The
// builder is pure so the test pins the exact param keys/values.
export type RentcastSearchParams = {
  latitude: number;
  longitude: number;
  radiusMiles: number;
  limit: number;
  propertyType?: string | null;
};

export function buildRentcastSearchQuery(
  input: RentcastSearchParams,
): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("latitude", String(input.latitude));
  sp.set("longitude", String(input.longitude));
  sp.set("radius", String(input.radiusMiles));
  sp.set("limit", String(input.limit));
  if (input.propertyType && input.propertyType.trim().length > 0) {
    sp.set("propertyType", input.propertyType.trim());
  }
  return sp;
}

// =========================================================================
// Candidate normalisation (safe subset)
// =========================================================================
// One row per home in the preview / saved route. Mirrors the columns on
// door_hanger_route_stops and the safe-subset rule from §A.9.
export type CandidatePreview = {
  externalId: string | null;
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string | null;
  squareFootage: number | null;
  estimatedValueCents: number | null;
  distanceMiles: number | null;
  rentcastSnapshot: RentcastSnapshot;
};

// Exactly what gets persisted to `door_hanger_route_stops.rentcast_snapshot`.
// No owner info, no sale history, no tax data — just the eight basic
// dimensions we already store in the property-data provider snapshot.
export type RentcastSnapshot = {
  id: string | null;
  formattedAddress: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
};

function readStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}
function readNum(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Pure: convert one RentCast property record into a CandidatePreview.
// Returns null when the record has no usable address (we cannot make a
// route stop without an address).
export function normalizeRentcastCandidate(
  raw: unknown,
  center: { latitude: number; longitude: number } | null,
): CandidatePreview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const formatted = readStr(obj, "formattedAddress");
  const addressLine = readStr(obj, "addressLine1") ?? readStr(obj, "address");
  const city = readStr(obj, "city");
  const state = readStr(obj, "state");
  const postalCode = readStr(obj, "zipCode") ?? readStr(obj, "postalCode");

  const primaryAddress = addressLine ?? formatted;
  if (!primaryAddress) return null;

  const latitude = readNum(obj, "latitude");
  const longitude = readNum(obj, "longitude");

  // Distance — provider may include it; otherwise compute from center.
  const providedDistance = readNum(obj, "distance");
  const computedDistance =
    center && latitude !== null && longitude !== null
      ? haversineMiles(center.latitude, center.longitude, latitude, longitude)
      : null;
  const distanceMiles = providedDistance ?? computedDistance;

  // Estimated value: try common RentCast value fields; convert dollars
  // to cents only when we have a clean integer-ish dollar amount.
  const estimatedValueDollars =
    readNum(obj, "lastSalePrice") ?? readNum(obj, "price") ?? null;
  const estimatedValueCents =
    estimatedValueDollars !== null && estimatedValueDollars >= 0
      ? Math.round(estimatedValueDollars * 100)
      : null;

  const snapshot: RentcastSnapshot = {
    id: readStr(obj, "id"),
    formattedAddress: formatted,
    propertyType: readStr(obj, "propertyType"),
    bedrooms: readNum(obj, "bedrooms"),
    bathrooms: readNum(obj, "bathrooms"),
    squareFootage: readNum(obj, "squareFootage"),
    lotSize: readNum(obj, "lotSize"),
    yearBuilt: readNum(obj, "yearBuilt"),
  };

  return {
    externalId: snapshot.id,
    address: primaryAddress,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    propertyType: snapshot.propertyType,
    squareFootage: snapshot.squareFootage,
    estimatedValueCents,
    distanceMiles,
    rentcastSnapshot: snapshot,
  };
}

// Map an array of raw records → safe candidates, dedup by external id +
// address, and cap at `target` so the preview never exceeds what the
// operator asked for.
export function normalizeRentcastCandidates(input: {
  raw: unknown;
  target: number;
  center: { latitude: number; longitude: number } | null;
}): CandidatePreview[] {
  const arr: unknown[] = Array.isArray(input.raw) ? input.raw : [];
  const seen = new Set<string>();
  const out: CandidatePreview[] = [];
  for (const item of arr) {
    const c = normalizeRentcastCandidate(item, input.center);
    if (!c) continue;
    const dedupKey = c.externalId ?? `${c.address}|${c.city ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(c);
    if (out.length >= input.target) break;
  }
  return out;
}

// =========================================================================
// Geometry — used when RentCast doesn't return a distance field.
// =========================================================================
const EARTH_RADIUS_MILES = 3958.8;
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

// =========================================================================
// Generation form input validation (pure)
// =========================================================================
export type GenerateRouteFormInput = {
  centerPlaceId: string;
  radiusMiles: number;
  targetHomeCount: number;
  propertyType?: string | null;
};

export type GenerateRouteValidationResult =
  | { ok: true; data: Required<Omit<GenerateRouteFormInput, "propertyType">> & { propertyType: string | null } }
  | {
      ok: false;
      fieldErrors: Record<string, string>;
      code: string;
      message: string;
    };

export function validateGenerateRouteInput(
  input: GenerateRouteFormInput,
): GenerateRouteValidationResult {
  const fieldErrors: Record<string, string> = {};
  const centerPlaceId = (input.centerPlaceId ?? "").trim();
  if (centerPlaceId.length === 0) {
    fieldErrors.centerPlaceId = "Pick a center address from the dropdown.";
  }
  const radius = Number(input.radiusMiles);
  if (!Number.isFinite(radius) || radius <= 0) {
    fieldErrors.radiusMiles = "Radius must be > 0.";
  } else if (radius < RADIUS_MIN_MILES || radius > RADIUS_MAX_MILES) {
    fieldErrors.radiusMiles = `Radius must be between ${RADIUS_MIN_MILES} and ${RADIUS_MAX_MILES} miles.`;
  }
  const target = Number(input.targetHomeCount);
  const targetCheck = clampTargetToBatchLimit(target);
  if (!targetCheck.ok) {
    fieldErrors.targetHomeCount = targetCheck.message;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      code: "VALIDATION_FAILED",
      message: "One or more fields are invalid.",
    };
  }
  const propertyType =
    input.propertyType && input.propertyType.trim().length > 0
      ? input.propertyType.trim()
      : null;
  return {
    ok: true,
    data: {
      centerPlaceId,
      radiusMiles: radius,
      targetHomeCount: target,
      propertyType,
    },
  };
}
