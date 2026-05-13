import "server-only";
import {
  getPlaceDetails,
  matchServiceArea,
  normalizeAddress,
} from "@/core/geo";
import { enrichProperty } from "@/core/property-data";
import { calculateWindowCleaningQuote } from "@/plugins/window-cleaning-auto-quote";
import {
  checkRateLimit,
  hashIp,
  hashNormalizedAddress,
  recordRateLimitEvent,
} from "@/core/rate-limiter";
import { decideOutcome } from "./outcome";
import { recordQuotePageInteraction } from "./interactions";
import type {
  AddressLookupResult,
  TrackingContext,
} from "./types";

// =========================================================================
// Public address-lookup orchestrator. Drives the C2 flow end-to-end:
//
//   rate-limit check                   (B7)
//   Google place details + normalize   (B5)
//   service-area match                 (B5)
//   RentCast lookup (if in-area)       (B6)
//   Auto-Quote calculation (if sqft)   (C1)
//   write quote_page_interactions      (this plugin)
//   record rate-limit event            (B7)
//
// Never throws. Returns AddressLookupResult.
// =========================================================================

const ACTION_KEY = "quote.address_lookup" as const;

export type LookupAddressInput = {
  businessId: string;
  appSurfaceId: string;
  installedPluginId: string | null;
  pluginVersion: string;
  placeId: string;
  formattedAddressHint: string | null; // from the autocomplete display
  clientIp: string;
  sessionKey?: string | null;
  tracking?: TrackingContext | null;
};

export async function lookupAddressAndPreview(
  input: LookupAddressInput,
): Promise<AddressLookupResult> {
  try {
    return await lookupAddressAndPreviewInner(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      "[lookupAddressAndPreview] unhandled error:",
      message,
      stack,
    );
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Unexpected error during address lookup: ${message}`,
      },
    };
  }
}

async function lookupAddressAndPreviewInner(
  input: LookupAddressInput,
): Promise<AddressLookupResult> {
  if (!input.businessId || !input.appSurfaceId || !input.placeId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          "businessId, appSurfaceId and placeId are required.",
      },
    };
  }

  const ipHash = hashIp(input.clientIp);
  // Use the Google place_id as the address-bucket key. It's stable per
  // unique address and lets the rate-limiter gate repeat lookups for
  // the same place before they hit RentCast / Auto-Quote.
  const addressHash = hashNormalizedAddress(input.placeId);

  // ------ rate-limit pre-check ------
  const checkResult = await checkRateLimit({
    actionKey: ACTION_KEY,
    ipHash,
    addressHash,
  });
  if (!checkResult.ok) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Rate-limit check failed: ${checkResult.error.message}`,
      },
    };
  }
  if (!checkResult.check.allowed) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${checkResult.check.retryAfterSeconds}s.`,
        retryAfterSeconds: checkResult.check.retryAfterSeconds,
      },
    };
  }

  // ------ geo ------
  const detailsResult = await getPlaceDetails(input.placeId);
  if (!detailsResult.ok) {
    return {
      ok: false,
      error: {
        code: "GEO_FAILED",
        message: `Google place details failed: ${detailsResult.error.message}`,
      },
    };
  }

  const normalizedResult = normalizeAddress(detailsResult.data);
  if (!normalizedResult.ok) {
    return {
      ok: false,
      error: {
        code: "GEO_FAILED",
        message: `Address normalization failed: ${normalizedResult.error.message}`,
      },
    };
  }
  const normalized = normalizedResult.data;
  const formattedAddress =
    normalized.formatted_address || input.formattedAddressHint || "";

  // ------ service area ------
  const areaResult = await matchServiceArea(input.businessId, normalized.city);
  if (!areaResult.ok) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Service-area match failed: ${areaResult.error.message}`,
      },
    };
  }

  // ------ RentCast (only if in-area) ------
  let property = null;
  let propertyHardError: string | null = null;
  if (areaResult.data.inArea) {
    const propertyResult = await enrichProperty(normalized);
    if (propertyResult.ok) {
      property = propertyResult.data;
    } else {
      propertyHardError = `${propertyResult.error.code}: ${propertyResult.error.message}`;
    }
  }

  // ------ Auto-Quote (only if RentCast returned + sqft present) ------
  let quote = null;
  if (
    areaResult.data.inArea &&
    property &&
    property.property_data_status === "found" &&
    property.square_footage !== null
  ) {
    quote = await calculateWindowCleaningQuote({
      businessId: input.businessId,
      square_footage: property.square_footage,
      property_data_status: property.property_data_status,
      property_type: property.property_type,
      service_area_id: areaResult.data.serviceAreaId,
      normalized_address: normalized,
      property_snapshot: property.provider_snapshot,
    });
  }

  // ------ Outcome decision ------
  const decided = decideOutcome({
    serviceArea: areaResult.data,
    property: property,
    quote: quote,
  });

  // ------ Write interaction ------
  const interactionWrite = await recordQuotePageInteraction({
    businessId: input.businessId,
    appSurfaceId: input.appSurfaceId,
    installedPluginId: input.installedPluginId,
    pluginVersion: input.pluginVersion,
    sessionKey: input.sessionKey ?? null,
    addressInput: input.formattedAddressHint,
    normalizedAddress: normalized,
    normalizedCity: areaResult.data.normalizedCity,
    googlePlaceId: normalized.google_place_id,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    serviceAreaStatus: decided.serviceAreaStatus,
    propertyDataStatus: decided.propertyDataStatus,
    propertyDataSummary: property?.provider_snapshot ?? null,
    providerError: propertyHardError ?? decided.providerError,
    interactionStatus: decided.interactionStatus,
    quotePreviewData: decided.quotePreview,
    selectedOptionKey: null,
    selectedAddOns: null,
    selectedTotal: null,
    tracking: input.tracking ?? null,
  });

  if (!interactionWrite.ok) {
    return {
      ok: false,
      error: {
        code: "INTERACTION_WRITE_FAILED",
        message: interactionWrite.error.message,
        details: interactionWrite.error.details,
      },
    };
  }

  // ------ Record rate-limit event (success-side only) ------
  await recordRateLimitEvent({
    actionKey: ACTION_KEY,
    ipHash,
    addressHash,
    metadata: {
      interaction_status: decided.interactionStatus,
      service_area_status: decided.serviceAreaStatus,
    },
  });

  // ------ Map to client-facing kind ------
  if (decided.interactionStatus === "out_of_area") {
    return {
      ok: true,
      data: {
        kind: "out_of_area",
        interactionId: interactionWrite.interactionId,
        normalizedAddress: normalized,
        formattedAddress,
        fallbackMessage:
          "Looks like this address may be outside our current service area.",
        contactStepMessage: "Contact step will be added next.",
      },
    };
  }

  if (decided.interactionStatus === "property_data_missing") {
    return {
      ok: true,
      data: {
        kind: "property_data_missing",
        interactionId: interactionWrite.interactionId,
        normalizedAddress: normalized,
        formattedAddress,
        fallbackMessage:
          "We don't have your home in our system yet! Our team can prepare a custom quote shortly.",
        contactStepMessage: "Contact step will be added next.",
      },
    };
  }

  if (decided.interactionStatus === "quote_generated" && decided.quotePreview) {
    return {
      ok: true,
      data: {
        kind: "quote_generated",
        interactionId: interactionWrite.interactionId,
        normalizedAddress: normalized,
        formattedAddress,
        quotePreview: decided.quotePreview,
      },
    };
  }

  // Fallback: surface as a hard error so the UI can show something.
  return {
    ok: false,
    error: {
      code: "INTERNAL",
      message:
        decided.reason ?? "Address lookup ended in an unexpected state.",
    },
  };
}
