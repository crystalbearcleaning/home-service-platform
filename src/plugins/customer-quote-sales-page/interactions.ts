import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import type { NormalizedAddress } from "@/core/geo";
import type { NormalizedPropertyData } from "@/core/property-data";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote";
import type {
  InteractionStatus,
  PropertyDataStatus,
  ServiceAreaStatus,
  TrackingContext,
} from "./types";

// =========================================================================
// Insert one row into quote_page_interactions. C2's only write target
// on the customer side. Always inserts a new row (no upsert) — one row
// per address-lookup attempt is the Phase 1 contract.
//
// Service-role only. RLS on quote_page_interactions is Pattern B (read
// for authenticated members; service-role writes for public flow).
//
// converted_* fields stay null in C2; they're populated by C3's
// contact-submission action.
// =========================================================================

export type RecordQuotePageInteractionInput = {
  businessId: string;
  appSurfaceId: string;
  installedPluginId: string | null;
  pluginVersion: string;
  sessionKey: string | null;
  addressInput: string | null;
  normalizedAddress: NormalizedAddress | null;
  normalizedCity: string | null;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceAreaStatus: ServiceAreaStatus;
  propertyDataStatus: PropertyDataStatus;
  propertyDataSummary: NormalizedPropertyData["provider_snapshot"] | null;
  providerError: string | null;
  interactionStatus: InteractionStatus;
  quotePreviewData: QuoteOutput | null;
  selectedOptionKey: string | null;
  selectedAddOns: unknown[] | null;
  selectedTotal: number | null;
  tracking: TrackingContext | null;
};

export type RecordQuotePageInteractionResult =
  | { ok: true; interactionId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function recordQuotePageInteraction(
  input: RecordQuotePageInteractionInput,
): Promise<RecordQuotePageInteractionResult> {
  if (!input.businessId || !input.appSurfaceId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId and appSurfaceId are required.",
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

  const { data, error } = await supabase
    .from("quote_page_interactions")
    .insert({
      business_id: input.businessId,
      app_surface_id: input.appSurfaceId,
      installed_plugin_id: input.installedPluginId,
      plugin_version: input.pluginVersion,
      session_key: input.sessionKey,
      address_input: input.addressInput,
      normalized_address: input.normalizedAddress ?? null,
      normalized_city: input.normalizedCity,
      google_place_id: input.googlePlaceId,
      latitude: input.latitude,
      longitude: input.longitude,
      service_area_status: input.serviceAreaStatus,
      property_data_status: input.propertyDataStatus,
      property_data_summary: input.propertyDataSummary,
      provider_error: input.providerError,
      interaction_status: input.interactionStatus,
      quote_preview_data: input.quotePreviewData,
      selected_option_key: input.selectedOptionKey,
      selected_add_ons: input.selectedAddOns,
      selected_total: input.selectedTotal,
      source: input.tracking?.source ?? null,
      tracking_code: input.tracking?.tracking_code ?? null,
      utm_source: input.tracking?.utm_source ?? null,
      utm_medium: input.tracking?.utm_medium ?? null,
      utm_campaign: input.tracking?.utm_campaign ?? null,
      referrer: input.tracking?.referrer ?? null,
      // C2 boundary: converted_* fields stay null until C3.
      converted_contact_id: null,
      converted_property_id: null,
      converted_lead_id: null,
      converted_quote_id: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message:
          error?.message ?? "Failed to insert quote_page_interactions row.",
        details: error
          ? { hint: error.hint, code: error.code }
          : undefined,
      },
    };
  }

  return { ok: true, interactionId: data.id };
}
