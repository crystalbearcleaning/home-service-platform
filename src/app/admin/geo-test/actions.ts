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

export type LookupAddressResult =
  | {
      ok: true;
      data: {
        normalized: NormalizedAddress;
        serviceArea: ServiceAreaMatch;
      };
    }
  | { ok: false; error: { code: string; message: string } };

// Server action used by the /admin/geo-test page.
// Auth-gated to the same admin context as the rest of /admin. Does NOT
// create any DB rows — only reads service_areas.
export async function lookupAddressAction(
  placeId: string,
): Promise<LookupAddressResult> {
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

  const areaResult = await matchServiceArea(business.id, normalized.data.city);
  if (!areaResult.ok) {
    return { ok: false, error: areaResult.error };
  }

  return {
    ok: true,
    data: {
      normalized: normalized.data,
      serviceArea: areaResult.data,
    },
  };
}
