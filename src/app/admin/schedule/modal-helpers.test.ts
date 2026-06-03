import { describe, expect, it } from "vitest";

import {
  computeScheduleDefaults,
  extractDateFromIso,
  extractTimeFromIso,
  isJobReschedulableStatus,
  isJobSchedulableStatus,
  isJobUnschedulableStatus,
} from "./modal-helpers";

function localIso(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month1 - 1, day, hour, minute, 0, 0).toISOString();
}

describe("extractDateFromIso", () => {
  it("returns local YYYY-MM-DD", () => {
    expect(extractDateFromIso(localIso(2026, 6, 2, 9, 0))).toBe("2026-06-02");
  });

  it("returns empty on missing / invalid input", () => {
    expect(extractDateFromIso(null)).toBe("");
    expect(extractDateFromIso(undefined)).toBe("");
    expect(extractDateFromIso("")).toBe("");
    expect(extractDateFromIso("not-a-date")).toBe("");
  });
});

describe("extractTimeFromIso", () => {
  it("returns local HH:MM with zero-padding", () => {
    expect(extractTimeFromIso(localIso(2026, 6, 2, 9, 5))).toBe("09:05");
    expect(extractTimeFromIso(localIso(2026, 6, 2, 14, 30))).toBe("14:30");
  });

  it("returns empty on missing / invalid input", () => {
    expect(extractTimeFromIso(null)).toBe("");
    expect(extractTimeFromIso("not-a-date")).toBe("");
  });
});

describe("computeScheduleDefaults", () => {
  it("uses fallback when no existing scheduling", () => {
    const d = computeScheduleDefaults({ fallbackDate: "2026-06-15" });
    expect(d).toEqual({
      date: "2026-06-15",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: "",
    });
  });

  it("pre-fills from existing scheduling (reschedule mode)", () => {
    const d = computeScheduleDefaults({
      existingStartIso: localIso(2026, 6, 2, 11, 30),
      existingEndIso: localIso(2026, 6, 2, 12, 30),
      existingArrivalWindowLabel: "Side gate",
      fallbackDate: "2026-06-15",
    });
    expect(d).toEqual({
      date: "2026-06-02",
      startTime: "11:30",
      endTime: "12:30",
      arrivalWindowLabel: "Side gate",
    });
  });

  it("falls back to default end time when existing end is missing", () => {
    const d = computeScheduleDefaults({
      existingStartIso: localIso(2026, 6, 2, 11, 30),
      existingEndIso: null,
      fallbackDate: "2026-06-15",
    });
    expect(d.startTime).toBe("11:30");
    expect(d.endTime).toBe("10:00"); // default fallback
  });
});

describe("status eligibility", () => {
  it("isJobSchedulableStatus is true only for draft / unscheduled", () => {
    expect(isJobSchedulableStatus("draft")).toBe(true);
    expect(isJobSchedulableStatus("unscheduled")).toBe(true);
    expect(isJobSchedulableStatus("scheduled")).toBe(false);
    expect(isJobSchedulableStatus("in_progress")).toBe(false);
    expect(isJobSchedulableStatus("completed")).toBe(false);
    expect(isJobSchedulableStatus("canceled")).toBe(false);
  });

  it("isJobReschedulableStatus + isJobUnschedulableStatus are true only for scheduled", () => {
    expect(isJobReschedulableStatus("scheduled")).toBe(true);
    expect(isJobUnschedulableStatus("scheduled")).toBe(true);
    for (const s of [
      "draft",
      "unscheduled",
      "in_progress",
      "completed",
      "canceled",
    ]) {
      expect(isJobReschedulableStatus(s)).toBe(false);
      expect(isJobUnschedulableStatus(s)).toBe(false);
    }
  });
});
