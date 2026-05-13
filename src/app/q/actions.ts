"use server";

import { headers } from "next/headers";
import { resolveCustomerSurfaceByHost } from "@/core/app-surfaces/resolve";
import { getClientIpFromHeaders } from "@/core/rate-limiter";
import {
  loadCustomerQuotePageContext,
  lookupAddressAndPreview,
  type AddressLookupResult,
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
