// Phase 1 normalized address shape. Plugins must never read raw Google
// responses directly — they consume this shape via the core geo provider.

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

// Selected/safe subset of a Google place result. We do not store photos,
// reviews, opening_hours, etc. — only the fields we need for normalization
// and debugging.
export type SafeRawGooglePlace = {
  place_id: string;
  formatted_address: string;
  types: string[];
  address_components: GoogleAddressComponent[];
  geometry: { location: { lat: number; lng: number } } | null;
  name: string | null;
};

export type NormalizedAddress = {
  formatted_address: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  country: string;
  google_place_id: string;
  latitude: number | null;
  longitude: number | null;
  raw_google_response: SafeRawGooglePlace;
};

export type GeoErrorCode =
  | "MISSING_KEY"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "INVALID_PLACE"
  | "MISSING_CITY"
  | "MISSING_STATE"
  | "EMPTY_INPUT"
  | "EMPTY_CITY"
  | "CLIENT_INIT_FAILED"
  | "DB_ERROR"
  // Google REST status strings flow through as-is
  | "ZERO_RESULTS"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR"
  | "NOT_FOUND"
  | (string & {});

export type GeoError = {
  code: GeoErrorCode;
  message: string;
  details?: unknown;
};

export type GeoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GeoError };

export type AutocompletePrediction = {
  placeId: string;
  description: string;
  mainText: string | null;
  secondaryText: string | null;
};

export type ServiceAreaMatch = {
  inArea: boolean;
  serviceAreaId: string | null;
  serviceAreaName: string | null;
  normalizedCity: string;
  reason: string | null;
};
