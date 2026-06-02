// Pure cooldown helpers for the Phase 8 Door Hanger route map.
//
// Source of truth:
//   docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md §11 + §13
//
// No DB, no env, no `server-only`. Safe to import from anywhere —
// kept pure so the cooldown rule is unit-testable without rendering.

export const DOOR_HANGER_DEFAULT_COOLDOWN_DAYS = 60 as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// -------------------------------------------------------------------------
// Per-stop cooldown status
// -------------------------------------------------------------------------

export type CooldownStopStatus =
  | { kind: "not_completed" }
  | {
      kind: "cooling_down";
      completedAt: string;
      nextEligibleAt: string;
      daysUntilEligible: number;
    }
  | {
      kind: "eligible";
      completedAt: string;
      nextEligibleAt: string;
    };

export type ComputeCooldownInput = {
  completedAt: string | Date | null | undefined;
  cooldownDays: number | null | undefined;
  referenceTime: string | Date;
};

export function computeCooldownStatus(
  input: ComputeCooldownInput,
): CooldownStopStatus {
  if (input.completedAt === null || input.completedAt === undefined) {
    return { kind: "not_completed" };
  }
  const completed = toDate(input.completedAt);
  if (!completed) return { kind: "not_completed" };

  const reference = toDate(input.referenceTime) ?? new Date();
  const days = normalizeCooldownDays(input.cooldownDays);

  const nextEligibleMs = completed.getTime() + days * MS_PER_DAY;
  const nextEligibleIso = new Date(nextEligibleMs).toISOString();
  const completedIso = completed.toISOString();

  if (reference.getTime() >= nextEligibleMs) {
    return {
      kind: "eligible",
      completedAt: completedIso,
      nextEligibleAt: nextEligibleIso,
    };
  }
  // Round up so an operator sees "1 day left" through the entire
  // final 24 hours, not "0 days" for most of it. ceil also matches
  // the operator intuition of "wait at least N more days."
  const remainingMs = nextEligibleMs - reference.getTime();
  const daysUntilEligible = Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
  return {
    kind: "cooling_down",
    completedAt: completedIso,
    nextEligibleAt: nextEligibleIso,
    daysUntilEligible,
  };
}

// -------------------------------------------------------------------------
// Route-level summary
// -------------------------------------------------------------------------

export type SummaryStopInput = {
  status: "pending" | "completed" | "skipped" | string;
  completedAt?: string | Date | null;
};

export type RouteCooldownSummary = {
  totalCount: number;
  pendingCount: number;
  completedCount: number;
  skippedCount: number;
  coolingDownCount: number;
  eligibleCount: number;
  // Earliest next_eligible_at among cooling-down stops, ISO string,
  // or null when the route has no cooling-down stops (fully eligible
  // or no completed stops at all).
  routeNextEligibleAt: string | null;
};

export type SummarizeRouteCooldownInput = {
  stops: ReadonlyArray<SummaryStopInput>;
  cooldownDays: number | null | undefined;
  referenceTime: string | Date;
};

export function summarizeRouteCooldown(
  input: SummarizeRouteCooldownInput,
): RouteCooldownSummary {
  const summary: RouteCooldownSummary = {
    totalCount: 0,
    pendingCount: 0,
    completedCount: 0,
    skippedCount: 0,
    coolingDownCount: 0,
    eligibleCount: 0,
    routeNextEligibleAt: null,
  };
  if (!Array.isArray(input.stops)) return summary;
  summary.totalCount = input.stops.length;

  let earliestCoolingMs: number | null = null;
  for (const s of input.stops) {
    if (s.status === "pending") summary.pendingCount += 1;
    else if (s.status === "completed") summary.completedCount += 1;
    else if (s.status === "skipped") summary.skippedCount += 1;
    // Unknown statuses don't count toward any bucket — defensive.

    if (s.status !== "completed") continue;

    const status = computeCooldownStatus({
      completedAt: s.completedAt ?? null,
      cooldownDays: input.cooldownDays,
      referenceTime: input.referenceTime,
    });
    if (status.kind === "cooling_down") {
      summary.coolingDownCount += 1;
      const ms = new Date(status.nextEligibleAt).getTime();
      if (earliestCoolingMs === null || ms < earliestCoolingMs) {
        earliestCoolingMs = ms;
      }
    } else if (status.kind === "eligible") {
      summary.eligibleCount += 1;
    }
    // not_completed shouldn't happen here (status='completed' guard
    // above) but if completedAt is missing/invalid, the cooldown
    // status will degrade to 'not_completed' — leave the per-bucket
    // counts untouched but don't crash.
  }

  summary.routeNextEligibleAt =
    earliestCoolingMs === null
      ? null
      : new Date(earliestCoolingMs).toISOString();
  return summary;
}

// -------------------------------------------------------------------------
// Reference time helper
// -------------------------------------------------------------------------

export type DoorHangerActiveSaveInput = {
  simulatedCurrentAt?: string | null;
};

export type RouteMapReferenceTime = {
  referenceTime: string; // ISO
  source: "real_now" | "simulated_clock" | "fallback_now_no_active_save";
};

// Returns the reference time the cooldown calculation should use:
//   - real workspace            → real now()
//   - sim workspace + save      → save.simulated_current_at
//   - sim workspace + no save   → real now() (with a flag so the UI
//                                 can render a soft notice)
export function getDoorHangerRouteMapReferenceTime(input: {
  isSimulation: boolean;
  activeSave?: DoorHangerActiveSaveInput | null;
  now?: Date | string;
}): RouteMapReferenceTime {
  const realNow =
    (input.now ? toDate(input.now) : null) ?? new Date();

  if (!input.isSimulation) {
    return { referenceTime: realNow.toISOString(), source: "real_now" };
  }
  const sim = input.activeSave?.simulatedCurrentAt;
  if (sim) {
    const d = toDate(sim);
    if (d) {
      return {
        referenceTime: d.toISOString(),
        source: "simulated_clock",
      };
    }
  }
  return {
    referenceTime: realNow.toISOString(),
    source: "fallback_now_no_active_save",
  };
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

function toDate(value: string | Date): Date | null;
function toDate(value: string | Date | null | undefined): Date | null;
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeCooldownDays(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return DOOR_HANGER_DEFAULT_COOLDOWN_DAYS;
  if (!Number.isFinite(raw)) return DOOR_HANGER_DEFAULT_COOLDOWN_DAYS;
  if (raw < 0) return 0;
  return Math.floor(raw);
}
