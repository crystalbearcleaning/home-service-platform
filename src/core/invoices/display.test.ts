import { describe, expect, it } from "vitest";

import {
  formatCentsAsDollars,
  invoiceLineItemSourceLabel,
  invoiceSourceLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  paymentMethodLabel,
  receiptDisplay,
  receiptDisplayLabel,
} from "./display";

describe("status / source / payment method labels + tones", () => {
  it("invoiceStatusLabel covers all 4 statuses", () => {
    expect(invoiceStatusLabel("draft")).toBe("Draft");
    expect(invoiceStatusLabel("unpaid")).toBe("Unpaid");
    expect(invoiceStatusLabel("paid")).toBe("Paid");
    expect(invoiceStatusLabel("void")).toBe("Void");
  });

  it("invoiceStatusLabel falls back to raw value on unknown", () => {
    expect(invoiceStatusLabel("bogus")).toBe("bogus");
  });

  it("invoiceStatusTone maps every status", () => {
    expect(invoiceStatusTone("draft")).toBe("neutral");
    expect(invoiceStatusTone("unpaid")).toBe("warning");
    expect(invoiceStatusTone("paid")).toBe("success");
    expect(invoiceStatusTone("void")).toBe("danger");
    expect(invoiceStatusTone("bogus")).toBe("neutral");
  });

  it("invoiceSourceLabel covers both sources", () => {
    expect(invoiceSourceLabel("job_completion")).toBe("From completed job");
    expect(invoiceSourceLabel("manual")).toBe("Manual");
  });

  it("invoiceLineItemSourceLabel covers both", () => {
    expect(invoiceLineItemSourceLabel("job")).toBe("From job");
    expect(invoiceLineItemSourceLabel("custom")).toBe("Custom");
  });

  it("paymentMethodLabel covers all 5 methods", () => {
    expect(paymentMethodLabel("cash")).toBe("Cash");
    expect(paymentMethodLabel("check")).toBe("Check");
    expect(paymentMethodLabel("card")).toBe("Card");
    expect(paymentMethodLabel("zelle")).toBe("Zelle");
    expect(paymentMethodLabel("other")).toBe("Other");
  });
});

describe("formatCentsAsDollars (re-exported)", () => {
  it("is the same helper the jobs UI uses", () => {
    expect(formatCentsAsDollars(24900)).toBe("$249.00");
    expect(formatCentsAsDollars(0)).toBe("$0.00");
    expect(formatCentsAsDollars(null)).toBe("—");
  });
});

describe("receiptDisplay / receiptDisplayLabel", () => {
  it("returns not_paid when invoice is not paid", () => {
    expect(receiptDisplay({ status: "unpaid", receiptSentAtIso: null })).toBe(
      "not_paid",
    );
    expect(receiptDisplayLabel({ status: "unpaid", receiptSentAtIso: null }))
      .toBe("—");
  });

  it("returns not_sent when paid but receipt_sent_at is null", () => {
    expect(receiptDisplay({ status: "paid", receiptSentAtIso: null })).toBe(
      "not_sent",
    );
    expect(receiptDisplayLabel({ status: "paid", receiptSentAtIso: null }))
      .toBe("Not sent");
  });

  it("returns sent when paid and receipt_sent_at present", () => {
    expect(
      receiptDisplay({
        status: "paid",
        receiptSentAtIso: "2026-06-03T12:00:00Z",
      }),
    ).toBe("sent");
    expect(
      receiptDisplayLabel({
        status: "paid",
        receiptSentAtIso: "2026-06-03T12:00:00Z",
      }),
    ).toBe("Sent");
  });
});
