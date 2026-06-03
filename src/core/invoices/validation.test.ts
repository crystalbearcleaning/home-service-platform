import { describe, expect, it } from "vitest";

import {
  INVOICE_LINE_ITEM_SOURCES,
  INVOICE_SOURCES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  isInvoiceLineItemSource,
  isInvoiceSource,
  isInvoiceStatus,
  isPaymentMethod,
} from "./constants";
import {
  isReceiptMarkableStatus,
  validateInvoiceForm,
  validateInvoiceLineItemForm,
  validatePaymentForm,
} from "./validation";

describe("constants + type guards", () => {
  it("INVOICE_STATUSES pins the 4 statuses", () => {
    expect([...INVOICE_STATUSES]).toEqual(["draft", "unpaid", "paid", "void"]);
  });

  it("INVOICE_SOURCES pins the 2 sources", () => {
    expect([...INVOICE_SOURCES]).toEqual(["job_completion", "manual"]);
  });

  it("INVOICE_LINE_ITEM_SOURCES pins the 2 sources", () => {
    expect([...INVOICE_LINE_ITEM_SOURCES]).toEqual(["job", "custom"]);
  });

  it("PAYMENT_METHODS pins the 5 methods", () => {
    expect([...PAYMENT_METHODS]).toEqual([
      "cash",
      "check",
      "card",
      "zelle",
      "other",
    ]);
  });

  it("type guards accept / reject correctly", () => {
    expect(isInvoiceStatus("paid")).toBe(true);
    expect(isInvoiceStatus("nope")).toBe(false);
    expect(isInvoiceStatus(0)).toBe(false);

    expect(isInvoiceSource("manual")).toBe(true);
    expect(isInvoiceSource("quote")).toBe(false);

    expect(isInvoiceLineItemSource("job")).toBe(true);
    expect(isInvoiceLineItemSource("quote")).toBe(false);

    expect(isPaymentMethod("cash")).toBe(true);
    expect(isPaymentMethod("crypto")).toBe(false);
  });
});

describe("validateInvoiceForm", () => {
  it("accepts a valid form with explicit defaults", () => {
    const r = validateInvoiceForm({
      contactId: "c1",
      jobId: "j1",
      invoiceNumber: "INV-1001",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.contactId).toBe("c1");
    expect(r.data.jobId).toBe("j1");
    expect(r.data.status).toBe("unpaid");
    expect(r.data.source).toBe("job_completion");
    expect(r.data.invoiceNumber).toBe("INV-1001");
  });

  it("requires contactId and jobId", () => {
    const r = validateInvoiceForm({
      contactId: "",
      jobId: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain("contactId");
    expect(fields).toContain("jobId");
  });

  it("rejects unknown status / source", () => {
    const r = validateInvoiceForm({
      contactId: "c1",
      jobId: "j1",
      status: "bogus",
      source: "bogus",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain("status");
    expect(fields).toContain("source");
  });

  it("honors defaults override", () => {
    const r = validateInvoiceForm(
      { contactId: "c1", jobId: "j1" },
      { status: "draft", source: "manual" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("draft");
    expect(r.data.source).toBe("manual");
  });

  it("trims invoice_number; rejects too-long", () => {
    const ok = validateInvoiceForm({
      contactId: "c1",
      jobId: "j1",
      invoiceNumber: "   INV-77   ",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.data.invoiceNumber).toBe("INV-77");

    const tooLong = validateInvoiceForm({
      contactId: "c1",
      jobId: "j1",
      invoiceNumber: "x".repeat(200),
    });
    expect(tooLong.ok).toBe(false);
  });
});

describe("validateInvoiceLineItemForm", () => {
  it("accepts a valid `job`-source row", () => {
    const r = validateInvoiceLineItemForm({
      name: "Exterior cleaning",
      quantity: 1,
      unitPriceCents: 24900,
      source: "job",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.totalCents).toBe(24900);
    expect(r.data.source).toBe("job");
  });

  it("rejects empty name", () => {
    const r = validateInvoiceLineItemForm({
      name: "  ",
      quantity: 1,
      unitPriceCents: 100,
      source: "job",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-positive quantity", () => {
    const r = validateInvoiceLineItemForm({
      name: "X",
      quantity: 0,
      unitPriceCents: 100,
      source: "job",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects negative unit price", () => {
    const r = validateInvoiceLineItemForm({
      name: "X",
      quantity: 1,
      unitPriceCents: -1,
      source: "job",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-integer unit price (cents)", () => {
    const r = validateInvoiceLineItemForm({
      name: "X",
      quantity: 1,
      unitPriceCents: 100.5,
      source: "job",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown source", () => {
    const r = validateInvoiceLineItemForm({
      name: "X",
      quantity: 1,
      unitPriceCents: 100,
      source: "quote",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects negative sort order", () => {
    const r = validateInvoiceLineItemForm({
      name: "X",
      quantity: 1,
      unitPriceCents: 100,
      sortOrder: -1,
      source: "custom",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validatePaymentForm", () => {
  it("accepts a valid payment", () => {
    const r = validatePaymentForm({
      amountCents: 5000,
      paymentMethod: "cash",
      paidAt: "2026-06-03T12:00",
      notes: "Check #1234",
      currentBalanceCents: 10000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.amountCents).toBe(5000);
    expect(r.data.paymentMethod).toBe("cash");
    expect(r.data.notes).toBe("Check #1234");
    expect(r.data.paidAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects non-positive amount", () => {
    expect(
      validatePaymentForm({
        amountCents: 0,
        paymentMethod: "cash",
        paidAt: "2026-06-03T12:00",
        currentBalanceCents: 10000,
      }).ok,
    ).toBe(false);
    expect(
      validatePaymentForm({
        amountCents: -1,
        paymentMethod: "cash",
        paidAt: "2026-06-03T12:00",
        currentBalanceCents: 10000,
      }).ok,
    ).toBe(false);
  });

  it("rejects non-integer amount cents", () => {
    const r = validatePaymentForm({
      amountCents: 99.5,
      paymentMethod: "cash",
      paidAt: "2026-06-03T12:00",
      currentBalanceCents: 10000,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects amount > current balance (overpayment guard)", () => {
    const r = validatePaymentForm({
      amountCents: 20000,
      paymentMethod: "cash",
      paidAt: "2026-06-03T12:00",
      currentBalanceCents: 10000,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.find((e) => e.field === "amountCents")).toBeTruthy();
  });

  it("rejects unknown payment method", () => {
    const r = validatePaymentForm({
      amountCents: 100,
      paymentMethod: "bitcoin",
      paidAt: "2026-06-03T12:00",
      currentBalanceCents: 10000,
    });
    expect(r.ok).toBe(false);
  });

  it("requires paidAt", () => {
    const empty = validatePaymentForm({
      amountCents: 100,
      paymentMethod: "cash",
      paidAt: "",
      currentBalanceCents: 10000,
    });
    expect(empty.ok).toBe(false);

    const invalid = validatePaymentForm({
      amountCents: 100,
      paymentMethod: "cash",
      paidAt: "not-a-date",
      currentBalanceCents: 10000,
    });
    expect(invalid.ok).toBe(false);
  });

  it("allows missing currentBalanceCents (no overpayment check)", () => {
    const r = validatePaymentForm({
      amountCents: 99999,
      paymentMethod: "cash",
      paidAt: "2026-06-03T12:00",
      currentBalanceCents: null,
    });
    expect(r.ok).toBe(true);
  });
});

describe("isReceiptMarkableStatus", () => {
  it("is true only for `paid`", () => {
    expect(isReceiptMarkableStatus("paid")).toBe(true);
    for (const s of ["draft", "unpaid", "void", "scheduled"]) {
      expect(isReceiptMarkableStatus(s)).toBe(false);
    }
  });
});
