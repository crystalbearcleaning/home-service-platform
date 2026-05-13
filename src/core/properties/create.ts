import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import type { NormalizedAddress } from "@/core/geo";
import type {
  PropertyDataStatus,
  SafeProviderSnapshot,
} from "@/core/property-data";

// =========================================================================
// Create a Property row from a normalized address + (optional) RentCast
// snapshot captured on the quote_page_interaction. Always inserts a new
// row — one property per submission. Phase 1 does not dedupe properties
// across submissions (a customer who quotes twice gets two properties).
// =========================================================================

export type CreatePropertyInput = {
  businessId: string;
  contactId: string;
  normalizedAddress: NormalizedAddress;
  serviceAreaId: string | null;
  serviceAreaStatus: "in_area" | "out_of_area" | "unknown";
  propertyData: {
    squareFootage: number | null;
    propertyType: string | null;
    lotSizeSqft: number | null;
    yearBuilt: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    dataConfidence: string | null;
    dataStatus: PropertyDataStatus | string;
    providerPropertyId: string | null;
    providerSnapshot: SafeProviderSnapshot | null;
  } | null;
};

export type CreatePropertyResult =
  | { ok: true; propertyId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createPropertyForSubmission(
  input: CreatePropertyInput,
): Promise<CreatePropertyResult> {
  if (!input.businessId || !input.contactId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId and contactId are required.",
      },
    };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Service-role Supabase client init failed.",
      },
    };
  }

  const addr = input.normalizedAddress;
  const pd = input.propertyData;

  const { data, error } = await supabase
    .from("properties")
    .insert({
      business_id: input.businessId,
      contact_id: input.contactId,
      address_line_1: addr.address_line_1,
      address_line_2: addr.address_line_2,
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
      formatted_address: addr.formatted_address,
      google_place_id: addr.google_place_id,
      latitude: addr.latitude,
      longitude: addr.longitude,
      service_area_id: input.serviceAreaId,
      service_area_status: input.serviceAreaStatus,
      square_footage: pd?.squareFootage ?? null,
      property_type: pd?.propertyType ?? null,
      lot_size_sqft: pd?.lotSizeSqft ?? null,
      year_built: pd?.yearBuilt ?? null,
      bedrooms: pd?.bedrooms ?? null,
      bathrooms: pd?.bathrooms ?? null,
      property_data_source: pd ? "rentcast" : null,
      property_data_provider_id: pd?.providerPropertyId ?? null,
      property_data_confidence: pd?.dataConfidence ?? null,
      property_data_status: pd?.dataStatus ?? "unknown",
      last_enriched_at: pd ? new Date().toISOString() : null,
      provider_snapshot: pd?.providerSnapshot ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert property row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, propertyId: data.id };
}
