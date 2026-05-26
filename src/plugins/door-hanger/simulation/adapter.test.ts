import { describe, expect, it } from "vitest";

import {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  DOOR_HANGER_SECONDS_PER_HANGER_MAX,
  DOOR_HANGER_SECONDS_PER_HANGER_MIN,
  parseSecondsPerHanger,
} from "./assumptions";
import {
  DOOR_HANGER_SIMULATION_ACTIONS,
  DOOR_HANGER_SIMULATION_ACTIVITY_TYPES,
  DOOR_HANGER_SIMULATION_ADAPTER,
  isDoorHangerSimulationActionKey,
  isDoorHangerSimulationActivityType,
} from "./adapter";
import {
  computeEffectiveHangCount,
  computeTimeAdvanceSeconds,
  formatDurationSeconds,
  formatHangActivitySummary,
  formatRouteCompletedSummary,
  formatSessionCompletedSummary,
  formatSessionEndedEarlySummary,
  formatSessionStartedSummary,
  isRouteComplete,
} from "./helpers";

describe("Phase 7 — Door Hanger simulation adapter scaffold", () => {
  describe("assumptions", () => {
    it("defaults to 30 seconds per hanger", () => {
      expect(DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER).toBe(30);
    });

    it("bounds the per-hanger range to [1, 600]", () => {
      expect(DOOR_HANGER_SECONDS_PER_HANGER_MIN).toBe(1);
      expect(DOOR_HANGER_SECONDS_PER_HANGER_MAX).toBe(600);
    });

    it("parses a valid integer seconds_per_hanger", () => {
      expect(parseSecondsPerHanger(45)).toEqual({
        ok: true,
        secondsPerHanger: 45,
      });
      expect(parseSecondsPerHanger("60")).toEqual({
        ok: true,
        secondsPerHanger: 60,
      });
    });

    it("rejects empty / nullish input as EMPTY", () => {
      expect(parseSecondsPerHanger(null)).toEqual({
        ok: false,
        reason: "EMPTY",
      });
      expect(parseSecondsPerHanger(undefined)).toEqual({
        ok: false,
        reason: "EMPTY",
      });
      expect(parseSecondsPerHanger("")).toEqual({
        ok: false,
        reason: "EMPTY",
      });
      expect(parseSecondsPerHanger("   ")).toEqual({
        ok: false,
        reason: "EMPTY",
      });
    });

    it("rejects non-numeric input", () => {
      expect(parseSecondsPerHanger("abc")).toEqual({
        ok: false,
        reason: "NOT_A_NUMBER",
      });
    });

    it("rejects non-integer input", () => {
      expect(parseSecondsPerHanger(30.5)).toEqual({
        ok: false,
        reason: "NOT_AN_INTEGER",
      });
    });

    it("rejects zero and negative values as OUT_OF_RANGE", () => {
      expect(parseSecondsPerHanger(0)).toEqual({
        ok: false,
        reason: "OUT_OF_RANGE",
      });
      expect(parseSecondsPerHanger(-30)).toEqual({
        ok: false,
        reason: "OUT_OF_RANGE",
      });
    });

    it("rejects values above max as OUT_OF_RANGE", () => {
      expect(parseSecondsPerHanger(601)).toEqual({
        ok: false,
        reason: "OUT_OF_RANGE",
      });
    });
  });

  describe("action key + activity type taxonomies", () => {
    it("pins the five Phase 7 action keys in order", () => {
      expect(DOOR_HANGER_SIMULATION_ACTIONS).toEqual([
        "start_route",
        "hang_one",
        "hang_custom",
        "hang_route",
        "finish_route",
      ]);
    });

    it("pins the seven Phase 7 activity types", () => {
      expect(DOOR_HANGER_SIMULATION_ACTIVITY_TYPES).toEqual([
        "door_hanger.session_started",
        "door_hanger.hang_one",
        "door_hanger.hang_custom",
        "door_hanger.hang_route",
        "door_hanger.route_completed",
        "door_hanger.session_completed",
        "door_hanger.session_ended_early",
      ]);
    });

    it("type-guards action keys", () => {
      expect(isDoorHangerSimulationActionKey("hang_one")).toBe(true);
      expect(isDoorHangerSimulationActionKey("hang_two")).toBe(false);
      expect(isDoorHangerSimulationActionKey(null)).toBe(false);
      expect(isDoorHangerSimulationActionKey(undefined)).toBe(false);
      expect(isDoorHangerSimulationActionKey(42)).toBe(false);
    });

    it("type-guards activity types", () => {
      expect(
        isDoorHangerSimulationActivityType("door_hanger.session_started"),
      ).toBe(true);
      expect(isDoorHangerSimulationActivityType("session_started")).toBe(false);
      expect(isDoorHangerSimulationActivityType(null)).toBe(false);
    });
  });

  describe("adapter manifest", () => {
    it("exposes the door_hanger plugin key + default seconds", () => {
      expect(DOOR_HANGER_SIMULATION_ADAPTER.pluginKey).toBe("door_hanger");
      expect(DOOR_HANGER_SIMULATION_ADAPTER.defaultSecondsPerHanger).toBe(30);
      expect(DOOR_HANGER_SIMULATION_ADAPTER.secondsPerHangerRange.min).toBe(1);
      expect(DOOR_HANGER_SIMULATION_ADAPTER.secondsPerHangerRange.max).toBe(
        600,
      );
    });

    it("re-exports the same action + activity taxonomies", () => {
      expect(DOOR_HANGER_SIMULATION_ADAPTER.actions).toEqual(
        DOOR_HANGER_SIMULATION_ACTIONS,
      );
      expect(DOOR_HANGER_SIMULATION_ADAPTER.activityTypes).toEqual(
        DOOR_HANGER_SIMULATION_ACTIVITY_TYPES,
      );
    });
  });

  describe("computeEffectiveHangCount", () => {
    it("returns the requested count when nothing caps it", () => {
      const r = computeEffectiveHangCount({
        requested: 5,
        remainingInventory: 100,
        remainingTargets: 50,
      });
      expect(r).toEqual({ effective: 5, capped: false, cappedBy: "REQUEST" });
    });

    it("caps by remaining inventory", () => {
      const r = computeEffectiveHangCount({
        requested: 25,
        remainingInventory: 10,
        remainingTargets: 50,
      });
      expect(r).toEqual({ effective: 10, capped: true, cappedBy: "INVENTORY" });
    });

    it("caps by remaining stops / target", () => {
      const r = computeEffectiveHangCount({
        requested: 25,
        remainingInventory: 100,
        remainingTargets: 8,
      });
      expect(r).toEqual({ effective: 8, capped: true, cappedBy: "STOPS" });
    });

    it("uses the smallest cap when multiple apply", () => {
      const r = computeEffectiveHangCount({
        requested: 25,
        remainingInventory: 12,
        remainingTargets: 5,
      });
      expect(r).toEqual({ effective: 5, capped: true, cappedBy: "STOPS" });
    });

    it("returns ZERO when nothing is left", () => {
      expect(
        computeEffectiveHangCount({
          requested: 10,
          remainingInventory: 0,
          remainingTargets: 5,
        }),
      ).toEqual({ effective: 0, capped: true, cappedBy: "ZERO" });
      expect(
        computeEffectiveHangCount({
          requested: 10,
          remainingInventory: 5,
          remainingTargets: 0,
        }),
      ).toEqual({ effective: 0, capped: true, cappedBy: "ZERO" });
    });

    it("clamps negative and non-finite inputs to zero", () => {
      expect(
        computeEffectiveHangCount({
          requested: -5,
          remainingInventory: 10,
          remainingTargets: 10,
        }),
      ).toEqual({ effective: 0, capped: true, cappedBy: "ZERO" });
      expect(
        computeEffectiveHangCount({
          requested: Number.NaN,
          remainingInventory: 10,
          remainingTargets: 10,
        }),
      ).toEqual({ effective: 0, capped: true, cappedBy: "ZERO" });
    });

    it("floors fractional requests", () => {
      const r = computeEffectiveHangCount({
        requested: 5.9,
        remainingInventory: 100,
        remainingTargets: 100,
      });
      expect(r.effective).toBe(5);
    });
  });

  describe("computeTimeAdvanceSeconds", () => {
    it("multiplies count by seconds per hanger", () => {
      expect(
        computeTimeAdvanceSeconds({
          effectiveCount: 25,
          secondsPerHanger: 30,
        }),
      ).toBe(750);
    });

    it("returns 0 for a zero-count action", () => {
      expect(
        computeTimeAdvanceSeconds({
          effectiveCount: 0,
          secondsPerHanger: 30,
        }),
      ).toBe(0);
    });

    it("falls back to default seconds when non-finite", () => {
      expect(
        computeTimeAdvanceSeconds({
          effectiveCount: 2,
          secondsPerHanger: Number.NaN,
        }),
      ).toBe(2 * DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER);
    });

    it("clamps seconds_per_hanger below 1 to 1", () => {
      expect(
        computeTimeAdvanceSeconds({
          effectiveCount: 4,
          secondsPerHanger: 0,
        }),
      ).toBe(4);
    });

    it("clamps negative counts to zero", () => {
      expect(
        computeTimeAdvanceSeconds({
          effectiveCount: -10,
          secondsPerHanger: 30,
        }),
      ).toBe(0);
    });
  });

  describe("formatDurationSeconds", () => {
    it("formats sub-minute durations as seconds", () => {
      expect(formatDurationSeconds(30)).toBe("30 sec");
      expect(formatDurationSeconds(1)).toBe("1 sec");
    });

    it("formats minutes + seconds", () => {
      expect(formatDurationSeconds(60)).toBe("1 min");
      expect(formatDurationSeconds(90)).toBe("1 min 30 sec");
      expect(formatDurationSeconds(750)).toBe("12 min 30 sec");
    });

    it("formats hours + minutes", () => {
      expect(formatDurationSeconds(3600)).toBe("1 hr");
      expect(formatDurationSeconds(3660)).toBe("1 hr 1 min");
    });

    it("returns 0 sec for non-positive / non-finite inputs", () => {
      expect(formatDurationSeconds(0)).toBe("0 sec");
      expect(formatDurationSeconds(-5)).toBe("0 sec");
      expect(formatDurationSeconds(Number.NaN)).toBe("0 sec");
    });
  });

  describe("isRouteComplete", () => {
    it("is true with route stops when remaining is zero", () => {
      expect(
        isRouteComplete({
          hasRouteStops: true,
          remainingStops: 0,
          hangersDistributedSoFar: 25,
          targetCount: null,
        }),
      ).toBe(true);
    });

    it("is false with route stops when stops remain", () => {
      expect(
        isRouteComplete({
          hasRouteStops: true,
          remainingStops: 3,
          hangersDistributedSoFar: 50,
          targetCount: null,
        }),
      ).toBe(false);
    });

    it("uses count fallback when no route stops exist", () => {
      expect(
        isRouteComplete({
          hasRouteStops: false,
          remainingStops: 0,
          hangersDistributedSoFar: 10,
          targetCount: 10,
        }),
      ).toBe(true);
      expect(
        isRouteComplete({
          hasRouteStops: false,
          remainingStops: 0,
          hangersDistributedSoFar: 9,
          targetCount: 10,
        }),
      ).toBe(false);
    });

    it("is never complete in count mode without a target", () => {
      expect(
        isRouteComplete({
          hasRouteStops: false,
          remainingStops: 0,
          hangersDistributedSoFar: 999,
          targetCount: null,
        }),
      ).toBe(false);
    });
  });

  describe("activity summary formatters", () => {
    it("hang_one is always singular", () => {
      expect(
        formatHangActivitySummary({ action: "hang_one", count: 1 }),
      ).toBe("Hung 1 door hanger");
      // The count is ignored for hang_one; we always say "1".
      expect(
        formatHangActivitySummary({ action: "hang_one", count: 5 }),
      ).toBe("Hung 1 door hanger");
    });

    it("hang_custom uses plural for n != 1", () => {
      expect(
        formatHangActivitySummary({ action: "hang_custom", count: 25 }),
      ).toBe("Hung 25 door hangers");
      expect(
        formatHangActivitySummary({ action: "hang_custom", count: 1 }),
      ).toBe("Hung 1 door hanger");
    });

    it("hang_route appends a completion suffix", () => {
      expect(
        formatHangActivitySummary({ action: "hang_route", count: 12 }),
      ).toBe("Hung 12 door hangers (route completion)");
    });

    it("session-started includes the route name when given", () => {
      expect(formatSessionStartedSummary("Boca Intercoastal")).toBe(
        "Started route Boca Intercoastal",
      );
    });

    it("session-started falls back when no route name is given", () => {
      expect(formatSessionStartedSummary(null)).toBe(
        "Started simulated route",
      );
      expect(formatSessionStartedSummary("   ")).toBe(
        "Started simulated route",
      );
    });

    it("route + session completion + early-end summaries are stable", () => {
      expect(formatRouteCompletedSummary("Boca Intercoastal")).toBe(
        "Route Boca Intercoastal completed",
      );
      expect(formatRouteCompletedSummary(null)).toBe("Route completed");
      expect(formatSessionCompletedSummary()).toBe("Session completed");
      expect(formatSessionEndedEarlySummary()).toBe("Session ended early");
    });
  });
});
