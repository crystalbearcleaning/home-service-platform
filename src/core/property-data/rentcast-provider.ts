import "server-only";
import type {
  PropertyDataError,
  PropertyDataResult,
  PropertyLookupAddress,
} from "./types";

// =========================================================================
// RentCast Property Records API — server-side only.
//
// Endpoint: GET https://api.rentcast.io/v1/properties
//   Query:  address=<full formatted address>
//   Header: X-Api-Key: $RENTCAST_API_KEY
//
// Returns the raw JSON body (typically an array of property objects).
// Callers normalize via normalizePropertyData / normalizeFirstProperty.
// =========================================================================

const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";

function getApiKey(): string | null {
  const key = process.env.RENTCAST_API_KEY;
  return key && key.trim().length > 0 ? key : null;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function classifyHttpError(status: number): "UNAUTHORIZED" | "HTTP_ERROR" {
  return status === 401 || status === 403 ? "UNAUTHORIZED" : "HTTP_ERROR";
}

function errorMessageFromBody(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as { message?: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return `RentCast returned HTTP ${status}.`;
}

// ---------------------------------------------------------------------------
// lookupPropertyByAddress — raw RentCast lookup. Returns the unparsed
// (but JSON-decoded) body on success. Callers must normalize.
// ---------------------------------------------------------------------------
export async function lookupPropertyByAddress(
  address: PropertyLookupAddress,
): Promise<PropertyDataResult<unknown>> {
  const key = getApiKey();
  if (!key) {
    return {
      ok: false,
      error: {
        code: "MISSING_KEY",
        message: "RENTCAST_API_KEY is not set.",
      },
    };
  }

  const query = address.formatted_address?.trim();
  if (!query) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "address.formatted_address is required.",
      },
    };
  }

  const url = new URL(`${RENTCAST_BASE_URL}/properties`);
  url.searchParams.set("address", query);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Api-Key": key,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error ? err.message : "RentCast fetch failed.",
      },
    };
  }

  if (!response.ok) {
    const body = await safeParseJson(response);
    const error: PropertyDataError = {
      code: classifyHttpError(response.status),
      message: errorMessageFromBody(body, response.status),
      details: body,
    };
    return { ok: false, error };
  }

  let body: unknown;
  try {
    body = await response.json();
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

  return { ok: true, data: body };
}
