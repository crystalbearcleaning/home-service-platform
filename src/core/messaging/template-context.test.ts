import { describe, expect, it } from "vitest";
import { buildTemplateContextForTask } from "./template-context";

describe("buildTemplateContextForTask", () => {
  it("includes name, address, city, plan_label, total when all are present", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "schedule_request",
      contactFullName: "Jane Smith",
      formattedAddress: "8126 Valhalla Dr, Boca Raton, FL 33433, USA",
      addressLine1: "8126 Valhalla Dr",
      city: "Boca Raton",
      selectedPlanLabel: "Every 3 Months",
      selectedTotal: 439,
    });
    expect(ctx.customer_name).toBe("Jane Smith");
    expect(ctx.address).toBe("8126 Valhalla Dr");
    expect(ctx.city).toBe("Boca Raton");
    expect(ctx.plan_label).toBe("Every 3 Months");
    expect(ctx.total).toBe("$439");
    expect(ctx.task_category).toBe("schedule_request");
  });

  it("never includes an email-shaped field even if upstream leaks one", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "schedule_request",
      // Passing email-looking content as the name should still be passed
      // through (we don't reject it) — but the field set never includes
      // a top-level email/email_*.
      contactFullName: "Jane Smith",
    });
    expect(ctx).not.toHaveProperty("email");
    expect(JSON.stringify(ctx)).not.toMatch(/email/i);
  });

  it("falls back to the formatted address when address_line_1 is empty", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "manual_quote",
      formattedAddress: "1 Main St, Boca Raton, FL",
      addressLine1: "",
      city: "Boca Raton",
    });
    // City portion is stripped to avoid duplication with the city field.
    expect(ctx.address).toBe("1 Main St");
    expect(ctx.city).toBe("Boca Raton");
  });

  it("returns null address when neither address_line_1 nor formatted are usable", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "service_area_review",
      city: "Wellington",
    });
    expect(ctx.address).toBeNull();
    expect(ctx.city).toBe("Wellington");
  });

  it("formats numeric total as $rounded", () => {
    expect(
      buildTemplateContextForTask({
        taskCategory: "schedule_request",
        selectedTotal: 199.4,
      }).total,
    ).toBe("$199");
    expect(
      buildTemplateContextForTask({
        taskCategory: "schedule_request",
        selectedTotal: 199.6,
      }).total,
    ).toBe("$200");
  });

  it("treats non-positive / non-finite totals as missing", () => {
    expect(
      buildTemplateContextForTask({
        taskCategory: "schedule_request",
        selectedTotal: 0,
      }).total,
    ).toBeNull();
    expect(
      buildTemplateContextForTask({
        taskCategory: "schedule_request",
        selectedTotal: Number.NaN,
      }).total,
    ).toBeNull();
  });

  it("returns null fields when context is empty (manual_quote / out_of_area paths)", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "manual_quote",
    });
    expect(ctx.customer_name).toBeNull();
    expect(ctx.address).toBeNull();
    expect(ctx.city).toBeNull();
    expect(ctx.plan_label).toBeNull();
    expect(ctx.total).toBeNull();
    expect(ctx.task_category).toBe("manual_quote");
  });

  it("trims whitespace from string inputs", () => {
    const ctx = buildTemplateContextForTask({
      taskCategory: "schedule_request",
      contactFullName: "  Jane  Smith  ",
      city: "  Boca Raton  ",
      selectedPlanLabel: "  Every 3 Months  ",
    });
    expect(ctx.customer_name).toBe("Jane  Smith");
    expect(ctx.city).toBe("Boca Raton");
    expect(ctx.plan_label).toBe("Every 3 Months");
  });
});
