import { describe, expect, it } from "vitest";

import type { CooldownStopStatus, RouteCooldownSummary } from "./cooldown";
import {
  STOP_PIN_COLORS,
  formatRouteCountsLine,
  pinStatusForStop,
  routeCooldownHeadline,
  selectedRouteFromList,
} from "./route-map-display";

function cooldown(kind: CooldownStopStatus["kind"]): CooldownStopStatus {
  if (kind === "not_completed") return { kind: "not_completed" };
  if (kind === "cooling_down") {
    return {
      kind: "cooling_down",
      completedAt: "2026-05-01T00:00:00Z",
      nextEligibleAt: "2026-06-30T00:00:00Z",
      daysUntilEligible: 28,
    };
  }
  return {
    kind: "eligible",
    completedAt: "2026-01-01T00:00:00Z",
    nextEligibleAt: "2026-03-01T00:00:00Z",
  };
}

describe("pinStatusForStop", () => {
  it("returns 'pending' for status='pending'", () => {
    expect(
      pinStatusForStop({ status: "pending", cooldown: cooldown("not_completed") }),
    ).toBe("pending");
  });

  it("returns 'skipped' for status='skipped'", () => {
    expect(
      pinStatusForStop({ status: "skipped", cooldown: cooldown("not_completed") }),
    ).toBe("skipped");
  });

  it("returns 'completed_cooling' for completed + cooling_down", () => {
    expect(
      pinStatusForStop({ status: "completed", cooldown: cooldown("cooling_down") }),
    ).toBe("completed_cooling");
  });

  it("returns 'completed_eligible' for completed + eligible", () => {
    expect(
      pinStatusForStop({ status: "completed", cooldown: cooldown("eligible") }),
    ).toBe("completed_eligible");
  });

  it("returns 'completed_eligible' for completed + not_completed (defensive)", () => {
    // A completed stop with a missing completedAt would degrade the
    // per-stop cooldown to not_completed; treat that as eligible.
    expect(
      pinStatusForStop({ status: "completed", cooldown: cooldown("not_completed") }),
    ).toBe("completed_eligible");
  });

  it("returns 'unknown' for any other status", () => {
    expect(
      pinStatusForStop({ status: "weird", cooldown: cooldown("not_completed") }),
    ).toBe("unknown");
  });

  it("exports a color for every status (no missing tints)", () => {
    const expected = [
      "pending",
      "completed_cooling",
      "completed_eligible",
      "skipped",
      "unknown",
    ] as const;
    for (const k of expected) {
      expect(STOP_PIN_COLORS[k]).toBeDefined();
      expect(STOP_PIN_COLORS[k].fill).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(STOP_PIN_COLORS[k].stroke).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("routeCooldownHeadline", () => {
  const base: RouteCooldownSummary = {
    totalCount: 100,
    pendingCount: 0,
    completedCount: 0,
    skippedCount: 0,
    coolingDownCount: 0,
    eligibleCount: 0,
    routeNextEligibleAt: null,
  };

  it("returns 'not_walked' when no completed stops", () => {
    const r = routeCooldownHeadline({ ...base, pendingCount: 100 });
    expect(r.kind).toBe("not_walked");
  });

  it("returns 'all_eligible' when all completed stops are eligible", () => {
    const r = routeCooldownHeadline({
      ...base,
      completedCount: 25,
      eligibleCount: 25,
      coolingDownCount: 0,
      routeNextEligibleAt: null,
    });
    expect(r.kind).toBe("all_eligible");
  });

  it("returns 'cooling_down' with date when at least one stop is cooling", () => {
    const r = routeCooldownHeadline({
      ...base,
      completedCount: 10,
      eligibleCount: 4,
      coolingDownCount: 6,
      routeNextEligibleAt: "2026-07-15T00:00:00Z",
    });
    expect(r.kind).toBe("cooling_down");
    if (r.kind !== "cooling_down") throw new Error("unreachable");
    expect(r.label).toContain("Cooling down until");
    expect(r.nextEligibleAt).toBe("2026-07-15T00:00:00Z");
  });

  it("defaults to 'all_eligible' when summary lacks routeNextEligibleAt despite coolingDownCount > 0", () => {
    // Defensive: this state shouldn't happen (summary invariant), but
    // the helper must not crash.
    const r = routeCooldownHeadline({
      ...base,
      completedCount: 5,
      coolingDownCount: 5,
      routeNextEligibleAt: null,
    });
    expect(r.kind).toBe("all_eligible");
  });
});

describe("formatRouteCountsLine", () => {
  const summary: RouteCooldownSummary = {
    totalCount: 100,
    pendingCount: 74,
    completedCount: 26,
    skippedCount: 0,
    coolingDownCount: 0,
    eligibleCount: 26,
    routeNextEligibleAt: null,
  };

  it("formats the compact counts line", () => {
    expect(formatRouteCountsLine(summary)).toBe(
      "100 stops · 26 done · 74 pending · 0 cooling · 26 eligible",
    );
  });

  it("singularises 'stops'", () => {
    expect(
      formatRouteCountsLine({
        ...summary,
        totalCount: 1,
        pendingCount: 1,
        completedCount: 0,
        eligibleCount: 0,
      }),
    ).toContain("1 stop ·");
  });

  it("omits skipped when zero, includes when non-zero", () => {
    expect(formatRouteCountsLine(summary)).not.toContain("skipped");
    expect(
      formatRouteCountsLine({ ...summary, skippedCount: 3 }),
    ).toContain("3 skipped");
  });
});

describe("selectedRouteFromList", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns null when selectedId is null", () => {
    expect(selectedRouteFromList(items, null)).toBeNull();
  });

  it("returns the matching item", () => {
    expect(selectedRouteFromList(items, "b")).toEqual({ id: "b" });
  });

  it("returns null when the id is not found", () => {
    expect(selectedRouteFromList(items, "z")).toBeNull();
  });
});
