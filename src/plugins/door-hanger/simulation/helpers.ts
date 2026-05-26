// Door Hanger Plugin — Phase 7 simulation pure helpers.
//
// Implements §§5, 6, 8, 11 of the Phase 7 doc as pure functions so the
// gameplay actions in Phase 7D can call these without DB plumbing and
// the unit tests can pin the rules.
//
// No DB, no env, no `server-only`. Helpers here are deterministic.

import { DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER } from "./assumptions";

// -------------------------------------------------------------------------
// Effective hang count
// -------------------------------------------------------------------------
//
// Every Hang action (Hang 1, Hang custom, Hang route) is bounded by:
//   1. the requested count
//   2. remaining inventory on the chosen design
//   3. remaining route stops (when stops exist) OR the route's
//      target_home_count (count-only fallback) — passed as
//      `remainingTargets`.
//
// The smallest non-negative number wins. Returns 0 when no work is
// possible — callers must surface that case as a friendly error rather
// than write a no-op session row.

export type EffectiveHangCapReason =
  | "REQUEST"
  | "INVENTORY"
  | "STOPS"
  | "ZERO";

export type EffectiveHangCount = {
  effective: number;
  capped: boolean;
  cappedBy: EffectiveHangCapReason;
};

export function computeEffectiveHangCount(input: {
  requested: number;
  remainingInventory: number;
  remainingTargets: number;
}): EffectiveHangCount {
  const req = clampNonNegInt(input.requested);
  const inv = clampNonNegInt(input.remainingInventory);
  const stops = clampNonNegInt(input.remainingTargets);

  // Smallest wins. Track which input pinned the answer so the UI can
  // surface a specific reason ("only N hangers left", "only N stops
  // remaining").
  let effective = req;
  let cappedBy: EffectiveHangCapReason = "REQUEST";
  if (inv < effective) {
    effective = inv;
    cappedBy = "INVENTORY";
  }
  if (stops < effective) {
    effective = stops;
    cappedBy = "STOPS";
  }
  if (effective <= 0) {
    return { effective: 0, capped: true, cappedBy: "ZERO" };
  }
  return {
    effective,
    capped: effective < req,
    cappedBy,
  };
}

function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.floor(n);
}

// -------------------------------------------------------------------------
// Time advance
// -------------------------------------------------------------------------
//
// Every action advances simulation_runs.simulated_current_at by
// `effectiveN * session.seconds_per_hanger`. Wall-clock is irrelevant.

export function computeTimeAdvanceSeconds(input: {
  effectiveCount: number;
  secondsPerHanger: number;
}): number {
  const n = clampNonNegInt(input.effectiveCount);
  const sec = Number.isFinite(input.secondsPerHanger)
    ? Math.max(1, Math.floor(input.secondsPerHanger))
    : DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER;
  return n * sec;
}

// Human-readable duration formatter for the play page + activity feed.
// Returns "0 sec" for non-positive inputs so the UI never renders an
// empty string.
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0 sec";
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds} sec`);
  return parts.join(" ");
}

// -------------------------------------------------------------------------
// Route completion
// -------------------------------------------------------------------------
//
// A route is "done" when there is nothing left to hang against. With
// route stops, that means no pending stops remain. Without route stops
// (count-only fallback), that means hangers_distributed has reached the
// target.

export function isRouteComplete(input: {
  hasRouteStops: boolean;
  remainingStops: number;
  hangersDistributedSoFar: number;
  targetCount: number | null;
}): boolean {
  if (input.hasRouteStops) {
    return clampNonNegInt(input.remainingStops) === 0;
  }
  if (input.targetCount === null || !Number.isFinite(input.targetCount)) {
    return false;
  }
  return (
    clampNonNegInt(input.hangersDistributedSoFar) >=
    clampNonNegInt(input.targetCount)
  );
}

// -------------------------------------------------------------------------
// Activity summary formatter
// -------------------------------------------------------------------------

export function formatHangActivitySummary(input: {
  action: "hang_one" | "hang_custom" | "hang_route";
  count: number;
  routeName?: string | null;
}): string {
  const n = clampNonNegInt(input.count);
  if (input.action === "hang_one") return "Hung 1 door hanger";
  const noun = n === 1 ? "door hanger" : "door hangers";
  if (input.action === "hang_route") {
    return `Hung ${n} ${noun} (route completion)`;
  }
  return `Hung ${n} ${noun}`;
}

export function formatSessionStartedSummary(routeName: string | null): string {
  const name = (routeName ?? "").trim();
  if (name.length === 0) return "Started simulated route";
  return `Started route ${name}`;
}

export function formatRouteCompletedSummary(routeName: string | null): string {
  const name = (routeName ?? "").trim();
  if (name.length === 0) return "Route completed";
  return `Route ${name} completed`;
}

export function formatSessionCompletedSummary(): string {
  return "Session completed";
}

export function formatSessionEndedEarlySummary(): string {
  return "Session ended early";
}
