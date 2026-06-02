import { describe, expect, it } from "vitest";

import { computeRouteShape } from "./route-map-geometry";

describe("computeRouteShape (Phase 8B shape resolution)", () => {
  it("returns a polygon when stops contain 3+ non-collinear coordinates", () => {
    const r = computeRouteShape({
      stops: [
        { lat: 26.5, lng: -80.1 },
        { lat: 26.6, lng: -80.0 },
        { lat: 26.7, lng: -80.05 },
      ],
      centerLat: 26.5,
      centerLng: -80.1,
      radiusMiles: 1,
    });
    expect(r.kind).toBe("polygon");
  });

  it("returns a circle fallback when no usable stops but center+radius exist", () => {
    const r = computeRouteShape({
      stops: [
        { lat: null, lng: null },
        { lat: null, lng: -80 },
      ],
      centerLat: 26.5,
      centerLng: -80.1,
      radiusMiles: 0.5,
    });
    expect(r.kind).toBe("circle");
    if (r.kind !== "circle") throw new Error("unreachable");
    expect(r.center).toEqual({ lat: 26.5, lng: -80.1 });
    expect(r.radiusMiles).toBe(0.5);
  });

  it("returns 'none' when neither stops nor center+radius are usable", () => {
    expect(
      computeRouteShape({
        stops: [],
        centerLat: null,
        centerLng: null,
        radiusMiles: null,
      }),
    ).toEqual({ kind: "none" });
  });

  it("ignores center+radius when radius is 0 or negative", () => {
    expect(
      computeRouteShape({
        stops: [],
        centerLat: 26.5,
        centerLng: -80.1,
        radiusMiles: 0,
      }),
    ).toEqual({ kind: "none" });
    expect(
      computeRouteShape({
        stops: [],
        centerLat: 26.5,
        centerLng: -80.1,
        radiusMiles: -1,
      }),
    ).toEqual({ kind: "none" });
  });

  it("prefers stops-derived shape over circle even when both are present", () => {
    const r = computeRouteShape({
      stops: [
        { lat: 26.5, lng: -80.1 },
        { lat: 26.6, lng: -80.0 },
        { lat: 26.7, lng: -80.05 },
      ],
      centerLat: 26.5,
      centerLng: -80.1,
      radiusMiles: 1,
    });
    expect(r.kind).toBe("polygon");
  });

  it("returns a single 'point' when only one valid stop exists", () => {
    const r = computeRouteShape({
      stops: [{ lat: 26.5, lng: -80.1 }],
      centerLat: null,
      centerLng: null,
      radiusMiles: null,
    });
    expect(r.kind).toBe("point");
  });
});
