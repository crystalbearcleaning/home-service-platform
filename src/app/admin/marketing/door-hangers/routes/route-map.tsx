"use client";

import { useEffect, useRef, useState } from "react";

import {
  getGoogleNamespace,
  useGoogleMapsBootstrap,
} from "@/components/use-google-maps-bootstrap";
import type {
  CooldownStopStatus,
  RouteCooldownSummary,
} from "@/core/door-hanger/cooldown";
import type { RouteMapShape } from "@/core/door-hanger/route-map-geometry";
import {
  STOP_PIN_COLORS,
  pinStatusForStop,
  routeCooldownHeadline,
  selectedRouteFromList,
  type StopPinStatus,
} from "@/core/door-hanger/route-map-display";

import { RoutesTableOverlay } from "./routes-table";

// =========================================================================
// Phase 8D — RouteMap with overlays + selected-route pins.
//
// Renders:
//   - Google Maps base layer (Phase 8C)
//   - Polygon / line / point / circle per route shape (Phase 8C)
//   - Selected-route emphasis (heavier stroke, deeper fill)
//   - Selected-route stop pins, tinted by status + cooldown
//   - Floating "Routes" button → routes table overlay
//   - Closable route details overlay
//   - Focus-on-map bounds fit via a token counter
// =========================================================================

const MILES_TO_METERS = 1609.344;
const FALLBACK_CENTER = { lat: 26.5, lng: -80.1 };
const FALLBACK_ZOOM = 11;

// Shape style for the unselected vs selected state.
const SHAPE_STYLE_DEFAULT = {
  strokeColor: "#1f2937",
  strokeOpacity: 0.85,
  strokeWeight: 2,
  fillColor: "#3b82f6",
  fillOpacity: 0.18,
};
const SHAPE_STYLE_SELECTED = {
  strokeColor: "#0f172a",
  strokeOpacity: 1,
  strokeWeight: 4,
  fillColor: "#2563eb",
  fillOpacity: 0.32,
};
const LINE_STYLE_DEFAULT = {
  strokeColor: "#1f2937",
  strokeOpacity: 0.85,
  strokeWeight: 3,
};
const LINE_STYLE_SELECTED = {
  strokeColor: "#0f172a",
  strokeOpacity: 1,
  strokeWeight: 5,
};

export type MapRouteStop = {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: "pending" | "completed" | "skipped" | string;
  completedAt: string | null;
  cooldown: CooldownStopStatus;
};

export type MapRouteLatestSession = {
  id: string;
  distributedAt: string;
  hangersDistributed: number;
  status: string;
  mode: string;
};

// The single DTO the map + overlays + table consume. Mirrors the
// loader's `RouteMapRoute` shape; everything is JSON-serialisable so
// the Server Component can pass it straight through.
export type MapRouteFull = {
  id: string;
  name: string;
  campaignName: string | null;
  generatedFromSource: string;
  status: string;
  totalRouteStops: number;
  cooldownDays: number;
  lastCompletedAt: string | null;
  centerAddress: string | null;
  radiusMiles: number | null;
  estimatedTimeSeconds: number | null;
  shape: RouteMapShape;
  cooldownSummary: RouteCooldownSummary;
  stops: ReadonlyArray<MapRouteStop>;
  latestSession: MapRouteLatestSession | null;
};

type Props = {
  routes: ReadonlyArray<MapRouteFull>;
};

type MapsLib = google.maps.MapsLibrary;

type OverlayHandle = {
  shape: google.maps.MVCObject;
  remove: () => void;
};

export function RouteMap({ routes }: Props) {
  const bootstrap = useGoogleMapsBootstrap();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const shapeOverlaysRef = useRef<
    Array<{ routeId: string; handle: OverlayHandle }>
  >([]);
  const pinOverlaysRef = useRef<Array<OverlayHandle>>([]);

  const [mapsLib, setMapsLib] = useState<MapsLib | null>(null);
  const [mapsLibError, setMapsLibError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  // Increments on Focus-on-map; an effect watches it + selectedRouteId
  // and refits bounds to that route. Decoupled from selection so
  // clicking the shape selects without retreading the camera.
  const [focusToken, setFocusToken] = useState(0);

  // Stable click handler ref (closures captured in addListener).
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
    if (mapRef.current) return;
    const { Map } = mapsLib;
    mapRef.current = new Map(mapContainerRef.current, {
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    setMapReady(true);
  }, [mapsLib]);

  // -------------------------------------------------------------------
  // Rebuild shape overlays whenever the routes list or selection
  // changes. Selection affects styling so it lives in the same effect.
  // -------------------------------------------------------------------
  useEffect(() => {
    const g = getGoogleNamespace();
    const map = mapRef.current;
    if (!g || !map) return;

    for (const o of shapeOverlaysRef.current) {
      try {
        o.handle.remove();
      } catch {
        /* ignore */
      }
    }
    shapeOverlaysRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let anyBounded = false;

    for (const route of routes) {
      const isSelected = route.id === selectedRouteId;
      const overlays = drawShape({
        google: g,
        map,
        routeId: route.id,
        routeName: route.name,
        shape: route.shape,
        isSelected,
        onClick: () => handlersRef.current.select(route.id),
      });
      for (const handle of overlays) {
        shapeOverlaysRef.current.push({ routeId: route.id, handle });
      }
      extendBoundsForShape(g, bounds, route.shape, () => {
        anyBounded = true;
      });
    }

    if (anyBounded && !selectedRouteId) {
      // Only auto-fit on initial render (no selection). Re-rendering
      // shapes due to selection change should not yank the camera.
      // We detect "initial" by tracking whether a previous shape was
      // already mounted on `map`; the simplest proxy is: fit only
      // when there's no selection yet AND no focusToken has fired.
      if (focusToken === 0) {
        map.fitBounds(bounds, 48);
      }
    } else if (!anyBounded) {
      map.setCenter(FALLBACK_CENTER);
      map.setZoom(FALLBACK_ZOOM);
    }
  }, [routes, mapReady, selectedRouteId, focusToken]);

  // -------------------------------------------------------------------
  // Rebuild selected-route stop pins on selection change.
  // -------------------------------------------------------------------
  useEffect(() => {
    const g = getGoogleNamespace();
    const map = mapRef.current;
    if (!g || !map) return;

    for (const o of pinOverlaysRef.current) {
      try {
        o.remove();
      } catch {
        /* ignore */
      }
    }
    pinOverlaysRef.current = [];

    if (!selectedRouteId) return;
    const route = routes.find((r) => r.id === selectedRouteId);
    if (!route) return;

    for (const stop of route.stops) {
      if (stop.lat === null || stop.lng === null) continue;
      const pinStatus = pinStatusForStop({
        status: stop.status,
        cooldown: stop.cooldown,
      });
      const handle = drawStopPin({
        google: g,
        map,
        position: { lat: stop.lat, lng: stop.lng },
        title: stopTooltip(stop, pinStatus),
        pinStatus,
      });
      pinOverlaysRef.current.push(handle);
    }
  }, [routes, mapReady, selectedRouteId]);

  // -------------------------------------------------------------------
  // Focus-on-map: refit bounds to the selected route when the token
  // changes.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (focusToken === 0) return;
    const g = getGoogleNamespace();
    const map = mapRef.current;
    if (!g || !map || !selectedRouteId) return;
    const route = routes.find((r) => r.id === selectedRouteId);
    if (!route) return;
    const bounds = new g.maps.LatLngBounds();
    let bounded = false;
    extendBoundsForShape(g, bounds, route.shape, () => {
      bounded = true;
    });
    if (bounded) {
      map.fitBounds(bounds, 48);
    }
  }, [focusToken, selectedRouteId, routes]);

  // -------------------------------------------------------------------
  // Cleanup on unmount.
  // -------------------------------------------------------------------
  useEffect(() => {
    return () => {
      for (const o of shapeOverlaysRef.current) {
        try {
          o.handle.remove();
        } catch {
          /* ignore */
        }
      }
      for (const o of pinOverlaysRef.current) {
        try {
          o.remove();
        } catch {
          /* ignore */
        }
      }
      shapeOverlaysRef.current = [];
      pinOverlaysRef.current = [];
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

  const selectedRoute = selectedRouteFromList(routes, selectedRouteId);

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

      <button
        type="button"
        onClick={() => setTableOpen((v) => !v)}
        className="pointer-events-auto absolute right-4 top-4 z-30 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card hover:bg-surface-muted"
      >
        {tableOpen ? "Hide routes" : `Routes (${routes.length})`}
      </button>

      <RoutesTableOverlay
        routes={routes}
        open={tableOpen}
        selectedId={selectedRouteId}
        onClose={() => setTableOpen(false)}
        onFocus={(id) => {
          setSelectedRouteId(id);
          setTableOpen(false);
          setFocusToken((t) => t + 1);
        }}
      />

      {selectedRoute && (
        <RouteDetailsOverlay
          route={selectedRoute}
          onClose={() => setSelectedRouteId(null)}
        />
      )}

      <MapLegend />
    </div>
  );
}

// -------------------------------------------------------------------------
// Route details overlay (Phase 8D — full version)
// -------------------------------------------------------------------------
function RouteDetailsOverlay({
  route,
  onClose,
}: {
  route: MapRouteFull;
  onClose: () => void;
}) {
  const headline = routeCooldownHeadline(route.cooldownSummary);
  const headlineTone =
    headline.kind === "cooling_down"
      ? "text-warning-strong"
      : headline.kind === "all_eligible"
        ? "text-success"
        : "text-ink-muted";
  return (
    <aside
      className="pointer-events-auto absolute bottom-4 left-4 z-20 max-h-[calc(100%-2rem)] w-[22rem] max-w-[calc(100%-2rem)] overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-card"
      aria-label="Selected route details"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Route
          </div>
          <h2 className="truncate text-sm font-semibold text-ink">
            {route.name}
          </h2>
          {route.campaignName && (
            <p className="truncate text-[11px] text-ink-muted">
              {route.campaignName}
            </p>
          )}
          <p className={`mt-1 text-[11px] ${headlineTone}`}>
            {headline.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close route details"
          className="shrink-0 rounded-pill border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted hover:text-ink"
        >
          Close
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
        <KV label="Source" value={route.generatedFromSource} />
        <KV label="Status" value={route.status} />
        <KV label="Total stops" value={String(route.totalRouteStops)} />
        <KV label="Cooldown" value={`${route.cooldownDays}d`} />
        <KV label="Pending" value={String(route.cooldownSummary.pendingCount)} />
        <KV
          label="Completed"
          value={String(route.cooldownSummary.completedCount)}
        />
        <KV
          label="Skipped"
          value={String(route.cooldownSummary.skippedCount)}
        />
        <KV
          label="Cooling"
          value={String(route.cooldownSummary.coolingDownCount)}
        />
        <KV
          label="Eligible"
          value={String(route.cooldownSummary.eligibleCount)}
        />
        <KV
          label="Last completed"
          value={formatIso(route.lastCompletedAt)}
        />
        <KV
          label="Next eligible"
          value={formatIso(route.cooldownSummary.routeNextEligibleAt)}
        />
        <KV
          label="Estimated time"
          value={formatDurationSeconds(route.estimatedTimeSeconds)}
        />
      </dl>

      {(route.centerAddress || route.radiusMiles !== null) && (
        <div className="mt-3 rounded-control border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Center
          </div>
          <div className="truncate text-ink">
            {route.centerAddress ?? "—"}
          </div>
          {route.radiusMiles !== null && (
            <div className="text-[10px] text-ink-faint">
              Radius {route.radiusMiles} mi
            </div>
          )}
        </div>
      )}

      {route.latestSession && (
        <div className="mt-3 rounded-control border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Latest session
          </div>
          <div className="text-ink">
            {formatIso(route.latestSession.distributedAt)} ·{" "}
            {route.latestSession.hangersDistributed} hangers
          </div>
          <div className="text-[10px] text-ink-faint">
            {route.latestSession.mode} · {route.latestSession.status}
          </div>
        </div>
      )}
    </aside>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-card border border-line bg-surface/95 px-3 py-2 text-[10px] text-ink-muted shadow-card">
      <div className="mb-1 uppercase tracking-wide text-ink-faint">Pins</div>
      <ul className="space-y-1">
        <LegendDot status="pending" label="Pending" />
        <LegendDot status="completed_cooling" label="Cooling down" />
        <LegendDot status="completed_eligible" label="Eligible again" />
        <LegendDot status="skipped" label="Skipped" />
      </ul>
    </div>
  );
}

function LegendDot({ status, label }: { status: StopPinStatus; label: string }) {
  const c = STOP_PIN_COLORS[status];
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full border"
        style={{ background: c.fill, borderColor: c.stroke }}
      />
      {label}
    </li>
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

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}

function stopTooltip(
  stop: MapRouteStop,
  pinStatus: StopPinStatus,
): string {
  const parts: string[] = [stop.address || "(no address)"];
  parts.push(`Status: ${stop.status}`);
  if (stop.completedAt) {
    parts.push(`Completed: ${new Date(stop.completedAt).toLocaleString()}`);
  }
  if (
    stop.cooldown.kind === "cooling_down" &&
    pinStatus === "completed_cooling"
  ) {
    parts.push(
      `Next eligible: ${new Date(stop.cooldown.nextEligibleAt).toLocaleDateString()}`,
    );
  }
  return parts.join("\n");
}

// -------------------------------------------------------------------------
// Shape + pin drawing
// -------------------------------------------------------------------------

function drawShape(input: {
  google: typeof google;
  map: google.maps.Map;
  routeId: string;
  routeName: string;
  shape: RouteMapShape;
  isSelected: boolean;
  onClick: () => void;
}): OverlayHandle[] {
  const { google: g, map, shape, isSelected, onClick, routeName } = input;
  const polygonStyle = isSelected ? SHAPE_STYLE_SELECTED : SHAPE_STYLE_DEFAULT;
  const lineStyle = isSelected ? LINE_STYLE_SELECTED : LINE_STYLE_DEFAULT;

  switch (shape.kind) {
    case "polygon": {
      const path = shape.points.map((p) => ({ lat: p.lat, lng: p.lng }));
      const polygon = new g.maps.Polygon({
        ...polygonStyle,
        clickable: true,
        paths: path,
        zIndex: isSelected ? 5 : 1,
      });
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
      const polyline = new g.maps.Polyline({
        ...lineStyle,
        clickable: true,
        path,
        zIndex: isSelected ? 5 : 1,
      });
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
        title: routeName,
        zIndex: isSelected ? 5 : 1,
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
        ...polygonStyle,
        clickable: true,
        center: { lat: shape.center.lat, lng: shape.center.lng },
        radius: shape.radiusMiles * MILES_TO_METERS,
        zIndex: isSelected ? 5 : 1,
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

function drawStopPin(input: {
  google: typeof google;
  map: google.maps.Map;
  position: { lat: number; lng: number };
  title: string;
  pinStatus: StopPinStatus;
}): OverlayHandle {
  const { google: g, map, position, title, pinStatus } = input;
  const colors = STOP_PIN_COLORS[pinStatus];
  const marker = new g.maps.Marker({
    position,
    map,
    title,
    zIndex: 10,
    icon: {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: colors.fill,
      fillOpacity: 0.9,
      strokeColor: colors.stroke,
      strokeWeight: 1.5,
    },
  });
  return {
    shape: marker,
    remove: () => marker.setMap(null),
  };
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
// when the URL hash names a route id that no longer exists.
export function resolveSelectedRouteId(
  routes: ReadonlyArray<{ id: string }>,
  requested: string | null,
): string | null {
  if (!requested) return null;
  return routes.some((r) => r.id === requested) ? requested : null;
}

export type { RouteMapShape };
