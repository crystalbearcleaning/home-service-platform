// Pure adapter: convert a Places API (New) `Place` response into the
// legacy-shaped object that `normalizeAddress` already understands.
//
// New shape (camelCase):
//   { id, formattedAddress, addressComponents: [{ longText, shortText, types }],
//     location: { latitude, longitude }, types, displayName: { text, languageCode } }
//
// Legacy shape (snake_case) consumed by normalizeAddress:
//   { place_id, formatted_address,
//     address_components: [{ long_name, short_name, types }],
//     geometry: { location: { lat, lng } }, types, name }

type NewAddressComponent = {
  longText?: unknown;
  shortText?: unknown;
  types?: unknown;
};

type NewPlace = {
  id?: unknown;
  formattedAddress?: unknown;
  addressComponents?: unknown;
  location?: unknown;
  types?: unknown;
  displayName?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is string => typeof t === "string");
}

export function adaptNewPlace(input: unknown): unknown {
  if (!isObject(input)) return null;
  const np = input as NewPlace;

  // address_components
  const components = Array.isArray(np.addressComponents)
    ? (np.addressComponents as NewAddressComponent[]).map((c) => {
        const longName = asString(c.longText);
        const shortName = asStringOrNull(c.shortText) ?? longName;
        return {
          long_name: longName,
          short_name: shortName,
          types: asStringArray(c.types),
        };
      })
    : [];

  // geometry.location
  let geometry: { location: { lat: number; lng: number } } | undefined;
  if (isObject(np.location)) {
    const loc = np.location as { latitude?: unknown; longitude?: unknown };
    const lat = asNumber(loc.latitude);
    const lng = asNumber(loc.longitude);
    if (lat !== null && lng !== null) {
      geometry = { location: { lat, lng } };
    }
  }

  // name
  let name: string | undefined;
  if (isObject(np.displayName)) {
    const dn = np.displayName as { text?: unknown };
    if (typeof dn.text === "string") name = dn.text;
  }

  return {
    place_id: asString(np.id),
    formatted_address: asString(np.formattedAddress),
    address_components: components,
    geometry,
    types: asStringArray(np.types),
    name,
  };
}
