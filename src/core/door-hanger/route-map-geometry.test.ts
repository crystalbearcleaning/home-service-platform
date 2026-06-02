import { describe, expect, it } from "vitest";

import {
  computeConvexHull,
  isValidPoint,
  type GeoPoint,
} from "./route-map-geometry";

describe("isValidPoint", () => {
  it("accepts a sane lat/lng", () => {
    expect(isValidPoint({ lat: 26.5, lng: -80.1 })).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(isValidPoint(null as unknown as GeoPoint)).toBe(false);
    expect(isValidPoint(undefined as unknown as GeoPoint)).toBe(false);
  });

  it("rejects NaN / Infinity / wrong types", () => {
    expect(isValidPoint({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false);
    expect(
      isValidPoint({ lat: "26" as unknown as number, lng: -80 }),
    ).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(isValidPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: -91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: -181 })).toBe(false);
  });
});

describe("computeConvexHull", () => {
  it("returns 'none' for an empty input", () => {
    expect(computeConvexHull([])).toEqual({ kind: "none", points: [] });
  });

  it("returns 'none' when every point is invalid", () => {
    const r = computeConvexHull([
      { lat: Number.NaN, lng: 0 },
      { lat: 0, lng: Number.POSITIVE_INFINITY },
    ]);
    expect(r.kind).toBe("none");
  });

  it("returns 'point' for a single valid point", () => {
    const r = computeConvexHull([{ lat: 26.5, lng: -80.1 }]);
    expect(r.kind).toBe("point");
    expect(r.points).toHaveLength(1);
    expect(r.points[0]).toEqual({ lat: 26.5, lng: -80.1 });
  });

  it("collapses identical-coordinate duplicates to 'point'", () => {
    const r = computeConvexHull([
      { lat: 26.5, lng: -80.1 },
      { lat: 26.5, lng: -80.1 },
      { lat: 26.5, lng: -80.1 },
    ]);
    expect(r.kind).toBe("point");
    expect(r.points).toHaveLength(1);
  });

  it("returns 'line' for two distinct points", () => {
    const r = computeConvexHull([
      { lat: 26.5, lng: -80.1 },
      { lat: 26.6, lng: -80.2 },
    ]);
    expect(r.kind).toBe("line");
    expect(r.points).toHaveLength(2);
  });

  it("returns 'line' for 3+ collinear points (collinear collapses)", () => {
    const r = computeConvexHull([
      { lat: 26.0, lng: -80.0 },
      { lat: 26.5, lng: -80.0 },
      { lat: 27.0, lng: -80.0 },
    ]);
    expect(r.kind).toBe("line");
    expect(r.points).toHaveLength(2);
    // Endpoints, not the middle.
    const lats = r.points.map((p) => p.lat).sort();
    expect(lats).toEqual([26.0, 27.0]);
  });

  it("returns 'polygon' for 3 non-collinear points (triangle)", () => {
    const r = computeConvexHull([
      { lat: 26.0, lng: -80.0 },
      { lat: 26.0, lng: -79.0 },
      { lat: 27.0, lng: -79.5 },
    ]);
    expect(r.kind).toBe("polygon");
    expect(r.points).toHaveLength(3);
  });

  it("computes a convex hull excluding interior points (square + center)", () => {
    const square: GeoPoint[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0.5, lng: 0.5 }, // interior — should be excluded
    ];
    const r = computeConvexHull(square);
    expect(r.kind).toBe("polygon");
    expect(r.points).toHaveLength(4);
    const coords = r.points.map((p) => `${p.lat},${p.lng}`).sort();
    expect(coords).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });

  it("is deterministic regardless of input order", () => {
    const a = computeConvexHull([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ]);
    const b = computeConvexHull([
      { lat: 1, lng: 1 },
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 0, lng: 1 },
    ]);
    expect(b.kind).toBe(a.kind);
    expect(b.points).toEqual(a.points);
  });

  it("ignores invalid points but uses the remaining valid ones", () => {
    const r = computeConvexHull([
      { lat: Number.NaN, lng: 0 },
      { lat: 26.5, lng: -80.1 },
      { lat: 26.6, lng: -80.0 },
      { lat: 26.55, lng: -80.05 }, // interior of triangle
      { lat: 26.7, lng: -80.05 },
    ]);
    expect(r.kind).toBe("polygon");
    // 3 outer points, interior excluded.
    expect(r.points).toHaveLength(3);
  });
});
