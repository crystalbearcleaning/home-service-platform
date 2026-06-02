import { describe, expect, it } from "vitest";

import {
  DOOR_HANGER_DEFAULT_COOLDOWN_DAYS,
  computeCooldownStatus,
  getDoorHangerRouteMapReferenceTime,
  summarizeRouteCooldown,
} from "./cooldown";

const DAY = 24 * 60 * 60 * 1000;

describe("computeCooldownStatus", () => {
  it("returns not_completed when completedAt is null", () => {
    expect(
      computeCooldownStatus({
        completedAt: null,
        cooldownDays: 60,
        referenceTime: "2026-06-02T00:00:00Z",
      }),
    ).toEqual({ kind: "not_completed" });
  });

  it("returns not_completed for invalid completedAt", () => {
    expect(
      computeCooldownStatus({
        completedAt: "not-a-date",
        cooldownDays: 60,
        referenceTime: "2026-06-02T00:00:00Z",
      }),
    ).toEqual({ kind: "not_completed" });
  });

  it("returns cooling_down when reference < completedAt + cooldownDays", () => {
    const completed = new Date("2026-05-01T00:00:00Z");
    const ref = new Date("2026-05-15T00:00:00Z");
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: 60,
      referenceTime: ref,
    });
    expect(r.kind).toBe("cooling_down");
    if (r.kind !== "cooling_down") throw new Error("unreachable");
    expect(r.nextEligibleAt).toBe("2026-06-30T00:00:00.000Z");
    expect(r.daysUntilEligible).toBe(46);
  });

  it("returns eligible when reference >= completedAt + cooldownDays", () => {
    const completed = new Date("2026-01-01T00:00:00Z");
    const ref = new Date("2026-06-02T00:00:00Z");
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: 60,
      referenceTime: ref,
    });
    expect(r.kind).toBe("eligible");
    if (r.kind !== "eligible") throw new Error("unreachable");
    expect(r.nextEligibleAt).toBe("2026-03-02T00:00:00.000Z");
  });

  it("treats cooldownDays=0 as immediately eligible", () => {
    const completed = new Date("2026-06-02T00:00:00Z");
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: 0,
      referenceTime: completed,
    });
    expect(r.kind).toBe("eligible");
  });

  it("falls back to the 60-day default when cooldownDays is null", () => {
    const completed = new Date("2026-05-01T00:00:00Z");
    const ref = new Date(completed.getTime() + 59 * DAY);
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: null,
      referenceTime: ref,
    });
    expect(r.kind).toBe("cooling_down");
  });

  it("treats negative cooldownDays as 0 (immediate eligibility)", () => {
    const completed = new Date("2026-05-01T00:00:00Z");
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: -10,
      referenceTime: completed,
    });
    expect(r.kind).toBe("eligible");
  });

  it("rounds daysUntilEligible up (operator sees '1 day' through the final 24h)", () => {
    const completed = new Date("2026-06-01T00:00:00Z");
    const ref = new Date("2026-06-29T12:00:00Z"); // 1.5 days remaining
    const r = computeCooldownStatus({
      completedAt: completed,
      cooldownDays: 30,
      referenceTime: ref,
    });
    if (r.kind !== "cooling_down") throw new Error("expected cooling_down");
    expect(r.daysUntilEligible).toBe(2);
  });

  it("exports the documented default of 60 days", () => {
    expect(DOOR_HANGER_DEFAULT_COOLDOWN_DAYS).toBe(60);
  });
});

describe("summarizeRouteCooldown", () => {
  const cooldownDays = 30;
  const ref = "2026-06-02T00:00:00Z";

  it("returns zeroes for an empty stops list", () => {
    const r = summarizeRouteCooldown({ stops: [], cooldownDays, referenceTime: ref });
    expect(r).toEqual({
      totalCount: 0,
      pendingCount: 0,
      completedCount: 0,
      skippedCount: 0,
      coolingDownCount: 0,
      eligibleCount: 0,
      routeNextEligibleAt: null,
    });
  });

  it("counts pending / completed / skipped buckets", () => {
    const r = summarizeRouteCooldown({
      stops: [
        { status: "pending" },
        { status: "pending" },
        { status: "completed", completedAt: "2026-05-25T00:00:00Z" }, // cooling
        { status: "completed", completedAt: "2026-01-01T00:00:00Z" }, // eligible
        { status: "skipped" },
      ],
      cooldownDays,
      referenceTime: ref,
    });
    expect(r.totalCount).toBe(5);
    expect(r.pendingCount).toBe(2);
    expect(r.completedCount).toBe(2);
    expect(r.skippedCount).toBe(1);
    expect(r.coolingDownCount).toBe(1);
    expect(r.eligibleCount).toBe(1);
    // coolingDown + eligible === completed.
    expect(r.coolingDownCount + r.eligibleCount).toBe(r.completedCount);
  });

  it("picks the earliest next_eligible among cooling-down stops", () => {
    const r = summarizeRouteCooldown({
      stops: [
        { status: "completed", completedAt: "2026-05-25T00:00:00Z" }, // +30d = 2026-06-24
        { status: "completed", completedAt: "2026-05-20T00:00:00Z" }, // +30d = 2026-06-19
        { status: "completed", completedAt: "2026-05-30T00:00:00Z" }, // +30d = 2026-06-29
      ],
      cooldownDays,
      referenceTime: ref,
    });
    expect(r.coolingDownCount).toBe(3);
    expect(r.routeNextEligibleAt).toBe("2026-06-19T00:00:00.000Z");
  });

  it("returns null routeNextEligibleAt when nothing is cooling down", () => {
    const r = summarizeRouteCooldown({
      stops: [
        { status: "pending" },
        { status: "completed", completedAt: "2025-01-01T00:00:00Z" }, // long-eligible
      ],
      cooldownDays,
      referenceTime: ref,
    });
    expect(r.coolingDownCount).toBe(0);
    expect(r.eligibleCount).toBe(1);
    expect(r.routeNextEligibleAt).toBeNull();
  });

  it("ignores unknown statuses without crashing", () => {
    const r = summarizeRouteCooldown({
      stops: [{ status: "weird" }, { status: "pending" }],
      cooldownDays,
      referenceTime: ref,
    });
    expect(r.totalCount).toBe(2);
    expect(r.pendingCount).toBe(1);
    expect(r.completedCount).toBe(0);
  });
});

describe("getDoorHangerRouteMapReferenceTime", () => {
  const fixedNow = new Date("2026-06-02T12:00:00Z");

  it("returns real_now in a real workspace", () => {
    const r = getDoorHangerRouteMapReferenceTime({
      isSimulation: false,
      now: fixedNow,
    });
    expect(r.source).toBe("real_now");
    expect(r.referenceTime).toBe(fixedNow.toISOString());
  });

  it("returns simulated_clock when sim + active save provides one", () => {
    const r = getDoorHangerRouteMapReferenceTime({
      isSimulation: true,
      activeSave: { simulatedCurrentAt: "2026-05-26T16:33:00Z" },
      now: fixedNow,
    });
    expect(r.source).toBe("simulated_clock");
    expect(r.referenceTime).toBe("2026-05-26T16:33:00.000Z");
  });

  it("falls back to now() when sim but no active save", () => {
    const r = getDoorHangerRouteMapReferenceTime({
      isSimulation: true,
      activeSave: null,
      now: fixedNow,
    });
    expect(r.source).toBe("fallback_now_no_active_save");
    expect(r.referenceTime).toBe(fixedNow.toISOString());
  });

  it("falls back to now() when sim active save has no simulated_current_at", () => {
    const r = getDoorHangerRouteMapReferenceTime({
      isSimulation: true,
      activeSave: { simulatedCurrentAt: null },
      now: fixedNow,
    });
    expect(r.source).toBe("fallback_now_no_active_save");
  });

  it("falls back to now() when sim active save's simulated_current_at is invalid", () => {
    const r = getDoorHangerRouteMapReferenceTime({
      isSimulation: true,
      activeSave: { simulatedCurrentAt: "not-a-date" },
      now: fixedNow,
    });
    expect(r.source).toBe("fallback_now_no_active_save");
  });

  it("uses the real Date.now() default when `now` is not provided", () => {
    const r = getDoorHangerRouteMapReferenceTime({ isSimulation: false });
    // We can't assert the exact value; just that it parses and is
    // within the past minute.
    const t = new Date(r.referenceTime).getTime();
    expect(Number.isFinite(t)).toBe(true);
    expect(Date.now() - t).toBeLessThan(60_000);
  });
});
