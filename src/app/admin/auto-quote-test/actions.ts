"use server";

import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  getPlaceDetails,
  matchServiceArea,
  normalizeAddress,
  type NormalizedAddress,
  type ServiceAreaMatch,
} from "@/core/geo";
import {
  enrichProperty,
  type NormalizedPropertyData,
} from "@/core/property-data";
import {
  calculateWindowCleaningQuote,
  type QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote";

export type AutoQuotePropertyState =
  | { state: "skipped"; reason: string }
  | { state: "ok"; data: NormalizedPropertyData }
  | {
      state: "error";
      error: { code: string; message: string; details?: unknown };
    };

export type AutoQuoteQuoteState =
  | { state: "skipped"; reason: string }
  | { state: "ok"; data: QuoteOutput }
  | {
      state: "error";
      error: { code: string; message: string; details?: unknown };
    };

export type AutoQuoteTestResult =
  | {
      ok: true;
      data: {
        normalized: NormalizedAddress;
        serviceArea: ServiceAreaMatch;
        property: AutoQuotePropertyState;
        quote: AutoQuoteQuoteState;
      };
    }
  | { ok: false; error: { code: string; message: string } };

// Server action for /admin/auto-quote-test. Chains geo → service area
// → RentCast → Auto-Quote Plugin. Reads service_areas / services /
// service_plans / price_rules. Writes nothing.
export async function calculateAutoQuoteAction(
  placeId: string,
): Promise<AutoQuoteTestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Login required." },
    };
  }

  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: {
        code: "NO_BUSINESS",
        message: "No active business membership for this user.",
      },
    };
  }

  const detailsResult = await getPlaceDetails(placeId);
  if (!detailsResult.ok) {
    return { ok: false, error: detailsResult.error };
  }

  const normalized = normalizeAddress(detailsResult.data);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const areaResult = await matchServiceArea(
    business.id,
    normalized.data.city,
  );
  if (!areaResult.ok) {
    return { ok: false, error: areaResult.error };
  }

  // Out of area → skip RentCast and Auto-Quote.
  if (!areaResult.data.inArea) {
    return {
      ok: true,
      data: {
        normalized: normalized.data,
        serviceArea: areaResult.data,
        property: {
          state: "skipped",
          reason: "Address is outside the service area.",
        },
        quote: {
          state: "skipped",
          reason: "Address is outside the service area.",
        },
      },
    };
  }

  // In area → RentCast.
  const propertyResult = await enrichProperty(normalized.data);
  if (!propertyResult.ok) {
    return {
      ok: true,
      data: {
        normalized: normalized.data,
        serviceArea: areaResult.data,
        property: { state: "error", error: propertyResult.error },
        quote: {
          state: "skipped",
          reason: "RentCast lookup failed; skipping Auto-Quote.",
        },
      },
    };
  }

  // Property found / missing → call the plugin. The plugin itself
  // handles the "manual quote required" branch when sqft is null.
  const quoteResult = await calculateWindowCleaningQuote({
    businessId: business.id,
    square_footage: propertyResult.data.square_footage,
    property_data_status: propertyResult.data.property_data_status,
    property_type: propertyResult.data.property_type,
    service_area_id: areaResult.data.serviceAreaId,
    normalized_address: normalized.data,
    property_snapshot: propertyResult.data.provider_snapshot,
  });

  if (!quoteResult.ok) {
    return {
      ok: true,
      data: {
        normalized: normalized.data,
        serviceArea: areaResult.data,
        property: { state: "ok", data: propertyResult.data },
        quote: { state: "error", error: quoteResult.error },
      },
    };
  }

  return {
    ok: true,
    data: {
      normalized: normalized.data,
      serviceArea: areaResult.data,
      property: { state: "ok", data: propertyResult.data },
      quote: { state: "ok", data: quoteResult.data },
    },
  };
}
