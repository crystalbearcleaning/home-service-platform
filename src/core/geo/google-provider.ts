import "server-only";
import { adaptNewPlace } from "./adapt-new-place";
import type { AutocompletePrediction, GeoResult } from "./types";

// =========================================================================
// Google Places API (New) — server-side
//
// The legacy `maps.googleapis.com/maps/api/place/...` endpoints require the
// "Places API (Legacy)" to be enabled. We instead use the modern endpoints
// at `places.googleapis.com/v1/...` which only require "Places API (New)".
//
// New endpoints return camelCase fields. `adaptNewPlace` converts them
// into the legacy-shaped object that `normalizeAddress` already consumes,
// so the rest of the geo pipeline is unchanged.
// =========================================================================

const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "formattedAddress",
  "addressComponents",
  "location",
  "types",
  "displayName",
].join(",");

const AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text",
  "suggestions.placePrediction.structuredFormat",
].join(",");

function getServerKey(): string | null {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

async function parseErrorBody(
  response: Response,
): Promise<{ message: string; details: unknown }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (
    body &&
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object" &&
    (body as { error?: { message?: unknown } }).error !== null
  ) {
    const err = (body as { error: { message?: unknown; status?: unknown } })
      .error;
    if (typeof err.message === "string") {
      return { message: err.message, details: body };
    }
  }
  return {
    message: `Places API returned HTTP ${response.status}.`,
    details: body,
  };
}

// ---------------------------------------------------------------------------
// getPlaceDetails — Places API (New) GET /v1/places/{place_id}
// Returns a legacy-shaped object via adaptNewPlace so normalizeAddress
// continues to work unchanged.
// ---------------------------------------------------------------------------
export async function getPlaceDetails(
  placeId: string,
): Promise<GeoResult<unknown>> {
  if (!placeId || placeId.trim().length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_INPUT", message: "placeId is required." },
    };
  }

  const key = getServerKey();
  if (!key) {
    return {
      ok: false,
      error: {
        code: "MISSING_KEY",
        message: "GOOGLE_MAPS_SERVER_API_KEY is not set.",
      },
    };
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error ? err.message : "Place Details fetch failed.",
      },
    };
  }

  if (!response.ok) {
    const { message, details } = await parseErrorBody(response);
    const code = response.status === 403 ? "REQUEST_DENIED" : "HTTP_ERROR";
    return { ok: false, error: { code, message, details } };
  }

  const body = (await response.json()) as unknown;
  const adapted = adaptNewPlace(body);
  if (!adapted) {
    return {
      ok: false,
      error: {
        code: "INVALID_PLACE",
        message: "Places API returned an unexpected response body.",
        details: body,
      },
    };
  }
  return { ok: true, data: adapted };
}

// ---------------------------------------------------------------------------
// autocompleteAddress — Places API (New) POST /v1/places:autocomplete
// ---------------------------------------------------------------------------
export type AutocompleteOptions = {
  sessionToken?: string;
  countryCodes?: string[]; // ISO 3166-1 alpha-2, default ['us']
};

type NewPrediction = {
  placePrediction?: {
    placeId?: unknown;
    text?: { text?: unknown };
    structuredFormat?: {
      mainText?: { text?: unknown };
      secondaryText?: { text?: unknown };
    };
  };
};

export async function autocompleteAddress(
  input: string,
  options: AutocompleteOptions = {},
): Promise<GeoResult<AutocompletePrediction[]>> {
  if (!input || input.trim().length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_INPUT", message: "input is required." },
    };
  }

  const key = getServerKey();
  if (!key) {
    return {
      ok: false,
      error: {
        code: "MISSING_KEY",
        message: "GOOGLE_MAPS_SERVER_API_KEY is not set.",
      },
    };
  }

  const countries = options.countryCodes ?? ["us"];

  const requestBody: Record<string, unknown> = {
    input,
    includedRegionCodes: countries.map((c) => c.toLowerCase()),
    includedPrimaryTypes: ["street_address", "premise"],
  };
  if (options.sessionToken) {
    requestBody.sessionToken = options.sessionToken;
  }

  let response: Response;
  try {
    response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Place Autocomplete fetch failed.",
      },
    };
  }

  if (!response.ok) {
    const { message, details } = await parseErrorBody(response);
    const code = response.status === 403 ? "REQUEST_DENIED" : "HTTP_ERROR";
    return { ok: false, error: { code, message, details } };
  }

  const body = (await response.json()) as { suggestions?: NewPrediction[] };
  const predictions: AutocompletePrediction[] = (body.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter(
      (p): p is NonNullable<NewPrediction["placePrediction"]> => p != null,
    )
    .filter((p) => typeof p.placeId === "string")
    .map((p) => ({
      placeId: p.placeId as string,
      description:
        typeof p.text?.text === "string" ? (p.text.text as string) : "",
      mainText:
        typeof p.structuredFormat?.mainText?.text === "string"
          ? (p.structuredFormat.mainText.text as string)
          : null,
      secondaryText:
        typeof p.structuredFormat?.secondaryText?.text === "string"
          ? (p.structuredFormat.secondaryText.text as string)
          : null,
    }));

  return { ok: true, data: predictions };
}
