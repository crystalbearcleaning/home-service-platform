// Pure geometry helpers for the Phase 8 Door Hanger route map.
//
// No DB, no env, no `server-only`, no browser globals. Safe to import
// from client components if a future preview UI needs the hull
// calculation client-side.
//
// Source of truth:
//   docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md §6 (Route Areas)

export type GeoPoint = {
  id?: string;
  lat: number;
  lng: number;
};

export type RouteGeometryKind = "none" | "point" | "line" | "polygon";

export type RouteGeometry = {
  kind: RouteGeometryKind;
  // For "point" → 1 point. For "line" → 2 distinct points. For
  // "polygon" → 3+ hull-ordered points (CCW). For "none" → [].
  points: ReadonlyArray<GeoPoint>;
};

const EMPTY_GEOMETRY: RouteGeometry = { kind: "none", points: [] };

// -------------------------------------------------------------------------
// computeConvexHull — Andrew's monotone-chain algorithm.
//
// Returns the smallest convex polygon containing all valid input
// points. Degenerate cases:
//   - 0 valid points → { kind: "none", points: [] }
//   - 1 valid point  → { kind: "point", points: [the point] }
//   - 2 distinct valid points (or 3+ collinear) → { kind: "line",
//     points: [endpoint A, endpoint B] }
//   - 3+ non-collinear valid points → { kind: "polygon", points:
//     hull vertices in CCW order }
//
// Invalid inputs (non-finite lat/lng) are dropped. Duplicates are
// collapsed before hull construction so identical-coordinate stops
// don't inflate the hull size or trigger spurious "polygon" output.
// Sort key is `(lat, lng)` so the algorithm is deterministic
// regardless of input ordering.
// -------------------------------------------------------------------------
export function computeConvexHull(
  input: ReadonlyArray<GeoPoint>,
): RouteGeometry {
  if (!Array.isArray(input) || input.length === 0) return EMPTY_GEOMETRY;

  const valid = input.filter(isValidPoint);
  if (valid.length === 0) return EMPTY_GEOMETRY;

  const unique = dedupePoints(valid);
  if (unique.length === 1) {
    return { kind: "point", points: [unique[0]!] };
  }

  // Sort lexicographically by (lat, lng) — using lat as primary axis
  // keeps the result identical to a (x, y) sort with lat treated as
  // x. The map renderer doesn't care about orientation.
  const sorted = [...unique].sort((a, b) => {
    if (a.lat !== b.lat) return a.lat - b.lat;
    return a.lng - b.lng;
  });

  // Build lower hull.
  const lower: GeoPoint[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull.
  const upper: GeoPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Concatenate hulls; drop the duplicate end-points where they meet.
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

  if (hull.length === 1) {
    return { kind: "point", points: [hull[0]!] };
  }
  if (hull.length === 2) {
    return { kind: "line", points: [hull[0]!, hull[1]!] };
  }
  return { kind: "polygon", points: hull };
}

// Public utility — exported so the loader can use the same validity
// check it applies to incoming stop coordinates.
export function isValidPoint(p: GeoPoint | null | undefined): p is GeoPoint {
  if (!p) return false;
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat)) return false;
  if (typeof p.lng !== "number" || !Number.isFinite(p.lng)) return false;
  if (p.lat < -90 || p.lat > 90) return false;
  if (p.lng < -180 || p.lng > 180) return false;
  return true;
}

function dedupePoints(points: ReadonlyArray<GeoPoint>): GeoPoint[] {
  // Round to ~1cm precision so floating-point noise doesn't produce
  // "duplicates that aren't" or vice versa. RentCast lat/lng are
  // typed as numeric(10,7) in the DB which already implies < 1m
  // precision; this is a defensive normalisation.
  const seen = new Set<string>();
  const out: GeoPoint[] = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(7)}|${p.lng.toFixed(7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// 2D cross product of vectors OA and OB (treating lat as y, lng as
// x). Positive → CCW turn, negative → CW, zero → collinear.
function cross(o: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  return (a.lat - o.lat) * (b.lng - o.lng) - (a.lng - o.lng) * (b.lat - o.lat);
}

// -------------------------------------------------------------------------
// Shape resolution
// -------------------------------------------------------------------------
// Hull-from-stops first; circle from center+radius as fallback;
// otherwise no shape. Kept here (alongside the hull primitive) so the
// loader-side `route-map-data.ts` doesn't need to expose its own
// version, and so the rule stays unit-testable without importing any
// server-only module.

export type RouteMapShape =
  | { kind: "polygon"; points: ReadonlyArray<GeoPoint> }
  | { kind: "line"; points: ReadonlyArray<GeoPoint> }
  | { kind: "point"; points: ReadonlyArray<GeoPoint> }
  | { kind: "circle"; center: GeoPoint; radiusMiles: number }
  | { kind: "none" };

export function computeRouteShape(input: {
  stops: ReadonlyArray<{ lat: number | null; lng: number | null }>;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number | null;
}): RouteMapShape {
  const validStops: GeoPoint[] = [];
  for (const s of input.stops) {
    if (s.lat === null || s.lng === null) continue;
    const pt: GeoPoint = { lat: s.lat, lng: s.lng };
    if (isValidPoint(pt)) validStops.push(pt);
  }
  if (validStops.length > 0) {
    const hull = computeConvexHull(validStops);
    if (hull.kind !== "none") {
      return hull as RouteMapShape;
    }
  }
  if (
    input.centerLat !== null &&
    input.centerLng !== null &&
    input.radiusMiles !== null &&
    input.radiusMiles > 0 &&
    isValidPoint({ lat: input.centerLat, lng: input.centerLng })
  ) {
    return {
      kind: "circle",
      center: { lat: input.centerLat, lng: input.centerLng },
      radiusMiles: input.radiusMiles,
    };
  }
  return { kind: "none" };
}
