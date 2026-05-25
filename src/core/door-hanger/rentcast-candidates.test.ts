import { describe, expect, it } from "vitest";
import {
  buildRentcastSearchQuery,
  clampTargetToBatchLimit,
  haversineMiles,
  normalizeRentcastCandidate,
  normalizeRentcastCandidates,
  RENTCAST_MAX_LIMIT,
  RENTCAST_PREVIEW_REQUEST_COUNT,
  validateGenerateRouteInput,
} from "./rentcast-candidates";

describe("RENTCAST_PREVIEW_REQUEST_COUNT", () => {
  it("is exactly 1 — Phase 5C makes one batch request per preview", () => {
    expect(RENTCAST_PREVIEW_REQUEST_COUNT).toBe(1);
  });
});

describe("clampTargetToBatchLimit", () => {
  it("accepts positive integers up to 500", () => {
    expect(clampTargetToBatchLimit(1)).toEqual({ ok: true, limit: 1 });
    expect(clampTargetToBatchLimit(100)).toEqual({ ok: true, limit: 100 });
    expect(clampTargetToBatchLimit(500)).toEqual({ ok: true, limit: 500 });
  });
  it("rejects 0 / negative / non-integer", () => {
    expect(clampTargetToBatchLimit(0).ok).toBe(false);
    expect(clampTargetToBatchLimit(-5).ok).toBe(false);
    expect(clampTargetToBatchLimit(2.5).ok).toBe(false);
  });
  it("rejects > RENTCAST_MAX_LIMIT (pagination is out of scope)", () => {
    const r = clampTargetToBatchLimit(RENTCAST_MAX_LIMIT + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OVER_BATCH_LIMIT");
  });
});

describe("buildRentcastSearchQuery", () => {
  it("builds lat/lng/radius/limit params", () => {
    const sp = buildRentcastSearchQuery({
      latitude: 26.3683,
      longitude: -80.1289,
      radiusMiles: 0.5,
      limit: 100,
    });
    expect(sp.get("latitude")).toBe("26.3683");
    expect(sp.get("longitude")).toBe("-80.1289");
    expect(sp.get("radius")).toBe("0.5");
    expect(sp.get("limit")).toBe("100");
    expect(sp.get("propertyType")).toBeNull();
  });
  it("includes propertyType only when provided + non-empty", () => {
    expect(
      buildRentcastSearchQuery({
        latitude: 0,
        longitude: 0,
        radiusMiles: 1,
        limit: 1,
        propertyType: "  Single Family  ",
      }).get("propertyType"),
    ).toBe("Single Family");
    expect(
      buildRentcastSearchQuery({
        latitude: 0,
        longitude: 0,
        radiusMiles: 1,
        limit: 1,
        propertyType: "   ",
      }).get("propertyType"),
    ).toBeNull();
  });
});

describe("normalizeRentcastCandidate", () => {
  const sample = {
    id: "rc_1",
    formattedAddress: "8126 Valhalla Dr, Boca Raton, FL 33433",
    addressLine1: "8126 Valhalla Dr",
    city: "Boca Raton",
    state: "FL",
    zipCode: "33433",
    latitude: 26.3683,
    longitude: -80.1289,
    propertyType: "Single Family",
    bedrooms: 4,
    bathrooms: 2.5,
    squareFootage: 2500,
    lotSize: 7500,
    yearBuilt: 1995,
    lastSalePrice: 750000,
    ownerName: "should not leak",
    saleHistory: [{ price: 600000 }],
  };

  it("projects only the safe-subset fields into rentcastSnapshot", () => {
    const c = normalizeRentcastCandidate(sample, null);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.rentcastSnapshot).toEqual({
      id: "rc_1",
      formattedAddress: sample.formattedAddress,
      propertyType: "Single Family",
      bedrooms: 4,
      bathrooms: 2.5,
      squareFootage: 2500,
      lotSize: 7500,
      yearBuilt: 1995,
    });
    expect(JSON.stringify(c)).not.toMatch(/ownerName/);
    expect(JSON.stringify(c)).not.toMatch(/saleHistory/);
  });

  it("converts lastSalePrice (dollars) → estimatedValueCents", () => {
    const c = normalizeRentcastCandidate(sample, null)!;
    expect(c.estimatedValueCents).toBe(75_000_000);
  });

  it("computes distance from center when provider didn't return one", () => {
    const c = normalizeRentcastCandidate(sample, {
      latitude: 26.3683,
      longitude: -80.1289,
    })!;
    expect(c.distanceMiles).not.toBeNull();
    expect(c.distanceMiles!).toBeLessThan(0.01);
  });

  it("returns null when no usable address is present", () => {
    expect(
      normalizeRentcastCandidate({ id: "x", latitude: 0, longitude: 0 }, null),
    ).toBeNull();
  });

  it("returns null for non-object inputs", () => {
    expect(normalizeRentcastCandidate(null, null)).toBeNull();
    expect(normalizeRentcastCandidate("oops", null)).toBeNull();
    expect(normalizeRentcastCandidate([1], null)).toBeNull();
  });
});

describe("normalizeRentcastCandidates", () => {
  it("dedups by externalId then by address+city", () => {
    const raw = [
      { id: "a", addressLine1: "1 Main St", city: "Boca Raton" },
      { id: "a", addressLine1: "1 Main St", city: "Boca Raton" }, // dup id
      { addressLine1: "2 Main St", city: "Boca Raton" },
      { addressLine1: "2 Main St", city: "Boca Raton" }, // dup address+city
      { addressLine1: "3 Main St", city: "Boca Raton" },
    ];
    const out = normalizeRentcastCandidates({ raw, target: 10, center: null });
    expect(out.map((c) => c.address)).toEqual(["1 Main St", "2 Main St", "3 Main St"]);
  });

  it("caps output at target", () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({
      id: `rc_${i}`,
      addressLine1: `${i} Test St`,
      city: "Boca Raton",
    }));
    const out = normalizeRentcastCandidates({ raw, target: 25, center: null });
    expect(out).toHaveLength(25);
  });

  it("returns [] for non-array input", () => {
    expect(
      normalizeRentcastCandidates({ raw: null, target: 10, center: null }),
    ).toEqual([]);
    expect(
      normalizeRentcastCandidates({ raw: { bad: true }, target: 10, center: null }),
    ).toEqual([]);
  });
});

describe("haversineMiles", () => {
  it("returns ~0 for the same point", () => {
    expect(haversineMiles(26.36, -80.12, 26.36, -80.12)).toBeCloseTo(0, 4);
  });
  it("returns a positive distance for distinct points", () => {
    expect(haversineMiles(26.36, -80.12, 26.37, -80.13)).toBeGreaterThan(0);
  });
});

describe("validateGenerateRouteInput", () => {
  it("accepts a valid input", () => {
    const r = validateGenerateRouteInput({
      centerPlaceId: "place_123",
      radiusMiles: 0.5,
      targetHomeCount: 100,
      propertyType: "Single Family",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.centerPlaceId).toBe("place_123");
      expect(r.data.propertyType).toBe("Single Family");
    }
  });
  it("requires a center place id", () => {
    const r = validateGenerateRouteInput({
      centerPlaceId: " ",
      radiusMiles: 0.5,
      targetHomeCount: 50,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.centerPlaceId).toBeDefined();
  });
  it("rejects out-of-range radius", () => {
    expect(
      validateGenerateRouteInput({
        centerPlaceId: "p",
        radiusMiles: 0,
        targetHomeCount: 50,
      }).ok,
    ).toBe(false);
    expect(
      validateGenerateRouteInput({
        centerPlaceId: "p",
        radiusMiles: 50,
        targetHomeCount: 50,
      }).ok,
    ).toBe(false);
  });
  it("rejects target > 500 with a clear message", () => {
    const r = validateGenerateRouteInput({
      centerPlaceId: "p",
      radiusMiles: 0.5,
      targetHomeCount: 600,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.targetHomeCount).toContain("500");
  });
});
