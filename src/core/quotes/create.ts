import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote/types";

// =========================================================================
// Create an immutable Quote snapshot. Only invoked for the quote_generated
// path — manual_quote / out_of_area submissions do not create quotes.
//
// The Quote stores the full options/line_items/price/calculation snapshots
// from the auto-quote plugin, plus the customer's selected option/add-ons
// and total. Expires_at is computed by the caller from business settings.
// =========================================================================

export type CreateQuoteInput = {
  businessId: string;
  contactId: string;
  propertyId: string;
  leadId: string;
  expiresAt: string; // ISO timestamp
  sourcePluginKey: string;
  sourcePluginVersion: string;
  selectedServicePlanId: string | null;
  selectedOptionKey: string;
  selectedAddOns: Array<{
    add_on_key: string;
    service_id: string;
    price: number;
  }>;
  selectedTotal: number;
  // Whole QuoteOutput is stored as options_snapshot for replay.
  quoteSnapshot: QuoteOutput;
  propertySnapshot: unknown | null;
  source: string | null;
  trackingCode: string | null;
  createdFromAppSurfaceId: string;
  quotePageInteractionId: string;
};

export type CreateQuoteResult =
  | { ok: true; quoteId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createQuoteFromInteraction(
  input: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  if (
    !input.businessId ||
    !input.contactId ||
    !input.propertyId ||
    !input.leadId
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          "businessId, contactId, propertyId, leadId are required.",
      },
    };
  }
  if (input.quoteSnapshot.line_items_snapshot === null) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Cannot create a quote from a manual-quote snapshot.",
      },
    };
  }
  if (input.quoteSnapshot.price_snapshot === null) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Cannot create a quote without a price_snapshot.",
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

  const snapshot = input.quoteSnapshot;

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      business_id: input.businessId,
      contact_id: input.contactId,
      property_id: input.propertyId,
      lead_id: input.leadId,
      status: "submitted",
      customer_intent: "schedule_requested",
      expires_at: input.expiresAt,
      source_plugin_key: input.sourcePluginKey,
      source_plugin_version: input.sourcePluginVersion,
      selected_service_plan_id: input.selectedServicePlanId,
      selected_option_key: input.selectedOptionKey,
      selected_add_ons: input.selectedAddOns,
      selected_total: input.selectedTotal,
      options_snapshot: snapshot.options,
      line_items_snapshot: snapshot.line_items_snapshot,
      price_snapshot: snapshot.price_snapshot,
      calculation_snapshot: snapshot.calculation_snapshot,
      property_snapshot: input.propertySnapshot,
      source: input.source,
      tracking_code: input.trackingCode,
      created_from_app_surface_id: input.createdFromAppSurfaceId,
      quote_page_interaction_id: input.quotePageInteractionId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert quote row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, quoteId: data.id };
}
