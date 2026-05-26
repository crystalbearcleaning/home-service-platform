// Pure decision helper for the /admin/simulation/play gate (§3 of
// docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md).
//
// No DB, no env, no server-only. Safe to import from anywhere — kept
// pure so the rule is unit-testable without rendering.

export type PlayPageGate =
  | { kind: "play"; businessName: string; activeRunId: string }
  | { kind: "not_simulation_workspace"; businessName: string }
  | { kind: "no_active_save"; businessName: string };

export function resolvePlayPageGate(input: {
  business: { name: string; isSimulation: boolean };
  activeRunId: string | null | undefined;
}): PlayPageGate {
  if (!input.business.isSimulation) {
    return {
      kind: "not_simulation_workspace",
      businessName: input.business.name,
    };
  }
  if (!input.activeRunId) {
    return { kind: "no_active_save", businessName: input.business.name };
  }
  return {
    kind: "play",
    businessName: input.business.name,
    activeRunId: input.activeRunId,
  };
}

// Pure progress calculator for the read-only "current Door Hanger
// session" card. Returns null when no session is active. Phase 7C
// uses this to render % progress + remaining counts without touching
// the DB twice.
export type SessionProgress = {
  hangersDistributed: number;
  remainingHangers: number;
  totalHangers: number;
  percentDistributed: number;
};

export function computeSessionProgress(input: {
  hangersDistributed: number;
  routeHasStops: boolean;
  totalRouteStops: number;
  targetHomeCount: number | null;
}): SessionProgress | null {
  const distributed = clampNonNegInt(input.hangersDistributed);

  // Prefer route_stops total when stops exist; otherwise fall back to
  // the manual target. Either way, return null when we have no total
  // to compare against — the UI then shows "—" instead of a fake bar.
  let total: number;
  if (input.routeHasStops && Number.isFinite(input.totalRouteStops)) {
    total = clampNonNegInt(input.totalRouteStops);
  } else if (
    input.targetHomeCount !== null &&
    Number.isFinite(input.targetHomeCount)
  ) {
    total = clampNonNegInt(input.targetHomeCount);
  } else {
    return null;
  }

  if (total <= 0) {
    return {
      hangersDistributed: distributed,
      remainingHangers: 0,
      totalHangers: 0,
      percentDistributed: 0,
    };
  }
  const remaining = Math.max(0, total - distributed);
  const pct = Math.max(0, Math.min(100, Math.round((distributed / total) * 100)));
  return {
    hangersDistributed: distributed,
    remainingHangers: remaining,
    totalHangers: total,
    percentDistributed: pct,
  };
}

function clampNonNegInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.floor(n);
}
