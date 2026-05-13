"use server";

import { headers } from "next/headers";
import { resolveCustomerSurfaceByHost } from "@/core/app-surfaces/resolve";
import {
  checkRateLimit,
  getClientIpFromHeaders,
  hashIp,
  hashNormalizedAddress,
  recordRateLimitEvent,
} from "@/core/rate-limiter";
import {
  loadCustomerQuotePageContext,
  lookupAddressAndPreview,
  submitContactAndConvert,
  type AddressLookupResult,
  type ContactFormInput,
  type SelectionInput,
  type SubmitContactResult,
  type TrackingContext,
} from "@/plugins/customer-quote-sales-page";

// Public server action invoked from the /q client component when the
// customer selects a confirmed address. Re-resolves the surface from
// the request host (does not trust client-supplied businessId) and
// delegates to the plugin orchestrator.

export type LookupAddressActionInput = {
  placeId: string;
  formattedAddress: string;
  tracking?: TrackingContext;
};

export async function lookupAddressForQuoteAction(
  input: LookupAddressActionInput,
): Promise<AddressLookupResult> {
  try {
    if (!input?.placeId || input.placeId.trim().length === 0) {
      return {
        ok: false,
        error: { code: "INVALID_INPUT", message: "placeId is required." },
      };
    }

    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const surface = await resolveCustomerSurfaceByHost(host);
    if (!surface) {
      return {
        ok: false,
        error: {
          code: "BUSINESS_RESOLUTION_FAILED",
          message: "Could not resolve a customer surface for this host.",
        },
      };
    }

    const context = await loadCustomerQuotePageContext({
      businessId: surface.business.id,
      appSurfaceId: surface.appSurface.id,
    });
    if (!context.ok) {
      return {
        ok: false,
        error: {
          code: "BUSINESS_RESOLUTION_FAILED",
          message: context.error.message,
        },
      };
    }

    const clientIp = getClientIpFromHeaders(requestHeaders) ?? "0.0.0.0";

    return await lookupAddressAndPreview({
      businessId: context.data.business.id,
      appSurfaceId: context.data.appSurface.id,
      installedPluginId: context.data.installedPluginId,
      pluginVersion: context.data.pluginVersion,
      placeId: input.placeId,
      formattedAddressHint: input.formattedAddress ?? null,
      clientIp,
      tracking: input.tracking ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      "[lookupAddressForQuoteAction] unhandled error:",
      message,
      stack,
    );
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Address lookup failed unexpectedly: ${message}`,
      },
    };
  }
}

// =========================================================================
// C3: submitContactForQuoteAction
//
// Public server action invoked when the customer fills out the inline
// contact form and clicks "Request Scheduling". Re-resolves the surface
// from the request host, rate-limits via quote.submit_contact, and
// delegates to the plugin orchestrator which creates Contact / Property
// / Lead / Quote / Task and marks the interaction converted.
// =========================================================================

const SUBMIT_CONTACT_ACTION_KEY = "quote.submit_contact" as const;

export type SubmitContactActionInput = {
  interactionId: string;
  contact: ContactFormInput;
  selection: SelectionInput;
};

export async function submitContactForQuoteAction(
  input: SubmitContactActionInput,
): Promise<SubmitContactResult> {
  try {
    if (!input?.interactionId || input.interactionId.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "interactionId is required.",
        },
      };
    }

    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const surface = await resolveCustomerSurfaceByHost(host);
    if (!surface) {
      return {
        ok: false,
        error: {
          code: "BUSINESS_RESOLUTION_FAILED",
          message: "Could not resolve a customer surface for this host.",
        },
      };
    }

    const clientIp = getClientIpFromHeaders(requestHeaders) ?? "0.0.0.0";
    const ipHash = hashIp(clientIp);
    // Use interactionId as the address bucket since one interaction maps
    // to one address; this also rate-limits duplicate submit attempts.
    const addressHash = hashNormalizedAddress(input.interactionId);

    const limitCheck = await checkRateLimit({
      actionKey: SUBMIT_CONTACT_ACTION_KEY,
      ipHash,
      addressHash,
    });
    if (!limitCheck.ok) {
      return {
        ok: false,
        error: {
          code: "INTERNAL",
          message: `Rate-limit check failed: ${limitCheck.error.message}`,
        },
      };
    }
    if (!limitCheck.check.allowed) {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Try again in ${limitCheck.check.retryAfterSeconds}s.`,
        },
      };
    }

    const result = await submitContactAndConvert({
      businessId: surface.business.id,
      appSurfaceId: surface.appSurface.id,
      interactionId: input.interactionId,
      contact: input.contact,
      selection: input.selection,
    });

    if (result.ok) {
      // Record on the success path so failed/blocked attempts don't
      // count against the bucket (matches B7's pattern).
      await recordRateLimitEvent({
        actionKey: SUBMIT_CONTACT_ACTION_KEY,
        ipHash,
        addressHash,
        metadata: { kind: result.data.kind },
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      "[submitContactForQuoteAction] unhandled error:",
      message,
      stack,
    );
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Contact submission failed unexpectedly: ${message}`,
      },
    };
  }
}
