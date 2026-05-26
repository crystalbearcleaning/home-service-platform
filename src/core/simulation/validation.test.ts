import { describe, expect, it } from "vitest";
import {
  formatCentsAsDollars,
  isSimulationRunStatus,
  parseCashDollarsToCents,
  parseSimulatedStart,
  SIMULATION_RUN_NAME_MAX_LENGTH,
  SIMULATION_RUN_STATUSES,
  statusesAfterMarkingActive,
  validateSimulationRunForm,
} from "./validation";

describe("parseCashDollarsToCents", () => {
  it("converts whole dollars to cents", () => {
    expect(parseCashDollarsToCents("1000")).toEqual({ ok: true, cents: 100000 });
  });

  it("handles fractional dollars without floating-point drift", () => {
    expect(parseCashDollarsToCents("19.99")).toEqual({ ok: true, cents: 1999 });
  });

  it("strips $ and commas", () => {
    expect(parseCashDollarsToCents("$1,234.56")).toEqual({
      ok: true,
      cents: 123456,
    });
  });

  it("accepts numeric input", () => {
    expect(parseCashDollarsToCents(250)).toEqual({ ok: true, cents: 25000 });
  });

  it("rejects empty input", () => {
    expect(parseCashDollarsToCents("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseCashDollarsToCents("   ")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseCashDollarsToCents(null)).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseCashDollarsToCents(undefined)).toEqual({
      ok: false,
      reason: "EMPTY",
    });
  });

  it("rejects negatives", () => {
    expect(parseCashDollarsToCents("-5")).toEqual({ ok: false, reason: "NEGATIVE" });
  });

  it("rejects non-numbers", () => {
    expect(parseCashDollarsToCents("abc")).toEqual({
      ok: false,
      reason: "NOT_A_NUMBER",
    });
  });
});

describe("parseSimulatedStart", () => {
  it("accepts ISO strings", () => {
    const r = parseSimulatedStart("2026-05-26T10:30:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-05-26T10:30:00.000Z");
  });

  it("accepts datetime-local format and returns ISO", () => {
    const r = parseSimulatedStart("2026-05-26T10:30");
    expect(r.ok).toBe(true);
    if (r.ok) expect(new Date(r.iso).getTime()).not.toBeNaN();
  });

  it("rejects empty", () => {
    expect(parseSimulatedStart("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseSimulatedStart(null)).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects garbage strings", () => {
    expect(parseSimulatedStart("not-a-date")).toEqual({
      ok: false,
      reason: "INVALID",
    });
  });
});

describe("isSimulationRunStatus", () => {
  it("accepts the four valid statuses", () => {
    for (const s of SIMULATION_RUN_STATUSES) {
      expect(isSimulationRunStatus(s)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isSimulationRunStatus("running")).toBe(false);
    expect(isSimulationRunStatus(null)).toBe(false);
    expect(isSimulationRunStatus(42)).toBe(false);
  });
});

describe("validateSimulationRunForm", () => {
  it("returns clean data when all fields are valid", () => {
    const r = validateSimulationRunForm({
      name: "  Starter save  ",
      startingCashDollars: "1000",
      simulatedStartAt: "2026-05-26T10:00",
      notes: "  hello  ",
      status: "draft",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Starter save");
      expect(r.data.startingCashCents).toBe(100000);
      expect(r.data.notes).toBe("hello");
      expect(r.data.status).toBe("draft");
      expect(typeof r.data.simulatedStartAt).toBe("string");
    }
  });

  it("flags an empty name", () => {
    const r = validateSimulationRunForm({
      name: "   ",
      startingCashDollars: "1000",
      simulatedStartAt: "2026-05-26T10:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.find((e) => e.field === "name")).toBeTruthy();
    }
  });

  it("flags an over-long name", () => {
    const r = validateSimulationRunForm({
      name: "x".repeat(SIMULATION_RUN_NAME_MAX_LENGTH + 1),
      startingCashDollars: "1000",
      simulatedStartAt: "2026-05-26T10:00",
    });
    expect(r.ok).toBe(false);
  });

  it("flags missing cash", () => {
    const r = validateSimulationRunForm({
      name: "Starter",
      startingCashDollars: "",
      simulatedStartAt: "2026-05-26T10:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.find((e) => e.field === "startingCashDollars"),
      ).toBeTruthy();
    }
  });

  it("flags negative cash", () => {
    const r = validateSimulationRunForm({
      name: "Starter",
      startingCashDollars: "-1",
      simulatedStartAt: "2026-05-26T10:00",
    });
    expect(r.ok).toBe(false);
  });

  it("flags invalid simulated start", () => {
    const r = validateSimulationRunForm({
      name: "Starter",
      startingCashDollars: "1000",
      simulatedStartAt: "not-a-date",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.find((e) => e.field === "simulatedStartAt")).toBeTruthy();
    }
  });

  it("falls back to draft for unknown status values", () => {
    const r = validateSimulationRunForm({
      name: "Starter",
      startingCashDollars: "1000",
      simulatedStartAt: "2026-05-26T10:00",
      status: "running",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("draft");
  });
});

describe("statusesAfterMarkingActive", () => {
  it("marks the target active and demotes prior active to paused", () => {
    const updates = statusesAfterMarkingActive({
      runs: [
        { id: "a", status: "active" },
        { id: "b", status: "draft" },
        { id: "c", status: "paused" },
      ],
      targetId: "b",
    });
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "a", nextStatus: "paused" },
        { id: "b", nextStatus: "active" },
      ]),
    );
    expect(updates.find((u) => u.id === "c")).toBeUndefined();
  });

  it("no-ops when target is already active", () => {
    const updates = statusesAfterMarkingActive({
      runs: [
        { id: "a", status: "active" },
        { id: "b", status: "draft" },
      ],
      targetId: "a",
    });
    expect(updates).toEqual([]);
  });

  it("never touches archived saves", () => {
    const updates = statusesAfterMarkingActive({
      runs: [
        { id: "a", status: "archived" },
        { id: "b", status: "draft" },
      ],
      targetId: "b",
    });
    expect(updates).toEqual([{ id: "b", nextStatus: "active" }]);
  });
});

describe("formatCentsAsDollars", () => {
  it("formats positive cents with two decimals", () => {
    expect(formatCentsAsDollars(100000)).toBe("$1000.00");
    expect(formatCentsAsDollars(1999)).toBe("$19.99");
    expect(formatCentsAsDollars(0)).toBe("$0.00");
  });

  it("emits a dash for missing values", () => {
    expect(formatCentsAsDollars(null)).toBe("—");
    expect(formatCentsAsDollars(undefined)).toBe("—");
  });
});
