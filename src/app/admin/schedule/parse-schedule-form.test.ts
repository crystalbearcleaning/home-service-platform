import { describe, expect, it } from "vitest";

import { parseScheduleFormFields } from "./parse-schedule-form";

describe("parseScheduleFormFields", () => {
  it("parses a valid date + start + end into local-time ISO", () => {
    const r = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = new Date(r.startIso);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(5);
    expect(s.getDate()).toBe(2);
    expect(s.getHours()).toBe(9);
    expect(s.getMinutes()).toBe(0);
    const e = new Date(r.endIso);
    expect(e.getHours()).toBe(10);
    expect(r.arrivalWindowLabel).toBeNull();
  });

  it("defaults end to start + 60 minutes when end is missing", () => {
    const r = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "",
      arrivalWindowLabel: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Date(r.endIso).getHours()).toBe(10);
  });

  it("requires date + start", () => {
    const r = parseScheduleFormFields({
      date: "",
      startTime: "",
      endTime: "",
      arrivalWindowLabel: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.date).toBeDefined();
    expect(r.fieldErrors.startTime).toBeDefined();
  });

  it("rejects end before start", () => {
    const r = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "10:00",
      endTime: "09:00",
      arrivalWindowLabel: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.endTime).toBeDefined();
  });

  it("rejects an invalid time", () => {
    const r = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "25:99",
      endTime: "10:00",
      arrivalWindowLabel: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.startTime).toBeDefined();
  });

  it("rejects an overflow date", () => {
    const r = parseScheduleFormFields({
      date: "2026-02-31",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: null,
    });
    expect(r.ok).toBe(false);
  });

  it("trims arrival window label and treats empty as null", () => {
    const ok = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: "  8–10 AM  ",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.arrivalWindowLabel).toBe("8–10 AM");

    const blank = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: "   ",
    });
    expect(blank.ok).toBe(true);
    if (!blank.ok) return;
    expect(blank.arrivalWindowLabel).toBeNull();
  });

  it("clamps a too-long arrival window label", () => {
    const long = "x".repeat(200);
    const r = parseScheduleFormFields({
      date: "2026-06-02",
      startTime: "09:00",
      endTime: "10:00",
      arrivalWindowLabel: long,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.arrivalWindowLabel?.length).toBe(120);
  });
});
