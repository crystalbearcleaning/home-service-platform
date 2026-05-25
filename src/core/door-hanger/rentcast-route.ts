import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { getPlaceDetails, normalizeAddress } from "@/core/geo";
import { searchPropertiesByRadius } from "@/core/property-data/rentcast-search";
import {
  clampTargetToBatchLimit,
  normalizeRentcastCandidates,
  validateGenerateRouteInput,
  type CandidatePreview,
  type GenerateRouteFormInput,
} from "./rentcast-candidates";
import {
  DOOR_HANGER_ROUTE_STATUSES,
  type DoorHangerRouteStatus,
} from "@/plugins/door-hanger";

// =========================================================================
// Phase 5C — generate + save a RentCast-backed door hanger route.
//
// Two server-only entry points:
//
//   generateRoutePreview(input)
//     1. validate input
//     2. resolve center address via Google (getPlaceDetails → normalizeAddress)
//     3. clamp target to RentCast's batch limit (≤500)
//     4. fire ONE RentCast search request
//     5. normalise + dedupe + cap candidates
//     6. return preview
//
//   saveRentcastRoute(input)
//     - insert door_hanger_routes with generated_from_source='rentcast'
//     - insert door_hanger_route_stops from the preview payload
//     - makes ZERO RentCast calls
// =========================================================================

export type RentcastPreviewSuccess = {
  centerAddress: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMiles: number;
  targetHomeCount: number;
  propertyType: string | null;
  candidates: CandidatePreview[];
  estimatedRentcastRequests: 1;
};

export type RentcastPreviewResult =
  | { ok: true; data: RentcastPreviewSuccess }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
        details?: unknown;
      };
    };

export async function generateRoutePreview(
  input: GenerateRouteFormInput,
): Promise<RentcastPreviewResult> {
  const v = validateGenerateRouteInput(input);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: v.code, message: v.message, fieldErrors: v.fieldErrors },
    };
  }

  // 1. Geocode the center.
  const place = await getPlaceDetails(v.data.centerPlaceId);
  if (!place.ok) {
    return {
      ok: false,
      error: {
        code: "GEO_FAILED",
        message: `Could not load center address: ${place.error.message}`,
        details: place.error.details,
      },
    };
  }
  const normalized = normalizeAddress(place.data);
  if (!normalized.ok) {
    return {
      ok: false,
      error: {
        code: "GEO_FAILED",
        message: `Could not normalize center address: ${normalized.error.message}`,
      },
    };
  }
  const addr = normalized.data;
  if (addr.latitude === null || addr.longitude === null) {
    return {
      ok: false,
      error: {
        code: "GEO_MISSING_COORDS",
        message:
          "Selected address did not include coordinates. Try a more specific address.",
      },
    };
  }

  // 2. Clamp target → batch limit.
  const limit = clampTargetToBatchLimit(v.data.targetHomeCount);
  if (!limit.ok) {
    return {
      ok: false,
      error: {
        code: limit.code,
        message: limit.message,
        fieldErrors: { targetHomeCount: limit.message },
      },
    };
  }

  // 3. ONE RentCast batch request.
  const search = await searchPropertiesByRadius({
    latitude: addr.latitude,
    longitude: addr.longitude,
    radiusMiles: v.data.radiusMiles,
    limit: limit.limit,
    propertyType: v.data.propertyType,
  });
  if (!search.ok) {
    return {
      ok: false,
      error: {
        code: `RENTCAST_${search.error.code}`,
        message: `RentCast search failed: ${search.error.message}`,
      },
    };
  }

  const candidates = normalizeRentcastCandidates({
    raw: search.data,
    target: v.data.targetHomeCount,
    center: { latitude: addr.latitude, longitude: addr.longitude },
  });

  return {
    ok: true,
    data: {
      centerAddress: addr.formatted_address,
      centerLatitude: addr.latitude,
      centerLongitude: addr.longitude,
      radiusMiles: v.data.radiusMiles,
      targetHomeCount: v.data.targetHomeCount,
      propertyType: v.data.propertyType,
      candidates,
      estimatedRentcastRequests: 1,
    },
  };
}

// -------------------------------------------------------------------------
// saveRentcastRoute — persist preview output. NEVER calls RentCast.
// -------------------------------------------------------------------------
export type SaveRentcastRouteInput = {
  businessId: string;
  name: string;
  campaignId: string | null;
  centerAddress: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMiles: number;
  targetHomeCount: number;
  status: DoorHangerRouteStatus;
  notes: string | null;
  candidates: CandidatePreview[];
};

export type SaveRentcastRouteResult =
  | {
      ok: true;
      data: {
        routeId: string;
        totalRouteStops: number;
      };
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

const NAME_MAX = 200;
const NOTES_MAX = 2000;

export async function saveRentcastRoute(
  input: SaveRentcastRouteInput,
): Promise<SaveRentcastRouteResult> {
  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Route name is required.",
        fieldErrors: { name: "Route name is required." },
      },
    };
  }
  if (name.length > NAME_MAX) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: `Route name must be ≤ ${NAME_MAX} characters.`,
        fieldErrors: { name: `Route name must be ≤ ${NAME_MAX} characters.` },
      },
    };
  }
  const notes = input.notes && input.notes.trim().length > 0 ? input.notes.trim() : null;
  if (notes && notes.length > NOTES_MAX) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: `Notes must be ≤ ${NOTES_MAX} characters.`,
        fieldErrors: { notes: `Notes must be ≤ ${NOTES_MAX} characters.` },
      },
    };
  }
  if (input.candidates.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_CANDIDATES",
        message: "Cannot save a route with zero candidates.",
      },
    };
  }
  if (!DOOR_HANGER_ROUTE_STATUSES.includes(input.status)) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Unknown route status." },
    };
  }

  const sb = createServiceRoleClient();

  if (input.campaignId) {
    const { data: c } = await sb
      .from("door_hanger_campaigns")
      .select("id,business_id")
      .eq("id", input.campaignId)
      .maybeSingle();
    if (!c || c.business_id !== input.businessId) {
      return {
        ok: false,
        error: {
          code: "FOREIGN_BUSINESS",
          message: "Campaign not found for this business.",
          fieldErrors: { campaignId: "Campaign not found." },
        },
      };
    }
  }

  const { data: routeRow, error: routeErr } = await sb
    .from("door_hanger_routes")
    .insert({
      business_id: input.businessId,
      campaign_id: input.campaignId,
      name,
      center_address: input.centerAddress,
      center_lat: input.centerLatitude,
      center_lng: input.centerLongitude,
      radius_miles: input.radiusMiles,
      target_home_count: input.targetHomeCount,
      generated_from_source: "rentcast",
      status: input.status,
      total_route_stops: input.candidates.length,
      notes,
    })
    .select("id")
    .single();
  if (routeErr || !routeRow) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: routeErr?.message ?? "Failed to insert route.",
      },
    };
  }

  const stopRows = input.candidates.map((c, idx) => ({
    business_id: input.businessId,
    route_id: routeRow.id,
    stop_order: idx,
    address: c.address,
    city: c.city,
    state: c.state,
    postal_code: c.postalCode,
    lat: c.latitude,
    lng: c.longitude,
    property_type: c.propertyType,
    square_footage: c.squareFootage,
    estimated_value_cents: c.estimatedValueCents,
    rentcast_snapshot: c.rentcastSnapshot,
    status: "pending",
  }));

  const { error: stopsErr } = await sb
    .from("door_hanger_route_stops")
    .insert(stopRows);
  if (stopsErr) {
    // Stops failed — surface to caller. The route row exists; the
    // operator can retry by deleting + re-generating manually. Phase 5C
    // does not auto-clean to keep things simple.
    return {
      ok: false,
      error: {
        code: "STOPS_INSERT_FAILED",
        message: `Route created (id ${routeRow.id}) but stops insert failed: ${stopsErr.message}`,
      },
    };
  }

  return {
    ok: true,
    data: {
      routeId: routeRow.id,
      totalRouteStops: input.candidates.length,
    },
  };
}
