// Public core geo API.
// Plugins should ALWAYS go through this module, never call Google directly.

export { autocompleteAddress, getPlaceDetails } from "./google-provider";
export { normalizeAddress } from "./normalize";
export { matchServiceArea, normalizeCity } from "./match-service-area";
export type {
  AutocompletePrediction,
  GeoError,
  GeoErrorCode,
  GeoResult,
  GoogleAddressComponent,
  NormalizedAddress,
  SafeRawGooglePlace,
  ServiceAreaMatch,
} from "./types";
