import { describe, expect, it } from "vitest";
import { isTemplateKey, renderByTemplateKey } from "./render";
import { TEMPLATE_KEYS } from "./types";

describe("isTemplateKey", () => {
  it("returns true for every known key", () => {
    for (const key of TEMPLATE_KEYS) {
      expect(isTemplateKey(key)).toBe(true);
    }
  });
  it("returns false for unknown strings", () => {
    expect(isTemplateKey("nope")).toBe(false);
    expect(isTemplateKey("")).toBe(false);
  });
});

describe("renderByTemplateKey", () => {
  it("returns ok=true with rendered body for a known template", () => {
    const result = renderByTemplateKey("internal_schedule_request_v1", {
      customer_name: "Jane",
      address: "1 Main St",
      city: "Boca Raton",
      plan_label: "Every 3 Months",
      total: "$199",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rendered.templateKey).toBe(
        "internal_schedule_request_v1",
      );
      expect(result.rendered.body).toContain("Jane");
    }
  });

  it("returns UNKNOWN_TEMPLATE for an unknown key", () => {
    const result = renderByTemplateKey("not_a_template_v9", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_TEMPLATE");
      expect(result.error.message).toContain("internal_schedule_request_v1");
    }
  });
});
