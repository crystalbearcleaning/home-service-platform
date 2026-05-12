import { describe, it, expect } from "vitest";
import { adaptNewPlace } from "./adapt-new-place";
import { normalizeAddress } from "./normalize";

const NEW_API_BOYNTON = {
  id: "ChIJ_TEST_NEW_PLACE_ID",
  formattedAddress: "123 Main St, Boynton Beach, FL 33435, USA",
  displayName: { text: "123 Main St", languageCode: "en" },
  location: { latitude: 26.5318, longitude: -80.0905 },
  types: ["street_address"],
  addressComponents: [
    { longText: "123", shortText: "123", types: ["street_number"] },
    { longText: "Main Street", shortText: "Main St", types: ["route"] },
    {
      longText: "Boynton Beach",
      shortText: "Boynton Beach",
      types: ["locality", "political"],
    },
    {
      longText: "Florida",
      shortText: "FL",
      types: ["administrative_area_level_1"],
    },
    { longText: "United States", shortText: "US", types: ["country"] },
    { longText: "33435", shortText: "33435", types: ["postal_code"] },
  ],
};

describe("adaptNewPlace", () => {
  it("returns null for non-objects", () => {
    expect(adaptNewPlace(null)).toBeNull();
    expect(adaptNewPlace("string")).toBeNull();
    expect(adaptNewPlace(42)).toBeNull();
  });

  it("maps the new API shape to legacy keys", () => {
    const adapted = adaptNewPlace(NEW_API_BOYNTON) as {
      place_id: string;
      formatted_address: string;
      address_components: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
      geometry: { location: { lat: number; lng: number } } | undefined;
      types: string[];
      name?: string;
    };

    expect(adapted.place_id).toBe("ChIJ_TEST_NEW_PLACE_ID");
    expect(adapted.formatted_address).toBe(
      "123 Main St, Boynton Beach, FL 33435, USA",
    );
    expect(adapted.name).toBe("123 Main St");
    expect(adapted.geometry?.location.lat).toBeCloseTo(26.5318);
    expect(adapted.geometry?.location.lng).toBeCloseTo(-80.0905);
    expect(adapted.address_components).toHaveLength(6);
    expect(adapted.address_components[0]).toEqual({
      long_name: "123",
      short_name: "123",
      types: ["street_number"],
    });
  });

  it("falls back short_name → long_name when shortText is absent", () => {
    const adapted = adaptNewPlace({
      id: "X",
      formattedAddress: "x",
      addressComponents: [
        { longText: "Solo", types: ["locality"] },
      ],
    }) as {
      address_components: Array<{ long_name: string; short_name: string }>;
    };
    expect(adapted.address_components[0]?.long_name).toBe("Solo");
    expect(adapted.address_components[0]?.short_name).toBe("Solo");
  });

  it("omits geometry when location is missing or invalid", () => {
    const adapted = adaptNewPlace({
      id: "X",
      formattedAddress: "x",
      addressComponents: [],
      // no location field
    }) as { geometry?: unknown };
    expect(adapted.geometry).toBeUndefined();

    const adapted2 = adaptNewPlace({
      id: "X",
      formattedAddress: "x",
      location: { latitude: "nope" },
    }) as { geometry?: unknown };
    expect(adapted2.geometry).toBeUndefined();
  });

  it("output feeds straight into normalizeAddress without complaint", () => {
    const adapted = adaptNewPlace(NEW_API_BOYNTON);
    const normalized = normalizeAddress(adapted);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.data.city).toBe("Boynton Beach");
    expect(normalized.data.state).toBe("FL");
    expect(normalized.data.google_place_id).toBe("ChIJ_TEST_NEW_PLACE_ID");
    expect(normalized.data.latitude).toBeCloseTo(26.5318);
  });
});
