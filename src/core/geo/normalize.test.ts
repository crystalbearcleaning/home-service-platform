import { describe, it, expect } from "vitest";
import {
  buildAddressLine1,
  extractCity,
  findComponent,
  normalizeAddress,
} from "./normalize";
import type { GoogleAddressComponent } from "./types";

// Compact fixture builder
function comp(
  long_name: string,
  short_name: string,
  types: string[],
): GoogleAddressComponent {
  return { long_name, short_name, types };
}

const boyntonBeachAddress = {
  place_id: "ChIJ_TEST_PLACE_ID",
  formatted_address: "123 Main St, Boynton Beach, FL 33435, USA",
  geometry: { location: { lat: 26.5318, lng: -80.0905 } },
  types: ["street_address"],
  address_components: [
    comp("123", "123", ["street_number"]),
    comp("Main Street", "Main St", ["route"]),
    comp("Boynton Beach", "Boynton Beach", ["locality", "political"]),
    comp("Palm Beach County", "Palm Beach County", [
      "administrative_area_level_2",
    ]),
    comp("Florida", "FL", ["administrative_area_level_1"]),
    comp("United States", "US", ["country"]),
    comp("33435", "33435", ["postal_code"]),
  ],
};

describe("findComponent", () => {
  it("returns the matching component by type", () => {
    const components = boyntonBeachAddress.address_components;
    expect(findComponent(components, "locality")?.long_name).toBe(
      "Boynton Beach",
    );
    expect(findComponent(components, "country")?.short_name).toBe("US");
  });

  it("returns undefined when not present", () => {
    expect(findComponent([], "locality")).toBeUndefined();
  });
});

describe("extractCity", () => {
  it("prefers locality", () => {
    const result = extractCity(boyntonBeachAddress.address_components);
    expect(result?.long_name).toBe("Boynton Beach");
  });

  it("falls back to sublocality when locality is missing", () => {
    const components = [
      comp("Some Hood", "Some Hood", ["sublocality"]),
      comp("FL", "FL", ["administrative_area_level_1"]),
    ];
    expect(extractCity(components)?.long_name).toBe("Some Hood");
  });

  it("falls back to postal_town when sublocality is missing", () => {
    const components = [
      comp("Some Town", "Some Town", ["postal_town"]),
    ];
    expect(extractCity(components)?.long_name).toBe("Some Town");
  });

  it("returns undefined when nothing matches", () => {
    expect(extractCity([])).toBeUndefined();
  });
});

describe("buildAddressLine1", () => {
  it("composes street_number + route", () => {
    const result = buildAddressLine1(
      boyntonBeachAddress.address_components,
      "fallback",
    );
    expect(result).toBe("123 Main Street");
  });

  it("falls back when no street components present", () => {
    const result = buildAddressLine1([], "100 Fallback St");
    expect(result).toBe("100 Fallback St");
  });
});

describe("normalizeAddress", () => {
  it("normalizes a valid Boynton Beach address", () => {
    const result = normalizeAddress(boyntonBeachAddress);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.google_place_id).toBe("ChIJ_TEST_PLACE_ID");
    expect(result.data.formatted_address).toBe(
      "123 Main St, Boynton Beach, FL 33435, USA",
    );
    expect(result.data.address_line_1).toBe("123 Main Street");
    expect(result.data.address_line_2).toBeNull();
    expect(result.data.city).toBe("Boynton Beach");
    expect(result.data.state).toBe("FL");
    expect(result.data.postal_code).toBe("33435");
    expect(result.data.country).toBe("US");
    expect(result.data.latitude).toBeCloseTo(26.5318);
    expect(result.data.longitude).toBeCloseTo(-80.0905);
  });

  it("captures subpremise as address_line_2", () => {
    const place = {
      ...boyntonBeachAddress,
      address_components: [
        comp("Apt 4B", "Apt 4B", ["subpremise"]),
        ...boyntonBeachAddress.address_components,
      ],
    };
    const result = normalizeAddress(place);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address_line_2).toBe("Apt 4B");
  });

  it("returns INVALID_PLACE for non-objects", () => {
    expect(normalizeAddress(null).ok).toBe(false);
    expect(normalizeAddress("not a place").ok).toBe(false);
  });

  it("returns INVALID_PLACE when place_id is missing", () => {
    const result = normalizeAddress({
      formatted_address: "x",
      address_components: boyntonBeachAddress.address_components,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_PLACE");
  });

  it("returns MISSING_CITY when no locality components found", () => {
    const result = normalizeAddress({
      place_id: "x",
      formatted_address: "y",
      address_components: [
        comp("FL", "FL", ["administrative_area_level_1"]),
        comp("United States", "US", ["country"]),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_CITY");
  });

  it("returns MISSING_STATE when no admin area found", () => {
    const result = normalizeAddress({
      place_id: "x",
      formatted_address: "y",
      address_components: [
        comp("Boynton Beach", "Boynton Beach", ["locality"]),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_STATE");
  });

  it("never exposes anything outside the safe raw subset", () => {
    const place = {
      ...boyntonBeachAddress,
      photos: ["should not appear"],
      reviews: ["nope"],
      url: "should not appear",
      icon: "nope",
    };
    const result = normalizeAddress(place);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = result.data.raw_google_response;
    expect(Object.keys(raw).sort()).toEqual(
      [
        "place_id",
        "formatted_address",
        "types",
        "address_components",
        "geometry",
        "name",
      ].sort(),
    );
  });
});
