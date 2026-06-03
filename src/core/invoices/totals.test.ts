import { describe, expect, it } from "vitest";

import {
  computeAmountPaid,
  computeInvoiceBalance,
  computeInvoiceLineItemTotal,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  deriveInvoicePaymentStatus,
} from "./totals";

describe("computeInvoiceLineItemTotal", () => {
  it("returns rounded quantity × unitPriceCents", () => {
    expect(
      computeInvoiceLineItemTotal({ quantity: 1, unitPriceCents: 24900 }),
    ).toBe(24900);
    expect(
      computeInvoiceLineItemTotal({ quantity: 2, unitPriceCents: 7500 }),
    ).toBe(15000);
  });

  it("supports fractional quantity with rounding", () => {
    expect(
      computeInvoiceLineItemTotal({ quantity: 1.5, unitPriceCents: 10000 }),
    ).toBe(15000);
    expect(
      computeInvoiceLineItemTotal({ quantity: 0.333, unitPriceCents: 10000 }),
    ).toBe(3300);
  });

  it("clamps negative + non-finite inputs to 0", () => {
    expect(
      computeInvoiceLineItemTotal({ quantity: -1, unitPriceCents: 10000 }),
    ).toBe(0);
    expect(
      computeInvoiceLineItemTotal({ quantity: 1, unitPriceCents: -100 }),
    ).toBe(0);
    expect(
      computeInvoiceLineItemTotal({
        quantity: Number.NaN,
        unitPriceCents: 10000,
      }),
    ).toBe(0);
    expect(
      computeInvoiceLineItemTotal({
        quantity: 1,
        unitPriceCents: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });
});

describe("computeInvoiceSubtotal / computeInvoiceTotal", () => {
  it("sums positive integer totalCents", () => {
    expect(
      computeInvoiceSubtotal([
        { totalCents: 24900 },
        { totalCents: 15000 },
        { totalCents: 7500 },
      ]),
    ).toBe(47400);
  });

  it("returns 0 for empty / nullish lists", () => {
    expect(computeInvoiceSubtotal([])).toBe(0);
    expect(
      computeInvoiceSubtotal(
        null as unknown as ReadonlyArray<{ totalCents: number }>,
      ),
    ).toBe(0);
  });

  it("ignores negative / non-finite line totals", () => {
    expect(
      computeInvoiceSubtotal([
        { totalCents: 1000 },
        { totalCents: -500 },
        { totalCents: Number.NaN },
        { totalCents: 500 },
      ]),
    ).toBe(1500);
  });

  it("computeInvoiceTotal === subtotal in Phase 11 (no taxes)", () => {
    const items = [{ totalCents: 1000 }, { totalCents: 2500 }];
    expect(computeInvoiceTotal(items)).toBe(
      computeInvoiceSubtotal(items),
    );
  });
});

describe("computeAmountPaid", () => {
  it("sums positive integer amountCents", () => {
    expect(
      computeAmountPaid([
        { amountCents: 10000 },
        { amountCents: 5000 },
      ]),
    ).toBe(15000);
  });

  it("ignores zero / negative / non-finite payments", () => {
    expect(
      computeAmountPaid([
        { amountCents: 5000 },
        { amountCents: 0 },
        { amountCents: -100 },
        { amountCents: Number.NaN },
      ]),
    ).toBe(5000);
  });

  it("returns 0 for empty / nullish lists", () => {
    expect(computeAmountPaid([])).toBe(0);
    expect(
      computeAmountPaid(
        null as unknown as ReadonlyArray<{ amountCents: number }>,
      ),
    ).toBe(0);
  });
});

describe("computeInvoiceBalance", () => {
  it("returns total - amountPaid when positive", () => {
    expect(computeInvoiceBalance(10000, 4000)).toBe(6000);
  });

  it("clamps balance at 0 when amountPaid >= total", () => {
    expect(computeInvoiceBalance(10000, 10000)).toBe(0);
    expect(computeInvoiceBalance(10000, 20000)).toBe(0);
  });

  it("treats non-finite / negative inputs as zero", () => {
    expect(computeInvoiceBalance(Number.NaN, 100)).toBe(0);
    expect(computeInvoiceBalance(-100, 50)).toBe(0);
    expect(computeInvoiceBalance(1000, Number.NaN)).toBe(1000);
  });
});

describe("deriveInvoicePaymentStatus", () => {
  it("flips unpaid → paid when balance hits zero, propagates paidAt", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "unpaid",
      balanceCents: 0,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("paid");
    expect(r.paidAtIso).toBe("2026-06-03T12:00:00.000Z");
  });

  it("flips draft → paid on full payment", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "draft",
      balanceCents: 0,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("paid");
  });

  it("keeps unpaid when balance still > 0", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "unpaid",
      balanceCents: 500,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("unpaid");
    expect(r.paidAtIso).toBeNull();
  });

  it("paid stays paid + does not re-set paidAt", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "paid",
      balanceCents: 0,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("paid");
    expect(r.paidAtIso).toBeNull();
  });

  it("void never auto-flips", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "void",
      balanceCents: 0,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("void");
    expect(r.paidAtIso).toBeNull();
  });

  it("treats negative balance defensively as zero (paid)", () => {
    const r = deriveInvoicePaymentStatus({
      currentStatus: "unpaid",
      balanceCents: -100,
      paymentPaidAtIso: "2026-06-03T12:00:00.000Z",
    });
    expect(r.nextStatus).toBe("paid");
  });
});
