import { describe, expect, it } from "vitest";

import {
  formatCentsAsDollars,
  formatJobQuantity,
  formatSchedulingRange,
  formatSchedulingTimestamp,
  jobLineItemSourceLabel,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "./display";

describe("jobStatusLabel + jobStatusTone", () => {
  it("labels every status", () => {
    expect(jobStatusLabel("draft")).toBe("Draft");
    expect(jobStatusLabel("unscheduled")).toBe("Unscheduled");
    expect(jobStatusLabel("scheduled")).toBe("Scheduled");
    expect(jobStatusLabel("in_progress")).toBe("In progress");
    expect(jobStatusLabel("completed")).toBe("Completed");
    expect(jobStatusLabel("canceled")).toBe("Canceled");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(jobStatusLabel("weird")).toBe("weird");
  });

  it("maps statuses to badge tones", () => {
    expect(jobStatusTone("draft")).toBe("neutral");
    expect(jobStatusTone("unscheduled")).toBe("info");
    expect(jobStatusTone("scheduled")).toBe("info");
    expect(jobStatusTone("in_progress")).toBe("warning");
    expect(jobStatusTone("completed")).toBe("success");
    expect(jobStatusTone("canceled")).toBe("danger");
    expect(jobStatusTone("weird")).toBe("neutral");
  });
});

describe("jobSourceLabel + jobLineItemSourceLabel", () => {
  it("labels job sources", () => {
    expect(jobSourceLabel("manual")).toBe("Manual");
    expect(jobSourceLabel("quote")).toBe("From quote");
    expect(jobSourceLabel("weird")).toBe("weird");
  });

  it("labels line item sources", () => {
    expect(jobLineItemSourceLabel("quote")).toBe("From quote");
    expect(jobLineItemSourceLabel("service")).toBe("Catalog");
    expect(jobLineItemSourceLabel("custom")).toBe("Custom");
    expect(jobLineItemSourceLabel("weird")).toBe("weird");
  });
});

describe("formatCentsAsDollars", () => {
  it("formats with comma thousands and two decimals", () => {
    expect(formatCentsAsDollars(24900)).toBe("$249.00");
    expect(formatCentsAsDollars(123456789)).toBe("$1,234,567.89");
    expect(formatCentsAsDollars(0)).toBe("$0.00");
  });

  it("falls back to '—' for null / non-finite", () => {
    expect(formatCentsAsDollars(null)).toBe("—");
    expect(formatCentsAsDollars(undefined)).toBe("—");
    expect(formatCentsAsDollars(Number.NaN)).toBe("—");
    expect(formatCentsAsDollars(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("truncates fractional cents (defensive)", () => {
    expect(formatCentsAsDollars(199.7)).toBe("$1.99");
  });
});

describe("formatJobQuantity", () => {
  it("renders whole numbers as integers", () => {
    expect(formatJobQuantity(1)).toBe("1");
    expect(formatJobQuantity(25)).toBe("25");
  });

  it("trims trailing zeroes on fractional quantities", () => {
    expect(formatJobQuantity(1.5)).toBe("1.5");
    expect(formatJobQuantity(0.33)).toBe("0.33");
    expect(formatJobQuantity(1.1)).toBe("1.1");
  });

  it("falls back for null / non-finite", () => {
    expect(formatJobQuantity(null)).toBe("—");
    expect(formatJobQuantity(undefined)).toBe("—");
    expect(formatJobQuantity(Number.NaN)).toBe("—");
  });
});

describe("formatSchedulingTimestamp + formatSchedulingRange", () => {
  it("formats a valid ISO timestamp", () => {
    const out = formatSchedulingTimestamp("2026-06-02T15:00:00Z");
    expect(out).not.toBe("—");
    expect(out.length).toBeGreaterThan(0);
  });

  it("falls back to '—' for missing / invalid", () => {
    expect(formatSchedulingTimestamp(null)).toBe("—");
    expect(formatSchedulingTimestamp(undefined)).toBe("—");
    expect(formatSchedulingTimestamp("not-a-date")).toBe("—");
  });

  it("renders 'Not scheduled' for both-null range", () => {
    expect(
      formatSchedulingRange({ startAt: null, endAt: null }),
    ).toBe("Not scheduled");
  });

  it("renders a 'start → end' range when both present", () => {
    const out = formatSchedulingRange({
      startAt: "2026-06-02T15:00:00Z",
      endAt: "2026-06-02T17:00:00Z",
    });
    expect(out).toContain("→");
  });

  it("renders just the start when end is missing", () => {
    const out = formatSchedulingRange({
      startAt: "2026-06-02T15:00:00Z",
      endAt: null,
    });
    expect(out).not.toContain("→");
    expect(out).not.toBe("Not scheduled");
  });

  it("appends the arrival window label when present", () => {
    const out = formatSchedulingRange({
      startAt: "2026-06-02T15:00:00Z",
      endAt: null,
      arrivalWindowLabel: "8–10 AM",
    });
    expect(out).toContain("8–10 AM");
    expect(out).toContain(" · ");
  });
});
