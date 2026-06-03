import { describe, expect, it } from "vitest";

import type { JobRow } from "@/core/jobs/admin-data";

import { classifyScheduledJobs } from "./schedule-views";

// Helper — builds a local-time ISO so the tests don't depend on
// the JS runtime's UTC offset.
function localIso(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month1 - 1, day, hour, minute, 0, 0).toISOString();
}

function makeRow(overrides: Partial<JobRow>): JobRow {
  return {
    id: overrides.id ?? "job-x",
    businessId: "b1",
    contactId: "c1",
    contactFullName: null,
    propertyId: null,
    propertyAddressLine: null,
    quoteId: null,
    title: "Job",
    summary: null,
    status: "scheduled",
    source: "manual",
    scheduledStartAt: null,
    scheduledEndAt: null,
    arrivalWindowLabel: null,
    estimatedTotalCents: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("classifyScheduledJobs", () => {
  it("routes a Tue 9-10 AM job into the visible band", () => {
    const jobs = [
      makeRow({
        id: "v",
        // Tuesday 2026-06-02
        scheduledStartAt: localIso(2026, 6, 2, 9, 0),
        scheduledEndAt: localIso(2026, 6, 2, 10, 0),
      }),
    ];
    const r = classifyScheduledJobs(jobs);
    expect(r.visibleJobs.map((j) => j.id)).toEqual(["v"]);
    expect(r.outsideHoursJobs).toEqual([]);
    expect(r.weekendJobs).toEqual([]);
  });

  it("routes a Tue 7 AM job into the outside-hours bucket", () => {
    const jobs = [
      makeRow({
        id: "early",
        scheduledStartAt: localIso(2026, 6, 2, 7, 0),
        scheduledEndAt: localIso(2026, 6, 2, 7, 30),
      }),
    ];
    const r = classifyScheduledJobs(jobs);
    expect(r.outsideHoursJobs.map((j) => j.id)).toEqual(["early"]);
    expect(r.visibleJobs).toEqual([]);
    expect(r.weekendJobs).toEqual([]);
  });

  it("routes a Sat AM job into the weekend bucket regardless of hour", () => {
    const jobs = [
      makeRow({
        id: "sat",
        // Saturday 2026-06-06
        scheduledStartAt: localIso(2026, 6, 6, 9, 0),
        scheduledEndAt: localIso(2026, 6, 6, 10, 0),
      }),
      makeRow({
        id: "sun",
        // Sunday 2026-06-07
        scheduledStartAt: localIso(2026, 6, 7, 14, 0),
        scheduledEndAt: localIso(2026, 6, 7, 15, 0),
      }),
    ];
    const r = classifyScheduledJobs(jobs);
    expect(r.weekendJobs.map((j) => j.id).sort()).toEqual(["sat", "sun"]);
    expect(r.visibleJobs).toEqual([]);
    expect(r.outsideHoursJobs).toEqual([]);
  });

  it("skips jobs with no start", () => {
    const jobs = [
      makeRow({ id: "nullish", scheduledStartAt: null }),
      makeRow({ id: "garbage", scheduledStartAt: "not-a-date" }),
    ];
    const r = classifyScheduledJobs(jobs);
    expect(r.visibleJobs).toEqual([]);
    expect(r.outsideHoursJobs).toEqual([]);
    expect(r.weekendJobs).toEqual([]);
  });
});
