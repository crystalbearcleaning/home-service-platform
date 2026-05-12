// Public core property-data API.
// Plugins should ALWAYS go through this module; never call RentCast
// directly. The provider key is server-only.

export { lookupPropertyByAddress } from "./rentcast-provider";
export { enrichProperty } from "./enrich";
export {
  normalizePropertyData,
  normalizeFirstProperty,
  missingPropertyData,
} from "./normalize";

export type {
  NormalizedPropertyData,
  PropertyDataConfidence,
  PropertyDataError,
  PropertyDataErrorCode,
  PropertyDataResult,
  PropertyDataSource,
  PropertyDataStatus,
  PropertyLookupAddress,
  SafeProviderSnapshot,
} from "./types";
