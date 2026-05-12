import "server-only";
import { lookupPropertyByAddress } from "./rentcast-provider";
import { normalizeFirstProperty } from "./normalize";
import type {
  NormalizedPropertyData,
  PropertyDataResult,
  PropertyLookupAddress,
} from "./types";

// ---------------------------------------------------------------------------
// enrichProperty — public entry point for the property data pipeline.
//
// 1. Calls RentCast via lookupPropertyByAddress.
// 2. Hard failures (missing key, network, HTTP error, invalid JSON) bubble
//    up as { ok: false, error }.
// 3. "Property not found" is NOT a hard failure — RentCast returning an
//    empty array becomes a successful result with
//    property_data_status='missing'. This is the manual-quote fallback
//    signal for the future quote flow.
// 4. Missing square footage on a found property is also { ok: true,
//    data: { ..., property_data_status: 'missing' } } per Phase 1 rules.
// ---------------------------------------------------------------------------

export async function enrichProperty(
  address: PropertyLookupAddress,
): Promise<PropertyDataResult<NormalizedPropertyData>> {
  const lookup = await lookupPropertyByAddress(address);
  if (!lookup.ok) {
    return { ok: false, error: lookup.error };
  }
  const normalized = normalizeFirstProperty(lookup.data);
  return { ok: true, data: normalized };
}
