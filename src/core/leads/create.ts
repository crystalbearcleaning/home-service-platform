import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Create a Lead row from a converted quote_page_interaction. Status is
// set by the caller (mapped from interaction kind in the plugin layer);
// customer_intent defaults to schedule_requested per the Phase 1 rule.
// =========================================================================

export type CreateLeadInput = {
  businessId: string;
  contactId: string;
  propertyId: string;
  status: string;
  customerIntent?: string;
  source: string | null;
  trackingCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  createdFromAppSurfaceId: string;
  createdFromPluginKey: string;
  quotePageInteractionId: string;
};

export type CreateLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createLeadFromInteraction(
  input: CreateLeadInput,
): Promise<CreateLeadResult> {
  if (!input.businessId || !input.contactId || !input.propertyId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId, contactId, propertyId are required.",
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
    .from("leads")
    .insert({
      business_id: input.businessId,
      contact_id: input.contactId,
      property_id: input.propertyId,
      status: input.status,
      customer_intent: input.customerIntent ?? "schedule_requested",
      source: input.source,
      tracking_code: input.trackingCode,
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      referrer: input.referrer,
      created_from_app_surface_id: input.createdFromAppSurfaceId,
      created_from_plugin_key: input.createdFromPluginKey,
      quote_page_interaction_id: input.quotePageInteractionId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert lead row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, leadId: data.id };
}
