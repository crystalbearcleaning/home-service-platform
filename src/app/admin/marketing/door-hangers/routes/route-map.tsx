"use client";

import { useEffect, useRef, useState } from "react";

import type { RouteMapShape } from "@/core/door-hanger/route-map-geometry";
import {
  getGoogleNamespace,
  useGoogleMapsBootstrap,
} from "@/components/use-google-maps-bootstrap";

// =========================================================================
// Phase 8C — RouteMap client component.
//
// Renders a Google Maps base layer plus each route's shape
// (polygon / line / point / circle). Click a shape → select the route
// (overlay panel rendered alongside).
//
// Strictly client-only:
//   - bootstraps Maps JS via the shared `useGoogleMapsBootstrap` hook
//   - imports the `maps` + `marker` libraries on demand
//   - mounts a single `google.maps.Map` instance
//   - rebuilds shape overlays on `routes` change (clears prior shapes)
//
// Phase 8C deliberately does NOT render selected-route pins (Phase 8D)
// or open a Generate Route overlay (Phase 8E, optional).
// =========================================================================

const MILES_TO_METERS = 1609.344;
// Boynton Beach / Crystal Bear service area centroid; used as the
// default map center when there are no routes to fit bounds to.
const FALLBACK_CENTER = { lat: 26.5, lng: -80.1 };
const FALLBACK_ZOOM = 11;

export type RouteMapRouteDTO = {
  id: string;
  name: string;
  shape: RouteMapShape;
};

export type SelectedRouteSummary = {
  id: string;
  name: string;
  campaignName: string | null;
  generatedFromSource: string;
  status: string;
  totalRouteStops: number;
  cooldownDays: number;
  pendingCount: number;
  completedCount: number;
  skippedCount: number;
  coolingDownCount: number;
  eligibleCount: number;
  lastCompletedAt: string | null;
  routeNextEligibleAt: string | null;
};

type Props = {
  routes: ReadonlyArray<RouteMapRouteDTO>;
  routeSummariesById: Readonly<Record<string, SelectedRouteSummary>>;
};

type MapsLib = google.maps.MapsLibrary;

export function RouteMap({ routes, routeSummariesById }: Props) {
  const bootstrap = useGoogleMapsBootstrap();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<{ shape: google.maps.MVCObject; remove: () => void }>>([]);
  const [mapsLib, setMapsLib] = useState<MapsLib | null>(null);
  const [mapsLibError, setMapsLibError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // Flips to true once `mapRef.current` is populated. The shape-
  // drawing effect depends on this so it re-runs after the Map mounts;
  // without it, the first-render shape pass bails (no map yet) and the
  // effect never fires again because `routes` is stable.
  const [mapReady, setMapReady] = useState(false);

  // Index for the click handler (closures capture the ref, not state).
  const handlersRef = useRef<{ select: (id: string) => void }>({
    select: (id) => setSelectedRouteId(id),
  });
  handlersRef.current.select = (id) => setSelectedRouteId(id);

  // -------------------------------------------------------------------
  // Import the `maps` library once the bootstrap is ready.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (bootstrap.kind !== "ready") return;
    let cancelled = false;
    const g = getGoogleNamespace();
    const importLib = g?.maps?.importLibrary;
    if (!importLib) {
      setMapsLibError("google.maps.importLibrary disappeared after ready.");
      return;
    }
    (async () => {
      try {
        const lib = (await importLib("maps")) as MapsLib;
        if (cancelled) return;
        setMapsLib(lib);
      } catch (err) {
        if (cancelled) return;
        setMapsLibError(
          err instanceof Error
            ? `Failed to load the Maps library: ${err.message}`
            : "Failed to load the Maps library.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap.kind]);

  // -------------------------------------------------------------------
  // Mount the Map once the library is ready.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!mapsLib || !mapContainerRef.current) return;
    if (mapRef.current) return; // already mounted
    const { Map } = mapsLib;
    mapRef.current = new Map(mapContainerRef.current, {
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      // Enable interactive panning + zoom; default Google styling.
    });
    setMapReady(true);
  }, [mapsLib]);

  // -------------------------------------------------------------------
  // Rebuild shape overlays whenever `routes` changes OR the map first
  // becomes ready (the map mounts asynchronously, so the very first
  // render of this effect runs before `mapRef.current` exists).
  // -------------------------------------------------------------------
  useEffect(() => {
    const g = getGoogleNamespace();
    const map = mapRef.current;
    if (!g || !map) return;

    // Tear down previous overlays.
    for (const o of overlaysRef.current) {
      try {
        o.remove();
      } catch {
        // Ignore — overlay may already be detached.
      }
    }
    overlaysRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let anyBounded = false;

    for (const route of routes) {
      const overlays = drawShape({
        google: g,
        map,
        route,
        onClick: () => handlersRef.current.select(route.id),
      });
      for (const o of overlays) {
        overlaysRef.current.push(o);
      }
      extendBoundsForShape(g, bounds, route.shape, () => {
        anyBounded = true;
      });
    }

    if (anyBounded) {
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(FALLBACK_CENTER);
      map.setZoom(FALLBACK_ZOOM);
    }
  }, [routes, mapReady]);

  // Tear down all overlays + the map on unmount. (Map instance is GC'd
  // when the container unmounts; explicit cleanup keeps DOM tidy.)
  useEffect(() => {
    return () => {
      for (const o of overlaysRef.current) {
        try {
          o.remove();
        } catch {
          /* ignore */
        }
      }
      overlaysRef.current = [];
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (bootstrap.kind === "error") {
    return <ErrorBlock message={bootstrap.message} />;
  }
  if (mapsLibError) {
    return <ErrorBlock message={mapsLibError} />;
  }

  const selectedSummary =
    selectedRouteId !== null ? routeSummariesById[selectedRouteId] ?? null : null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-card border border-line bg-surface-muted">
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        aria-label="Door Hanger routes map"
      />

      {bootstrap.kind === "pending" && (
        <div className="absolute inset-0 grid place-items-center text-xs text-ink-muted">
          Loading map…
        </div>
      )}

      {selectedSummary && (
        <SelectedRoutePanel
          summary={selectedSummary}
          onClose={() => setSelectedRouteId(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// SelectedRoutePanel — Phase 8C placeholder details overlay (§4).
// Phase 8D will replace this with the full overlay.
// -------------------------------------------------------------------------
function SelectedRoutePanel({
  summary,
  onClose,
}: {
  summary: SelectedRouteSummary;
  onClose: () => void;
}) {
  return (
    <aside
      className="pointer-events-auto absolute left-4 top-4 z-10 w-80 max-w-[calc(100%-2rem)] rounded-card border border-line bg-surface p-4 shadow-card"
      aria-label="Selected route details"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Route
          </div>
          <h2 className="truncate text-sm font-semibold text-ink">
            {summary.name}
          </h2>
          {summary.campaignName && (
            <p className="truncate text-[11px] text-ink-muted">
              {summary.campaignName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close route details"
          className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted hover:text-ink"
        >
          Close
        </button>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
        <KV label="Source" value={summary.generatedFromSource} />
        <KV label="Status" value={summary.status} />
        <KV label="Total stops" value={String(summary.totalRouteStops)} />
        <KV label="Cooldown" value={`${summary.cooldownDays}d`} />
        <KV label="Pending" value={String(summary.pendingCount)} />
        <KV label="Completed" value={String(summary.completedCount)} />
        <KV label="Skipped" value={String(summary.skippedCount)} />
        <KV label="Cooling" value={String(summary.coolingDownCount)} />
        <KV label="Eligible" value={String(summary.eligibleCount)} />
        <KV label="Last completed" value={formatIso(summary.lastCompletedAt)} />
        <KV
          label="Next eligible"
          value={formatIso(summary.routeNextEligibleAt)}
        />
      </dl>
      <p className="mt-3 text-[10px] text-ink-faint">
        Placeholder overlay — full details + per-stop pins land in Phase 8D.
      </p>
    </aside>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className="truncate text-ink">{value}</div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-card border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
      {message}
    </pre>
  );
}

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

// -------------------------------------------------------------------------
// Shape drawing helpers
// -------------------------------------------------------------------------

type OverlayHandle = {
  shape: google.maps.MVCObject;
  remove: () => void;
};

function drawShape(input: {
  google: typeof google;
  map: google.maps.Map;
  route: RouteMapRouteDTO;
  onClick: () => void;
}): OverlayHandle[] {
  const { google: g, map, route, onClick } = input;
  const shape = route.shape;
  const baseStyle = {
    strokeColor: "#1f2937",
    strokeOpacity: 0.85,
    strokeWeight: 2,
    fillColor: "#3b82f6",
    fillOpacity: 0.18,
    clickable: true,
  };
  const lineStyle = {
    strokeColor: "#1f2937",
    strokeOpacity: 0.85,
    strokeWeight: 3,
    clickable: true,
  };

  switch (shape.kind) {
    case "polygon": {
      const path = shape.points.map((p) => ({ lat: p.lat, lng: p.lng }));
      const polygon = new g.maps.Polygon({ ...baseStyle, paths: path });
      polygon.setMap(map);
      const listener = polygon.addListener("click", onClick);
      return [
        {
          shape: polygon,
          remove: () => {
            g.maps.event.removeListener(listener);
            polygon.setMap(null);
          },
        },
      ];
    }
    case "line": {
      const path = shape.points.map((p) => ({ lat: p.lat, lng: p.lng }));
      const polyline = new g.maps.Polyline({ ...lineStyle, path });
      polyline.setMap(map);
      const listener = polyline.addListener("click", onClick);
      return [
        {
          shape: polyline,
          remove: () => {
            g.maps.event.removeListener(listener);
            polyline.setMap(null);
          },
        },
      ];
    }
    case "point": {
      const p = shape.points[0];
      if (!p) return [];
      const marker = new g.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: route.name,
      });
      const listener = marker.addListener("click", onClick);
      return [
        {
          shape: marker,
          remove: () => {
            g.maps.event.removeListener(listener);
            marker.setMap(null);
          },
        },
      ];
    }
    case "circle": {
      const circle = new g.maps.Circle({
        ...baseStyle,
        center: { lat: shape.center.lat, lng: shape.center.lng },
        radius: shape.radiusMiles * MILES_TO_METERS,
      });
      circle.setMap(map);
      const listener = circle.addListener("click", onClick);
      return [
        {
          shape: circle,
          remove: () => {
            g.maps.event.removeListener(listener);
            circle.setMap(null);
          },
        },
      ];
    }
    case "none":
    default:
      return [];
  }
}

function extendBoundsForShape(
  g: typeof google,
  bounds: google.maps.LatLngBounds,
  shape: RouteMapShape,
  markBounded: () => void,
) {
  switch (shape.kind) {
    case "polygon":
    case "line":
    case "point":
      for (const p of shape.points) {
        bounds.extend(new g.maps.LatLng(p.lat, p.lng));
        markBounded();
      }
      return;
    case "circle": {
      // Approximate the circle's bounding box from center ± radius.
      const center = new g.maps.LatLng(shape.center.lat, shape.center.lng);
      const radiusMeters = shape.radiusMiles * MILES_TO_METERS;
      const deltaLat = radiusMeters / 111_320;
      const deltaLng =
        radiusMeters /
        (111_320 * Math.max(0.1, Math.cos((shape.center.lat * Math.PI) / 180)));
      bounds.extend(
        new g.maps.LatLng(center.lat() + deltaLat, center.lng() + deltaLng),
      );
      bounds.extend(
        new g.maps.LatLng(center.lat() - deltaLat, center.lng() - deltaLng),
      );
      markBounded();
      return;
    }
    case "none":
    default:
      return;
  }
}

// Pure helper exported for unit testing — picks a stable selection
// when the URL hash names a route id that no longer exists. Returns
// the requested id if present in the routes list, else null.
export function resolveSelectedRouteId(
  routes: ReadonlyArray<{ id: string }>,
  requested: string | null,
): string | null {
  if (!requested) return null;
  return routes.some((r) => r.id === requested) ? requested : null;
}

// Re-exported for the page wiring.
export type { RouteMapShape };
