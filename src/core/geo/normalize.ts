import type {
  GeoResult,
  GoogleAddressComponent,
  NormalizedAddress,
  SafeRawGooglePlace,
} from "./types";

// ---------------------------------------------------------------------------
// Pure normalization helpers. No DB, no fetch, no env vars — safe to unit
// test directly, safe to import from any context.
// ---------------------------------------------------------------------------

type UnknownPlace = {
  place_id?: unknown;
  formatted_address?: unknown;
  address_components?: unknown;
  geometry?: unknown;
  types?: unknown;
  name?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asAddressComponents(v: unknown): GoogleAddressComponent[] {
  if (!Array.isArray(v)) return [];
  const out: GoogleAddressComponent[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const long_name = asString(item.long_name);
    const short_name = asString(item.short_name);
    const types = Array.isArray(item.types)
      ? item.types.filter((t): t is string => typeof t === "string")
      : [];
    if (long_name && short_name) {
      out.push({ long_name, short_name, types });
    }
  }
  return out;
}

export function findComponent(
  components: GoogleAddressComponent[],
  type: string,
): GoogleAddressComponent | undefined {
  return components.find((c) => c.types.includes(type));
}

// Locality with sensible fallbacks for places where Google returns
// sublocality / postal_town / administrative_area_level_3 instead.
export function extractCity(
  components: GoogleAddressComponent[],
): GoogleAddressComponent | undefined {
  return (
    findComponent(components, "locality") ??
    findComponent(components, "sublocality") ??
    findComponent(components, "sublocality_level_1") ??
    findComponent(components, "postal_town") ??
    findComponent(components, "administrative_area_level_3")
  );
}

export function buildAddressLine1(
  components: GoogleAddressComponent[],
  fallback: string,
): string {
  const streetNumber = findComponent(components, "street_number")?.long_name;
  const route = findComponent(components, "route")?.long_name;
  const composed = [streetNumber, route].filter(Boolean).join(" ").trim();
  return composed || fallback;
}

export function normalizeAddress(place: unknown): GeoResult<NormalizedAddress> {
  if (!isObject(place)) {
    return {
      ok: false,
      error: {
        code: "INVALID_PLACE",
        message: "Place response is not an object.",
      },
    };
  }

  const raw = place as UnknownPlace;

  const placeId = asString(raw.place_id);
  if (!placeId) {
    return {
      ok: false,
      error: {
        code: "INVALID_PLACE",
        message: "Place response is missing place_id.",
      },
    };
  }

  const formattedAddress = asString(raw.formatted_address) ?? "";
  const components = asAddressComponents(raw.address_components);

  const cityComp = extractCity(components);
  if (!cityComp) {
    return {
      ok: false,
      error: {
        code: "MISSING_CITY",
        message: "No locality / sublocality found in address components.",
      },
    };
  }

  const stateComp = findComponent(components, "administrative_area_level_1");
  if (!stateComp) {
    return {
      ok: false,
      error: {
        code: "MISSING_STATE",
        message: "No administrative area found in address components.",
      },
    };
  }

  const countryComp = findComponent(components, "country");
  const country = countryComp?.short_name ?? "US";
  const postalCode = findComponent(components, "postal_code")?.long_name ?? null;
  const subpremise =
    findComponent(components, "subpremise")?.long_name ?? null;

  // geometry.location.lat/lng
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (isObject(raw.geometry)) {
    const location = (raw.geometry as { location?: unknown }).location;
    if (isObject(location)) {
      latitude = asNumber((location as { lat?: unknown }).lat);
      longitude = asNumber((location as { lng?: unknown }).lng);
    }
  }

  const types = Array.isArray(raw.types)
    ? raw.types.filter((t): t is string => typeof t === "string")
    : [];

  const safeRaw: SafeRawGooglePlace = {
    place_id: placeId,
    formatted_address: formattedAddress,
    types,
    address_components: components,
    geometry:
      latitude !== null && longitude !== null
        ? { location: { lat: latitude, lng: longitude } }
        : null,
    name: asString(raw.name),
  };

  return {
    ok: true,
    data: {
      formatted_address: formattedAddress,
      address_line_1: buildAddressLine1(components, formattedAddress),
      address_line_2: subpremise,
      city: cityComp.long_name,
      state: stateComp.short_name,
      postal_code: postalCode,
      country,
      google_place_id: placeId,
      latitude,
      longitude,
      raw_google_response: safeRaw,
    },
  };
}
