import { describe, expect, it } from "vitest";

import {
  isMarkPaidEligible,
  isMarkReceiptSentEligible,
} from "./eligibility";

describe("isMarkPaidEligible", () => {
  it("true for unpaid + positive balance", () => {
    expect(
      isMarkPaidEligible({ status: "unpaid", balanceCents: 100 }),
    ).toBe(true);
  });

  it("true for draft + positive balance", () => {
    expect(
      isMarkPaidEligible({ status: "draft", balanceCents: 5000 }),
    ).toBe(true);
  });

  it("false when balance is zero", () => {
    expect(
      isMarkPaidEligible({ status: "unpaid", balanceCents: 0 }),
    ).toBe(false);
  });

  it("false for paid / void", () => {
    expect(
      isMarkPaidEligible({ status: "paid", balanceCents: 5000 }),
    ).toBe(false);
    expect(
      isMarkPaidEligible({ status: "void", balanceCents: 5000 }),
    ).toBe(false);
  });

  it("false for unknown status", () => {
    expect(
      isMarkPaidEligible({ status: "bogus", balanceCents: 100 }),
    ).toBe(false);
  });

  it("false for non-finite balance", () => {
    expect(
      isMarkPaidEligible({ status: "unpaid", balanceCents: Number.NaN }),
    ).toBe(false);
  });
});

describe("isMarkReceiptSentEligible", () => {
  it("true for paid + null receipt_sent_at", () => {
    expect(
      isMarkReceiptSentEligible({ status: "paid", receiptSentAtIso: null }),
    ).toBe(true);
    expect(
      isMarkReceiptSentEligible({ status: "paid", receiptSentAtIso: undefined }),
    ).toBe(true);
  });

  it("false when receipt already sent", () => {
    expect(
      isMarkReceiptSentEligible({
        status: "paid",
        receiptSentAtIso: "2026-06-03T12:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("false for unpaid / draft / void", () => {
    for (const s of ["unpaid", "draft", "void"]) {
      expect(
        isMarkReceiptSentEligible({ status: s, receiptSentAtIso: null }),
      ).toBe(false);
    }
  });
});
