import { describe, expect, it } from "vitest";

import {
  deriveCompleteJobButtonState,
  isJobCompletionEligibleStatus,
} from "./job-completion";

describe("isJobCompletionEligibleStatus", () => {
  it("accepts draft / unscheduled / scheduled / in_progress", () => {
    expect(isJobCompletionEligibleStatus("draft")).toBe(true);
    expect(isJobCompletionEligibleStatus("unscheduled")).toBe(true);
    expect(isJobCompletionEligibleStatus("scheduled")).toBe(true);
    expect(isJobCompletionEligibleStatus("in_progress")).toBe(true);
  });

  it("rejects completed / canceled / unknown", () => {
    expect(isJobCompletionEligibleStatus("completed")).toBe(false);
    expect(isJobCompletionEligibleStatus("canceled")).toBe(false);
    expect(isJobCompletionEligibleStatus("bogus")).toBe(false);
    expect(isJobCompletionEligibleStatus("")).toBe(false);
  });
});

describe("deriveCompleteJobButtonState", () => {
  it("hidden when status is ineligible (regardless of invoice count)", () => {
    expect(
      deriveCompleteJobButtonState({
        status: "completed",
        existingInvoiceCount: 0,
      }),
    ).toBe("hidden");
    expect(
      deriveCompleteJobButtonState({
        status: "canceled",
        existingInvoiceCount: 3,
      }),
    ).toBe("hidden");
  });

  it("primary when status eligible and no invoices yet", () => {
    expect(
      deriveCompleteJobButtonState({
        status: "scheduled",
        existingInvoiceCount: 0,
      }),
    ).toBe("primary");
    expect(
      deriveCompleteJobButtonState({
        status: "draft",
        existingInvoiceCount: 0,
      }),
    ).toBe("primary");
  });

  it("deemphasized when status eligible but at least one invoice exists", () => {
    expect(
      deriveCompleteJobButtonState({
        status: "scheduled",
        existingInvoiceCount: 1,
      }),
    ).toBe("deemphasized");
    expect(
      deriveCompleteJobButtonState({
        status: "in_progress",
        existingInvoiceCount: 5,
      }),
    ).toBe("deemphasized");
  });
});
