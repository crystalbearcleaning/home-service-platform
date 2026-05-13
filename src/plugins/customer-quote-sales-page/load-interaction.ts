import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import type { NormalizedAddress } from "@/core/geo";
import type { SafeProviderSnapshot } from "@/core/property-data";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote/types";
import type { InteractionStatus, PropertyDataStatus } from "./types";

// =========================================================================
// Load + mark-converted helpers for quote_page_interactions used by the
// submit-contact orchestrator.
// =========================================================================

export type LoadedInteraction = {
  id: string;
  businessId: string;
  appSurfaceId: string;
  installedPluginId: string | null;
  pluginVersion: string;
  interactionStatus: InteractionStatus;
  serviceAreaStatus: "in_area" | "out_of_area" | "unknown";
  propertyDataStatus: PropertyDataStatus | string;
  normalizedAddress: NormalizedAddress | null;
  normalizedCity: string | null;
  googlePlaceId: string | null;
  serviceAreaId: string | null;
  propertyDataSummary: SafeProviderSnapshot | null;
  quotePreviewData: QuoteOutput | null;
  source: string | null;
  trackingCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  convertedAt: string | null;
  convertedContactId: string | null;
  convertedLeadId: string | null;
  convertedQuoteId: string | null;
};

type Row = {
  id: string;
  business_id: string;
  app_surface_id: string;
  installed_plugin_id: string | null;
  plugin_version: string;
  interaction_status: string;
  service_area_status: string;
  property_data_status: string;
  normalized_address: NormalizedAddress | null;
  normalized_city: string | null;
  google_place_id: string | null;
  property_data_summary: SafeProviderSnapshot | null;
  quote_preview_data: QuoteOutput | null;
  source: string | null;
  tracking_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  converted_at: string | null;
  converted_contact_id: string | null;
  converted_lead_id: string | null;
  converted_quote_id: string | null;
};

export type LoadInteractionResult =
  | { ok: true; data: LoadedInteraction }
  | { ok: false; error: { code: string; message: string } };

export async function loadInteractionForSubmission(input: {
  interactionId: string;
  businessId: string;
  appSurfaceId: string;
}): Promise<LoadInteractionResult> {
  if (!input.interactionId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "interactionId is required." },
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
    .select(
      "id, business_id, app_surface_id, installed_plugin_id, plugin_version, interaction_status, service_area_status, property_data_status, normalized_address, normalized_city, google_place_id, property_data_summary, quote_preview_data, source, tracking_code, utm_source, utm_medium, utm_campaign, referrer, converted_at, converted_contact_id, converted_lead_id, converted_quote_id",
    )
    .eq("id", input.interactionId)
    .eq("business_id", input.businessId)
    .eq("app_surface_id", input.appSurfaceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }
  if (!data) {
    return {
      ok: false,
      error: {
        code: "INTERACTION_NOT_FOUND",
        message:
          "No quote interaction found for this id/business/surface.",
      },
    };
  }

  const row = data as Row;

  // Look up the matching active service_area id from the city, if any.
  // We don't store it on the interaction in C2; pull it now so the
  // Property row can reference it.
  let serviceAreaId: string | null = null;
  if (row.service_area_status === "in_area" && row.normalized_city) {
    const sa = await supabase
      .from("service_areas")
      .select("id")
      .eq("business_id", row.business_id)
      .eq("status", "active")
      .eq("match_type", "city")
      .eq("match_value", row.normalized_city)
      .limit(1)
      .maybeSingle();
    if (!sa.error && sa.data) {
      serviceAreaId = sa.data.id;
    }
  }

  return {
    ok: true,
    data: {
      id: row.id,
      businessId: row.business_id,
      appSurfaceId: row.app_surface_id,
      installedPluginId: row.installed_plugin_id,
      pluginVersion: row.plugin_version,
      interactionStatus: row.interaction_status as InteractionStatus,
      serviceAreaStatus:
        row.service_area_status as "in_area" | "out_of_area" | "unknown",
      propertyDataStatus: row.property_data_status,
      normalizedAddress: row.normalized_address,
      normalizedCity: row.normalized_city,
      googlePlaceId: row.google_place_id,
      serviceAreaId,
      propertyDataSummary: row.property_data_summary,
      quotePreviewData: row.quote_preview_data,
      source: row.source,
      trackingCode: row.tracking_code,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      referrer: row.referrer,
      convertedAt: row.converted_at,
      convertedContactId: row.converted_contact_id,
      convertedLeadId: row.converted_lead_id,
      convertedQuoteId: row.converted_quote_id,
    },
  };
}

export type MarkConvertedInput = {
  interactionId: string;
  businessId: string;
  contactId: string;
  propertyId: string;
  leadId: string;
  quoteId: string | null;
  selectedOptionKey: string | null;
  selectedAddOns: unknown[] | null;
  selectedTotal: number | null;
  newStatus: "converted" | "contact_submitted";
};

export type MarkConvertedResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

export async function markInteractionConverted(
  input: MarkConvertedInput,
): Promise<MarkConvertedResult> {
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

  const { error } = await supabase
    .from("quote_page_interactions")
    .update({
      converted_contact_id: input.contactId,
      converted_property_id: input.propertyId,
      converted_lead_id: input.leadId,
      converted_quote_id: input.quoteId,
      converted_at: new Date().toISOString(),
      interaction_status: input.newStatus,
      selected_option_key: input.selectedOptionKey,
      selected_add_ons: input.selectedAddOns,
      selected_total: input.selectedTotal,
    })
    .eq("id", input.interactionId)
    .eq("business_id", input.businessId);

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }

  return { ok: true };
}
