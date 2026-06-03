import { describe, expect, it } from "vitest";

import {
  JOB_LINE_ITEM_SOURCES,
  JOB_SOURCES,
  JOB_STATUSES,
  isJobLineItemSource,
  isJobSource,
  isJobStatus,
} from "./constants";
import {
  validateJobForm,
  validateJobLineItemForm,
  validateSchedulingFields,
} from "./validation";

describe("enums + type guards", () => {
  it("pins the documented status taxonomy", () => {
    expect(JOB_STATUSES).toEqual([
      "draft",
      "unscheduled",
      "scheduled",
      "in_progress",
      "completed",
      "canceled",
    ]);
  });

  it("pins the documented source enums", () => {
    expect(JOB_SOURCES).toEqual(["manual", "quote"]);
    expect(JOB_LINE_ITEM_SOURCES).toEqual(["quote", "service", "custom"]);
  });

  it("type-guards round-trip", () => {
    expect(isJobStatus("draft")).toBe(true);
    expect(isJobStatus("nope")).toBe(false);
    expect(isJobSource("manual")).toBe(true);
    expect(isJobSource("nope")).toBe(false);
    expect(isJobLineItemSource("quote")).toBe(true);
    expect(isJobLineItemSource("nope")).toBe(false);
  });
});

describe("validateJobForm", () => {
  const valid = {
    contactId: "11111111-1111-1111-1111-111111111111",
    title: "Window cleaning for Smith residence",
  };

  it("accepts the minimum valid form", () => {
    const r = validateJobForm(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.contactId).toBe(valid.contactId);
    expect(r.data.title).toBe(valid.title);
    expect(r.data.status).toBe("draft");
    expect(r.data.source).toBe("manual");
    expect(r.data.propertyId).toBeNull();
    expect(r.data.quoteId).toBeNull();
  });

  it("requires contactId", () => {
    const r = validateJobForm({ ...valid, contactId: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("contactId");
  });

  it("requires title", () => {
    const r = validateJobForm({ ...valid, title: "   " });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("title");
  });

  it("rejects unknown status", () => {
    const r = validateJobForm({ ...valid, status: "totally_made_up" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("status");
  });

  it("honours explicit valid status + source overrides", () => {
    const r = validateJobForm({
      ...valid,
      status: "unscheduled",
      source: "quote",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.status).toBe("unscheduled");
    expect(r.data.source).toBe("quote");
  });

  it("applies status / source defaults from the caller", () => {
    const r = validateJobForm(valid, {
      status: "unscheduled",
      source: "quote",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.status).toBe("unscheduled");
    expect(r.data.source).toBe("quote");
  });

  it("flags scheduled_end_at < scheduled_start_at", () => {
    const r = validateJobForm({
      ...valid,
      scheduledStartAt: "2026-06-02T10:00",
      scheduledEndAt: "2026-06-02T09:00",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("scheduledEndAt");
  });
});

describe("validateSchedulingFields", () => {
  it("accepts both null timestamps", () => {
    const r = validateSchedulingFields({});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.scheduledStartAt).toBeNull();
    expect(r.data.scheduledEndAt).toBeNull();
  });

  it("normalises datetime-local input to ISO", () => {
    const r = validateSchedulingFields({
      scheduledStartAt: "2026-06-02T10:00",
      scheduledEndAt: "2026-06-02T12:00",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.scheduledStartAt).toMatch(/^2026-06-02T/);
    expect(r.data.scheduledEndAt).toMatch(/^2026-06-02T/);
  });

  it("rejects invalid timestamps", () => {
    const r = validateSchedulingFields({
      scheduledStartAt: "not-a-date",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts end >= start", () => {
    const r = validateSchedulingFields({
      scheduledStartAt: "2026-06-02T10:00",
      scheduledEndAt: "2026-06-02T10:00",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects end < start", () => {
    const r = validateSchedulingFields({
      scheduledStartAt: "2026-06-02T10:00",
      scheduledEndAt: "2026-06-02T09:00",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateJobLineItemForm", () => {
  const valid = {
    name: "Exterior Window Cleaning",
    quantity: 1,
    unitPriceCents: 24900,
    source: "service",
  };

  it("accepts a valid service-backed line", () => {
    const r = validateJobLineItemForm(valid);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.totalCents).toBe(24900);
    expect(r.data.source).toBe("service");
  });

  it("rejects missing name", () => {
    const r = validateJobLineItemForm({ ...valid, name: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("name");
  });

  it("rejects non-positive quantity", () => {
    const r = validateJobLineItemForm({ ...valid, quantity: 0 });
    expect(r.ok).toBe(false);
    const r2 = validateJobLineItemForm({ ...valid, quantity: -1 });
    expect(r2.ok).toBe(false);
  });

  it("rejects negative unit price", () => {
    const r = validateJobLineItemForm({ ...valid, unitPriceCents: -1 });
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer unit price", () => {
    const r = validateJobLineItemForm({
      ...valid,
      unitPriceCents: 24900.5,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown source", () => {
    const r = validateJobLineItemForm({ ...valid, source: "nope" });
    expect(r.ok).toBe(false);
  });

  it("collects multiple errors at once", () => {
    const r = validateJobLineItemForm({
      name: "",
      quantity: 0,
      unitPriceCents: -10,
      source: "nope",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("quantity");
    expect(fields).toContain("unitPriceCents");
    expect(fields).toContain("source");
  });

  it("rounds fractional quantity to two decimals", () => {
    const r = validateJobLineItemForm({
      ...valid,
      quantity: 0.333,
      unitPriceCents: 10000,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.quantity).toBe(0.33);
    expect(r.data.totalCents).toBe(3300);
  });

  it("accepts a custom line without service id", () => {
    const r = validateJobLineItemForm({
      ...valid,
      source: "custom",
      serviceId: null,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.serviceId).toBeNull();
    expect(r.data.source).toBe("custom");
  });
});
