import { describe, expect, it } from "vitest";

import {
  calculateCalendarPosition,
  combineDateAndTimeToISO,
  defaultEndForStart,
  detectScheduleOverlaps,
  enumerateWeekDays,
  formatWeekKey,
  getWeekRange,
  groupJobsByDay,
  parseWeekKey,
  SCHEDULE_DEFAULT_DURATION_MINUTES,
} from "./scheduling";

// Helper — builds a local-time ISO so the tests don't depend on the
// JS runtime's UTC offset. `month1` is the 1-based month.
function localIso(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month1 - 1, day, hour, minute, 0, 0).toISOString();
}

describe("getWeekRange", () => {
  it("returns Monday-start week range when reference is Wednesday", () => {
    // Wednesday, 2026-06-03
    const ref = new Date(2026, 5, 3, 14, 30);
    const r = getWeekRange(ref);
    expect(r.start.getFullYear()).toBe(2026);
    expect(r.start.getMonth()).toBe(5);
    expect(r.start.getDate()).toBe(1); // Monday 2026-06-01
    expect(r.start.getHours()).toBe(0);
    expect(r.start.getMinutes()).toBe(0);
    expect(r.end.getDate()).toBe(8); // Monday 2026-06-08
    expect(r.weekKey).toBe("2026-06-01");
  });

  it("rolls Sunday reference back to the previous Monday", () => {
    // Sunday, 2026-06-07
    const ref = new Date(2026, 5, 7, 12, 0);
    const r = getWeekRange(ref);
    expect(r.start.getDate()).toBe(1);
    expect(r.weekKey).toBe("2026-06-01");
  });

  it("treats a Monday reference as its own week start", () => {
    const ref = new Date(2026, 5, 1, 9, 0);
    const r = getWeekRange(ref);
    expect(r.weekKey).toBe("2026-06-01");
    expect(r.start.getTime()).toBe(
      new Date(2026, 5, 1, 0, 0, 0, 0).getTime(),
    );
  });

  it("treats a Saturday reference as the same week's Monday", () => {
    // Saturday, 2026-06-06
    const ref = new Date(2026, 5, 6, 8, 0);
    const r = getWeekRange(ref);
    expect(r.weekKey).toBe("2026-06-01");
  });

  it("accepts an ISO string reference", () => {
    const r = getWeekRange("2026-06-03T14:30:00");
    expect(r.weekKey).toBe("2026-06-01");
  });

  it("falls back to the current week when reference is omitted", () => {
    const r = getWeekRange(undefined);
    expect(r.start.getDay()).toBe(1); // Monday
    expect(r.end.getTime() - r.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("formatWeekKey / parseWeekKey", () => {
  it("round-trips Monday 2026-06-01", () => {
    const monday = new Date(2026, 5, 1, 0, 0, 0, 0);
    expect(formatWeekKey(monday)).toBe("2026-06-01");
    const parsed = parseWeekKey("2026-06-01");
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(5);
    expect(parsed!.getDate()).toBe(1);
    expect(parsed!.getHours()).toBe(0);
  });

  it("rejects malformed keys", () => {
    expect(parseWeekKey("")).toBeNull();
    expect(parseWeekKey(null)).toBeNull();
    expect(parseWeekKey(undefined)).toBeNull();
    expect(parseWeekKey("2026-13-01")).toBeNull();
    expect(parseWeekKey("2026-02-31")).toBeNull(); // overflow
    expect(parseWeekKey("not-a-date")).toBeNull();
    expect(parseWeekKey("2026/06/01")).toBeNull();
  });
});

describe("enumerateWeekDays", () => {
  it("returns 7 sequential local-midnight dates from Monday", () => {
    const monday = new Date(2026, 5, 1, 0, 0, 0, 0);
    const days = enumerateWeekDays(monday);
    expect(days).toHaveLength(7);
    expect(days[0]!.getDate()).toBe(1);
    expect(days[0]!.getDay()).toBe(1); // Monday
    expect(days[6]!.getDate()).toBe(7);
    expect(days[6]!.getDay()).toBe(0); // Sunday
  });
});

describe("groupJobsByDay", () => {
  const week = getWeekRange(new Date(2026, 5, 3));

  it("buckets weekday + weekend jobs by their local-time start", () => {
    const jobs = [
      { id: "a", scheduledStartAt: localIso(2026, 6, 2, 9, 0) }, // Tue
      { id: "b", scheduledStartAt: localIso(2026, 6, 2, 14, 0) }, // Tue
      { id: "c", scheduledStartAt: localIso(2026, 6, 6, 10, 0) }, // Sat
      { id: "d", scheduledStartAt: localIso(2026, 6, 7, 10, 0) }, // Sun
    ];
    const map = groupJobsByDay(jobs, week);
    expect(map.get("2026-06-02")!.map((j) => j.id)).toEqual(["a", "b"]);
    expect(map.get("2026-06-06")!.map((j) => j.id)).toEqual(["c"]);
    expect(map.get("2026-06-07")!.map((j) => j.id)).toEqual(["d"]);
    expect(map.size).toBe(3);
  });

  it("excludes jobs outside the week + jobs without a start", () => {
    const jobs = [
      { id: "before", scheduledStartAt: localIso(2026, 5, 31, 9, 0) },
      { id: "after", scheduledStartAt: localIso(2026, 6, 8, 9, 0) },
      { id: "nullish", scheduledStartAt: null },
      { id: "invalid", scheduledStartAt: "not-a-date" },
    ];
    const map = groupJobsByDay(jobs, week);
    expect(map.size).toBe(0);
  });

  it("treats the upper bound as exclusive (Monday 00:00 → next week)", () => {
    const jobs = [
      // Exactly at week start Monday 00:00 — included.
      { id: "lower", scheduledStartAt: week.start.toISOString() },
      // Exactly at week end Monday 00:00 — excluded.
      { id: "upper", scheduledStartAt: week.end.toISOString() },
    ];
    const map = groupJobsByDay(jobs, week);
    expect(map.size).toBe(1);
    expect(map.get("2026-06-01")!.map((j) => j.id)).toEqual(["lower"]);
  });
});

describe("calculateCalendarPosition", () => {
  it("places a 9–10 AM job inside the visible 8–6 band", () => {
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 9, 0),
      scheduledEndAt: localIso(2026, 6, 2, 10, 0),
    };
    const pos = calculateCalendarPosition(job);
    expect(pos).not.toBeNull();
    expect(pos!.dayKey).toBe("2026-06-02");
    // (9 - 8) / 10 = 0.10 → 10%
    expect(pos!.topPct).toBeCloseTo(10, 5);
    // (10 - 9) / 10 = 0.10 → 10%
    expect(pos!.heightPct).toBeCloseTo(10, 5);
    expect(pos!.isOutsideVisibleHours).toBe(false);
    expect(pos!.startsBeforeVisible).toBe(false);
    expect(pos!.endsAfterVisible).toBe(false);
  });

  it("uses the 60-minute default when scheduled_end_at is missing", () => {
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 9, 0),
      scheduledEndAt: null,
    };
    const pos = calculateCalendarPosition(job);
    expect(pos!.heightPct).toBeCloseTo(10, 5);
  });

  it("flags + clamps a job that ends before the visible band", () => {
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 7, 0),
      scheduledEndAt: localIso(2026, 6, 2, 7, 30),
    };
    const pos = calculateCalendarPosition(job);
    expect(pos!.isOutsideVisibleHours).toBe(true);
    expect(pos!.startsBeforeVisible).toBe(true);
    expect(pos!.topPct).toBe(0);
    expect(pos!.heightPct).toBe(0);
  });

  it("flags + clamps a job that starts after the visible band", () => {
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 20, 0),
      scheduledEndAt: localIso(2026, 6, 2, 21, 0),
    };
    const pos = calculateCalendarPosition(job);
    expect(pos!.isOutsideVisibleHours).toBe(true);
    expect(pos!.endsAfterVisible).toBe(true);
    expect(pos!.topPct).toBe(100);
    expect(pos!.heightPct).toBe(0);
  });

  it("clamps a partial overlap and reports startsBeforeVisible", () => {
    // 7 AM → 9 AM straddles the 8 AM boundary.
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 7, 0),
      scheduledEndAt: localIso(2026, 6, 2, 9, 0),
    };
    const pos = calculateCalendarPosition(job);
    expect(pos!.startsBeforeVisible).toBe(true);
    expect(pos!.isOutsideVisibleHours).toBe(true);
    expect(pos!.topPct).toBe(0);
    // visible portion: 8 → 9 = 1 hour of 10
    expect(pos!.heightPct).toBeCloseTo(10, 5);
  });

  it("returns null when start is missing or invalid", () => {
    expect(calculateCalendarPosition({ scheduledStartAt: null })).toBeNull();
    expect(
      calculateCalendarPosition({ scheduledStartAt: "not-a-date" }),
    ).toBeNull();
  });

  it("returns null for nonsensical grid settings", () => {
    const job = {
      scheduledStartAt: localIso(2026, 6, 2, 9, 0),
      scheduledEndAt: localIso(2026, 6, 2, 10, 0),
    };
    expect(
      calculateCalendarPosition(job, {
        visibleStartHour: 10,
        visibleEndHour: 8,
      }),
    ).toBeNull();
  });
});

describe("detectScheduleOverlaps", () => {
  const proposed = {
    scheduledStartAt: localIso(2026, 6, 2, 9, 0),
    scheduledEndAt: localIso(2026, 6, 2, 11, 0),
  };

  it("detects an overlapping start (other starts inside proposed)", () => {
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 10, 0),
        scheduledEndAt: localIso(2026, 6, 2, 12, 0),
        status: "scheduled",
      },
    ];
    const conflicts = detectScheduleOverlaps(proposed, existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.job.id).toBe("x");
    expect(conflicts[0]!.start).toBe(existing[0]!.scheduledStartAt);
    expect(conflicts[0]!.end).toBe(existing[0]!.scheduledEndAt);
  });

  it("detects an overlapping end (other ends inside proposed)", () => {
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 8, 0),
        scheduledEndAt: localIso(2026, 6, 2, 10, 0),
        status: "scheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(1);
  });

  it("detects a contained overlap (other entirely inside proposed)", () => {
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "scheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(1);
  });

  it("does not flag exact-edge no-conflict (other end == proposed start)", () => {
    const existing = [
      {
        id: "before",
        scheduledStartAt: localIso(2026, 6, 2, 7, 0),
        scheduledEndAt: localIso(2026, 6, 2, 9, 0),
        status: "scheduled",
      },
      {
        id: "after",
        scheduledStartAt: localIso(2026, 6, 2, 11, 0),
        scheduledEndAt: localIso(2026, 6, 2, 13, 0),
        status: "scheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(0);
  });

  it("excludes the current job via excludeJobId", () => {
    const existing = [
      {
        id: "self",
        scheduledStartAt: localIso(2026, 6, 2, 9, 0),
        scheduledEndAt: localIso(2026, 6, 2, 11, 0),
        status: "scheduled",
      },
    ];
    expect(
      detectScheduleOverlaps(proposed, existing, { excludeJobId: "self" }),
    ).toHaveLength(0);
  });

  it("ignores completed / canceled / draft / unscheduled candidates", () => {
    const candidates = [
      {
        id: "completed",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "completed",
      },
      {
        id: "canceled",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "canceled",
      },
      {
        id: "draft",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "draft",
      },
      {
        id: "unscheduled",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "unscheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposed, candidates)).toHaveLength(0);
  });

  it("includes in_progress as a conflict candidate", () => {
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "in_progress",
      },
    ];
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(1);
  });

  it("treats a missing existing end as default 60 minutes", () => {
    // 9:30 start, no end → effective end is 10:30 → overlaps 9–11.
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: null,
        status: "scheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(1);
  });

  it("treats a missing proposed end as default 60 minutes", () => {
    const proposedNoEnd = {
      scheduledStartAt: localIso(2026, 6, 2, 9, 0),
      scheduledEndAt: null,
    };
    const existing = [
      {
        id: "x",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 11, 0),
        status: "scheduled",
      },
    ];
    expect(detectScheduleOverlaps(proposedNoEnd, existing)).toHaveLength(1);
  });

  it("returns empty when the proposed start is missing or invalid", () => {
    expect(
      detectScheduleOverlaps(
        { scheduledStartAt: null, scheduledEndAt: null },
        [],
      ),
    ).toEqual([]);
    expect(
      detectScheduleOverlaps(
        { scheduledStartAt: "not-a-date", scheduledEndAt: null },
        [],
      ),
    ).toEqual([]);
  });

  it("skips candidates without a usable start", () => {
    const existing = [
      {
        id: "null",
        scheduledStartAt: null,
        scheduledEndAt: null,
        status: "scheduled",
      },
      {
        id: "missing-id",
        scheduledStartAt: localIso(2026, 6, 2, 9, 30),
        scheduledEndAt: localIso(2026, 6, 2, 10, 30),
        status: "scheduled",
      } as { id: string; scheduledStartAt: string; scheduledEndAt: string; status: string },
    ];
    // Both above happen to be real shapes — the second hit counts.
    expect(detectScheduleOverlaps(proposed, existing)).toHaveLength(1);
  });
});

describe("combineDateAndTimeToISO", () => {
  it("combines date + time into a local-time ISO", () => {
    const iso = combineDateAndTimeToISO("2026-06-02", "09:00");
    expect(iso).not.toBeNull();
    const d = new Date(iso!);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(2);
  });

  it("returns null on missing / malformed inputs", () => {
    expect(combineDateAndTimeToISO("", "09:00")).toBeNull();
    expect(combineDateAndTimeToISO("2026-06-02", "")).toBeNull();
    expect(combineDateAndTimeToISO(null, "09:00")).toBeNull();
    expect(combineDateAndTimeToISO("2026-06-02", null)).toBeNull();
    expect(combineDateAndTimeToISO("not-a-date", "09:00")).toBeNull();
    expect(combineDateAndTimeToISO("2026-06-02", "25:00")).toBeNull();
    expect(combineDateAndTimeToISO("2026-06-02", "09:99")).toBeNull();
    expect(combineDateAndTimeToISO("2026-02-31", "09:00")).toBeNull();
  });
});

describe("defaultEndForStart", () => {
  it("returns start + 60 minutes by default", () => {
    const start = localIso(2026, 6, 2, 9, 0);
    const end = defaultEndForStart(start);
    expect(end).not.toBeNull();
    const d = new Date(end!);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });

  it("honors custom durations", () => {
    const start = localIso(2026, 6, 2, 9, 0);
    const end = defaultEndForStart(start, 30);
    expect(new Date(end!).getMinutes()).toBe(30);
    expect(new Date(end!).getHours()).toBe(9);
  });

  it("falls back to default duration for invalid durations", () => {
    const start = localIso(2026, 6, 2, 9, 0);
    expect(defaultEndForStart(start, -1)).toBe(localIso(2026, 6, 2, 10, 0));
    expect(defaultEndForStart(start, Number.NaN)).toBe(
      localIso(2026, 6, 2, 10, 0),
    );
  });

  it("returns null when start is missing or invalid", () => {
    expect(defaultEndForStart(null)).toBeNull();
    expect(defaultEndForStart("")).toBeNull();
    expect(defaultEndForStart("not-a-date")).toBeNull();
  });
});

describe("SCHEDULE_DEFAULT_DURATION_MINUTES", () => {
  it("is 60 — pinned per Phase 10 doc §§4/11", () => {
    expect(SCHEDULE_DEFAULT_DURATION_MINUTES).toBe(60);
  });
});
