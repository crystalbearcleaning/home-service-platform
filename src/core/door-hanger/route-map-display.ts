// Pure presentation helpers for the Phase 8D route map overlays.
//
// No DB, no env, no `server-only`, no browser globals. Safe to import
// from client components.
//
// Source of truth:
//   docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md §§5, 7, 8, 11

import type { CooldownStopStatus, RouteCooldownSummary } from "./cooldown";

// -------------------------------------------------------------------------
// Per-stop pin status (drives marker tint on the map)
// -------------------------------------------------------------------------

export type StopPinStatus =
  | "pending"
  | "completed_cooling"
  | "completed_eligible"
  | "skipped"
  | "unknown";

export function pinStatusForStop(input: {
  status: string;
  cooldown: CooldownStopStatus;
}): StopPinStatus {
  if (input.status === "pending") return "pending";
  if (input.status === "skipped") return "skipped";
  if (input.status === "completed") {
    if (input.cooldown.kind === "cooling_down") return "completed_cooling";
    return "completed_eligible";
  }
  return "unknown";
}

// Tints chosen for visible contrast on the default Google Maps base
// layer. Returned as plain hex strings so the consumer can pass them
// straight into Google's `Symbol.fillColor` / `strokeColor`.
export const STOP_PIN_COLORS: Readonly<Record<StopPinStatus, {
  fill: string;
  stroke: string;
}>> = {
  pending: { fill: "#3b82f6", stroke: "#1e3a8a" },
  completed_cooling: { fill: "#f59e0b", stroke: "#92400e" },
  completed_eligible: { fill: "#10b981", stroke: "#065f46" },
  skipped: { fill: "#9ca3af", stroke: "#374151" },
  unknown: { fill: "#9ca3af", stroke: "#374151" },
};

// -------------------------------------------------------------------------
// Route-level cooldown headline
// -------------------------------------------------------------------------

export type RouteCooldownHeadline =
  | { kind: "not_walked"; label: string }
  | { kind: "all_eligible"; label: string }
  | {
      kind: "cooling_down";
      label: string;
      nextEligibleAt: string;
    };

// Produces the single-line cooldown headline the overlay + table
// render under each route's name.
export function routeCooldownHeadline(
  summary: RouteCooldownSummary,
): RouteCooldownHeadline {
  if (summary.completedCount === 0) {
    return { kind: "not_walked", label: "Not walked yet" };
  }
  if (
    summary.coolingDownCount === 0 ||
    summary.routeNextEligibleAt === null
  ) {
    return { kind: "all_eligible", label: "Eligible" };
  }
  return {
    kind: "cooling_down",
    label: `Cooling down until ${formatLocalDate(summary.routeNextEligibleAt)}`,
    nextEligibleAt: summary.routeNextEligibleAt,
  };
}

// "Compact counts" rendered in the routes table:
//   "100 stops · 26 done · 74 pending · 0 cooling · 26 eligible"
// The skipped count is folded in only when non-zero so the line stays
// terse on the common path.
export function formatRouteCountsLine(
  summary: RouteCooldownSummary,
): string {
  const parts: string[] = [
    `${summary.totalCount} stop${summary.totalCount === 1 ? "" : "s"}`,
    `${summary.completedCount} done`,
    `${summary.pendingCount} pending`,
  ];
  if (summary.skippedCount > 0) {
    parts.push(`${summary.skippedCount} skipped`);
  }
  parts.push(`${summary.coolingDownCount} cooling`);
  parts.push(`${summary.eligibleCount} eligible`);
  return parts.join(" · ");
}

// -------------------------------------------------------------------------
// Selection helper
// -------------------------------------------------------------------------

export function selectedRouteFromList<T extends { id: string }>(
  routes: ReadonlyArray<T>,
  selectedId: string | null,
): T | null {
  if (!selectedId) return null;
  return routes.find((r) => r.id === selectedId) ?? null;
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function formatLocalDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
