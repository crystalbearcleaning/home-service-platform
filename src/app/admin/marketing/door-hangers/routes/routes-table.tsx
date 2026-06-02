"use client";

import {
  formatRouteCountsLine,
  routeCooldownHeadline,
} from "@/core/door-hanger/route-map-display";

import type { MapRouteFull } from "./route-map";

// =========================================================================
// Phase 8D — Routes table overlay.
//
// Floating panel that lists every saved route for the active business.
// Each row exposes a "Focus on map" action that selects the route,
// closes the table, opens the details overlay, and fits the map.
//
// Read-only: no edit / delete / archive / multi-select / advanced
// filters in Phase 8.
// =========================================================================

type Props = {
  routes: ReadonlyArray<MapRouteFull>;
  open: boolean;
  selectedId: string | null;
  onClose: () => void;
  onFocus: (routeId: string) => void;
};

export function RoutesTableOverlay({
  routes,
  open,
  selectedId,
  onClose,
  onFocus,
}: Props) {
  if (!open) return null;

  return (
    <aside
      className="pointer-events-auto absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[28rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
      aria-label="Routes table"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Marketing · Door Hangers
          </div>
          <h2 className="text-sm font-semibold text-ink">
            Routes ({routes.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close routes table"
          className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted hover:text-ink"
        >
          Close
        </button>
      </header>

      <div className="overflow-y-auto">
        {routes.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-muted">
            No routes yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {routes.map((r) => (
              <li
                key={r.id}
                className={
                  r.id === selectedId
                    ? "bg-brand/5 px-4 py-3"
                    : "px-4 py-3"
                }
              >
                <RouteRow
                  route={r}
                  onFocus={() => onFocus(r.id)}
                  isTableOnly={r.shape.kind === "none"}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RouteRow({
  route,
  onFocus,
  isTableOnly,
}: {
  route: MapRouteFull;
  onFocus: () => void;
  isTableOnly: boolean;
}) {
  const headline = routeCooldownHeadline(route.cooldownSummary);
  const headlineTone =
    headline.kind === "cooling_down"
      ? "text-warning-strong"
      : headline.kind === "all_eligible"
        ? "text-success"
        : "text-ink-muted";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="truncate text-sm font-medium text-ink">
              {route.name}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">
              {route.generatedFromSource}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">
              · {route.status}
            </span>
          </div>
          {route.campaignName && (
            <div className="truncate text-[11px] text-ink-muted">
              {route.campaignName}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onFocus}
          disabled={isTableOnly}
          title={
            isTableOnly
              ? "No geometry — can't focus on the map"
              : "Focus on map"
          }
          className="shrink-0 rounded-pill border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Focus on map
        </button>
      </div>

      <div className={`text-[11px] ${headlineTone}`}>{headline.label}</div>

      <div className="text-[11px] text-ink-muted">
        {formatRouteCountsLine(route.cooldownSummary)} · cooldown{" "}
        {route.cooldownDays}d
      </div>

      <div className="text-[10px] text-ink-faint">
        Last completed: {formatIso(route.lastCompletedAt)} · Next
        eligible: {formatIso(route.cooldownSummary.routeNextEligibleAt)}
      </div>

      {isTableOnly && (
        <div className="text-[10px] text-warning-strong">
          Table-only: no geometry. Add route stops or a center+radius
          to draw on the map.
        </div>
      )}
    </div>
  );
}

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}
