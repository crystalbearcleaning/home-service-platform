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

export type PropertyTestPropertyState =
  | { state: "skipped"; reason: string }
  | { state: "ok"; data: NormalizedPropertyData }
  | {
      state: "error";
      error: { code: string; message: string; details?: unknown };
    };

export type PropertyTestResult =
  | {
      ok: true;
      data: {
        normalized: NormalizedAddress;
        serviceArea: ServiceAreaMatch;
        property: PropertyTestPropertyState;
      };
    }
  | { ok: false; error: { code: string; message: string } };

// Server action used by /admin/property-data-test. Auth-gated to the
// admin context. Chains geo → service area → RentCast. Reads
// service_areas only. Does not write to any table.
export async function lookupPropertyAction(
  placeId: string,
): Promise<PropertyTestResult> {
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

  // 1. Geo: place details
  const detailsResult = await getPlaceDetails(placeId);
  if (!detailsResult.ok) {
    return { ok: false, error: detailsResult.error };
  }

  // 2. Geo: normalize
  const normalized = normalizeAddress(detailsResult.data);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  // 3. Geo: service area
  const areaResult = await matchServiceArea(
    business.id,
    normalized.data.city,
  );
  if (!areaResult.ok) {
    return { ok: false, error: areaResult.error };
  }

  // 4. If out of area, skip RentCast.
  if (!areaResult.data.inArea) {
    return {
      ok: true,
      data: {
        normalized: normalized.data,
        serviceArea: areaResult.data,
        property: {
          state: "skipped",
          reason:
            "Address is outside the service area; RentCast not called.",
        },
      },
    };
  }

  // 5. RentCast lookup + normalize
  const propertyResult = await enrichProperty(normalized.data);
  if (!propertyResult.ok) {
    return {
      ok: true,
      data: {
        normalized: normalized.data,
        serviceArea: areaResult.data,
        property: { state: "error", error: propertyResult.error },
      },
    };
  }

  return {
    ok: true,
    data: {
      normalized: normalized.data,
      serviceArea: areaResult.data,
      property: { state: "ok", data: propertyResult.data },
    },
  };
}
