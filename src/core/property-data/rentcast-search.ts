import "server-only";

import {
  buildRentcastSearchQuery,
  type RentcastSearchParams,
} from "@/core/door-hanger/rentcast-candidates";
import type { PropertyDataResult } from "./types";

// =========================================================================
// RentCast Property Records — batch nearby search.
// Server-only. ONE GET request to /v1/properties returns up to 500
// records around a lat/lng + radius (miles). Phase 5C never paginates.
//
// Endpoint:   GET https://api.rentcast.io/v1/properties
//   Query:    latitude, longitude, radius (miles), limit (≤500),
//             propertyType (optional)
//   Header:   X-Api-Key: $RENTCAST_API_KEY
//
// Returns the raw JSON body (array of property objects). Callers must
// normalise via `normalizeRentcastCandidates`.
// =========================================================================

const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";

function getApiKey(): string | null {
  const key = process.env.RENTCAST_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

export async function searchPropertiesByRadius(
  input: RentcastSearchParams,
): Promise<PropertyDataResult<unknown>> {
  const key = getApiKey();
  if (!key) {
    return {
      ok: false,
      error: { code: "MISSING_KEY", message: "RENTCAST_API_KEY is not set." },
    };
  }

  const sp = buildRentcastSearchQuery(input);
  const url = `${RENTCAST_BASE_URL}/properties?${sp.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": key, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message: err instanceof Error ? err.message : "RentCast fetch failed.",
      },
    };
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message =
      body &&
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : `RentCast returned HTTP ${response.status}.`;
    return {
      ok: false,
      error: {
        code:
          response.status === 401 || response.status === 403
            ? "UNAUTHORIZED"
            : "HTTP_ERROR",
        message,
        details: body,
      },
    };
  }

  try {
    return { ok: true, data: await response.json() };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message:
          err instanceof Error
            ? err.message
            : "RentCast response was not valid JSON.",
      },
    };
  }
}
