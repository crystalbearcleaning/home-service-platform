import { describe, it, expect } from "vitest";
import {
  missingPropertyData,
  normalizeFirstProperty,
  normalizePropertyData,
} from "./normalize";

const RENTCAST_FOUND_FIXTURE = {
  id: "1234-Main-St-FL-33435",
  formattedAddress: "1234 Main St, Boynton Beach, FL 33435",
  addressLine1: "1234 Main St",
  city: "Boynton Beach",
  state: "FL",
  zipCode: "33435",
  county: "Palm Beach",
  latitude: 26.5318,
  longitude: -80.0905,
  propertyType: "Single Family",
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 1850,
  lotSize: 6500,
  yearBuilt: 1985,
  // Fields that must NOT leak through provider_snapshot:
  owner: { names: ["Confidential"], mailingAddress: { line1: "..." } },
  ownerOccupied: true,
  lastSaleDate: "2014-04-01",
  lastSalePrice: 250000,
  features: { architectureType: "Contemporary" },
  taxAssessments: { "2023": { value: 300000 } },
};

describe("normalizePropertyData", () => {
  it("returns missing for null / non-object inputs", () => {
    expect(normalizePropertyData(null).property_data_status).toBe("missing");
    expect(normalizePropertyData(undefined).property_data_status).toBe(
      "missing",
    );
    expect(normalizePropertyData("string").property_data_status).toBe(
      "missing",
    );
    expect(normalizePropertyData(42).property_data_status).toBe("missing");
  });

  it("marks status=found when square_footage is a positive number", () => {
    const result = normalizePropertyData(RENTCAST_FOUND_FIXTURE);
    expect(result.property_data_status).toBe("found");
    expect(result.square_footage).toBe(1850);
    expect(result.data_confidence).toBe("high");
  });

  it("marks status=missing when square_footage is null", () => {
    const result = normalizePropertyData({
      ...RENTCAST_FOUND_FIXTURE,
      squareFootage: null,
    });
    expect(result.property_data_status).toBe("missing");
    expect(result.square_footage).toBeNull();
    // Has id, so confidence falls back to 'low'
    expect(result.data_confidence).toBe("low");
  });

  it("marks status=missing when square_footage is 0 / negative / non-numeric", () => {
    expect(
      normalizePropertyData({ ...RENTCAST_FOUND_FIXTURE, squareFootage: 0 })
        .property_data_status,
    ).toBe("missing");
    expect(
      normalizePropertyData({ ...RENTCAST_FOUND_FIXTURE, squareFootage: -100 })
        .property_data_status,
    ).toBe("missing");
    expect(
      normalizePropertyData({
        ...RENTCAST_FOUND_FIXTURE,
        squareFootage: "1850",
      }).property_data_status,
    ).toBe("missing");
  });

  it("maps property_type, bedrooms, bathrooms, lot_size_sqft, year_built", () => {
    const result = normalizePropertyData(RENTCAST_FOUND_FIXTURE);
    expect(result.property_type).toBe("Single Family");
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2);
    expect(result.lot_size_sqft).toBe(6500);
    expect(result.year_built).toBe(1985);
  });

  it("accepts fractional bathrooms (e.g., 2.5)", () => {
    const result = normalizePropertyData({
      ...RENTCAST_FOUND_FIXTURE,
      bathrooms: 2.5,
    });
    expect(result.bathrooms).toBe(2.5);
  });

  it("provider_snapshot exposes only the safe subset of keys", () => {
    const result = normalizePropertyData(RENTCAST_FOUND_FIXTURE);
    const keys = Object.keys(result.provider_snapshot).sort();
    expect(keys).toEqual(
      [
        "id",
        "formattedAddress",
        "propertyType",
        "bedrooms",
        "bathrooms",
        "squareFootage",
        "lotSize",
        "yearBuilt",
      ].sort(),
    );
    // Sanity: nothing sensitive leaked
    const snapshotJson = JSON.stringify(result.provider_snapshot);
    expect(snapshotJson).not.toContain("owner");
    expect(snapshotJson).not.toContain("lastSalePrice");
    expect(snapshotJson).not.toContain("taxAssessments");
  });

  it("data_source is always 'rentcast'", () => {
    expect(normalizePropertyData(RENTCAST_FOUND_FIXTURE).data_source).toBe(
      "rentcast",
    );
    expect(normalizePropertyData(null).data_source).toBe("rentcast");
  });

  it("confidence is unknown when neither sqft nor id is present", () => {
    expect(
      normalizePropertyData({ propertyType: "Single Family" }).data_confidence,
    ).toBe("unknown");
  });

  it("provider_property_id reflects raw.id (string only)", () => {
    expect(
      normalizePropertyData(RENTCAST_FOUND_FIXTURE).provider_property_id,
    ).toBe("1234-Main-St-FL-33435");
    expect(
      normalizePropertyData({ ...RENTCAST_FOUND_FIXTURE, id: 12345 })
        .provider_property_id,
    ).toBeNull();
  });
});

describe("missingPropertyData", () => {
  it("returns a stable null-everywhere shape", () => {
    const result = missingPropertyData();
    expect(result.property_data_status).toBe("missing");
    expect(result.data_confidence).toBe("unknown");
    expect(result.data_source).toBe("rentcast");
    expect(result.square_footage).toBeNull();
    expect(result.provider_property_id).toBeNull();
    expect(result.provider_snapshot.squareFootage).toBeNull();
  });
});

describe("normalizeFirstProperty", () => {
  it("picks the first item from an array", () => {
    const result = normalizeFirstProperty([
      RENTCAST_FOUND_FIXTURE,
      { ...RENTCAST_FOUND_FIXTURE, squareFootage: 9999 },
    ]);
    expect(result.square_footage).toBe(1850);
  });

  it("returns missing for an empty array", () => {
    expect(normalizeFirstProperty([]).property_data_status).toBe("missing");
  });

  it("returns missing for null / undefined", () => {
    expect(normalizeFirstProperty(null).property_data_status).toBe("missing");
    expect(normalizeFirstProperty(undefined).property_data_status).toBe(
      "missing",
    );
  });

  it("accepts a single object (some endpoints return one record, not an array)", () => {
    const result = normalizeFirstProperty(RENTCAST_FOUND_FIXTURE);
    expect(result.property_data_status).toBe("found");
  });
});
