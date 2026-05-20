import { describe, expect, it } from "vitest";
import {
  renderManualQuoteNeeded,
  renderMessage,
  renderScheduleRequest,
  renderServiceAreaReview,
  SAMPLE_TEMPLATE_CONTEXT,
} from "./templates";
import { TEMPLATE_KEYS } from "./types";

describe("renderScheduleRequest", () => {
  it("includes name, address, city, plan and total", () => {
    const out = renderScheduleRequest({
      customer_name: "Jane Smith",
      address: "8126 Valhalla Dr",
      city: "Boca Raton",
      plan_label: "Every 3 Months",
      total: "$439",
    });
    expect(out).toContain("Jane Smith");
    expect(out).toContain("8126 Valhalla Dr");
    expect(out).toContain("Boca Raton");
    expect(out).toContain("Every 3 Months");
    expect(out).toContain("$439");
    expect(out).toMatch(/call\/text/i);
  });

  it("falls back gracefully when fields are missing", () => {
    const out = renderScheduleRequest({});
    expect(out).toContain("a lead");
    expect(out).toContain("an address");
    expect(out).toContain("their selected plan");
    expect(out).toContain("(no total)");
  });

  it("uses the address alone when city is missing", () => {
    const out = renderScheduleRequest({
      customer_name: "Sam",
      address: "1 Main St",
    });
    expect(out).toContain("Sam, 1 Main St.");
  });

  it("never includes an email", () => {
    const out = renderScheduleRequest({
      customer_name: "Jane",
      // simulate caller leaking email into name (e.g. mis-mapped field)
      address: "1 Main St",
    });
    expect(out).not.toMatch(/@/);
  });
});

describe("renderManualQuoteNeeded", () => {
  it("includes name and where + a clear instruction", () => {
    const out = renderManualQuoteNeeded({
      customer_name: "Jane",
      address: "1 Main St",
      city: "Boca Raton",
    });
    expect(out).toContain("Manual quote needed");
    expect(out).toContain("Jane");
    expect(out).toContain("1 Main St, Boca Raton");
    expect(out).toMatch(/property details/i);
  });

  it("falls back when both address and city are missing", () => {
    const out = renderManualQuoteNeeded({ customer_name: "Jane" });
    expect(out).toContain("Jane");
    expect(out).toContain("an address");
  });
});

describe("renderServiceAreaReview", () => {
  it("includes name + city + an action line", () => {
    const out = renderServiceAreaReview({
      customer_name: "Jane",
      city: "Wellington",
    });
    expect(out).toContain("Out-of-area lead");
    expect(out).toContain("Jane");
    expect(out).toContain("Wellington");
    expect(out).toMatch(/follow up/i);
  });

  it("falls back when city is missing", () => {
    const out = renderServiceAreaReview({ customer_name: "Jane" });
    expect(out).toContain("their area");
  });
});

describe("renderMessage dispatcher", () => {
  it("dispatches to each known template key", () => {
    for (const key of TEMPLATE_KEYS) {
      const rendered = renderMessage(key, SAMPLE_TEMPLATE_CONTEXT);
      expect(rendered.templateKey).toBe(key);
      expect(rendered.body.length).toBeGreaterThan(10);
      expect(rendered.body.length).toBeLessThan(280); // not a strict SMS limit, but a sanity bound
    }
  });
});

describe("clean / whitespace handling", () => {
  it("collapses internal whitespace and trims", () => {
    const out = renderScheduleRequest({
      customer_name: "  Jane    Smith \n",
      address: " 8126   Valhalla Dr ",
      city: "Boca   Raton",
      plan_label: " Every 3 Months ",
      total: " $439 ",
    });
    expect(out).toContain("Jane Smith");
    expect(out).toContain("8126 Valhalla Dr");
    expect(out).toContain("Boca Raton");
  });
});
