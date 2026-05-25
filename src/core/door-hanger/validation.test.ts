import { describe, expect, it } from "vitest";
import {
  hasEnoughInventory,
  validateCampaign,
  validateDesign,
  validateRoute,
  validateSession,
} from "./validation";

describe("validateCampaign", () => {
  it("trims and accepts a minimal campaign", () => {
    const r = validateCampaign({ name: "  Spring 2026 push " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Spring 2026 push");
      expect(r.data.status).toBe("draft");
      expect(r.data.responseRateAssumption).toBeNull();
    }
  });
  it("requires a name", () => {
    const r = validateCampaign({ name: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe("name");
  });
  it("rejects out-of-range rates", () => {
    const r = validateCampaign({
      name: "ok",
      responseRateAssumption: 1.5,
      quoteToBookingAssumption: -0.1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.field).sort()).toEqual([
        "quoteToBookingAssumption",
        "responseRateAssumption",
      ]);
    }
  });
  it("rejects negative job value", () => {
    const r = validateCampaign({ name: "ok", averageJobValueCents: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe("averageJobValueCents");
  });
  it("falls back to 'draft' for unknown status without erroring", () => {
    const r = validateCampaign({ name: "ok", status: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("draft");
  });
});

describe("validateDesign", () => {
  it("accepts a valid design", () => {
    const r = validateDesign({
      name: "Spring Door Hanger v2",
      versionOrOffer: "20% off this week",
      quantityReceived: 500,
      totalPrintCostCents: 25000,
      receivedAt: "2026-05-01",
    });
    expect(r.ok).toBe(true);
  });
  it("rejects zero or non-integer quantities", () => {
    expect(validateDesign({ name: "x", quantityReceived: 0 }).ok).toBe(false);
    expect(validateDesign({ name: "x", quantityReceived: 1.5 }).ok).toBe(false);
  });
  it("rejects negative total print cost", () => {
    const r = validateDesign({
      name: "x",
      quantityReceived: 10,
      totalPrintCostCents: -100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe("totalPrintCostCents");
  });
  it("rejects an unparseable received_at", () => {
    const r = validateDesign({
      name: "x",
      quantityReceived: 1,
      receivedAt: "not-a-date",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe("receivedAt");
  });
});

describe("validateRoute", () => {
  it("accepts a minimal manual route", () => {
    const r = validateRoute({ name: "North Boca walk" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("draft");
  });
  it("rejects non-positive radius / target", () => {
    expect(validateRoute({ name: "x", radiusMiles: 0 }).ok).toBe(false);
    expect(validateRoute({ name: "x", targetHomeCount: 0 }).ok).toBe(false);
  });
  it("allows campaign id to be null", () => {
    const r = validateRoute({ name: "x", campaignId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.campaignId).toBeNull();
  });
});

describe("validateSession", () => {
  const ids = {
    campaignId: "c1",
    routeId: "r1",
    designId: "d1",
  };
  it("accepts a valid session", () => {
    const r = validateSession({
      ...ids,
      distributedAt: "2026-05-24T15:00:00Z",
      hangersDistributed: 50,
      timeSpentSeconds: 1500,
    });
    expect(r.ok).toBe(true);
  });
  it("requires campaign / route / design ids", () => {
    const r = validateSession({
      campaignId: "",
      routeId: "",
      designId: "",
      distributedAt: "2026-05-24",
      hangersDistributed: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.field).sort()).toEqual([
        "campaignId",
        "designId",
        "routeId",
      ]);
    }
  });
  it("rejects zero / non-integer hangers", () => {
    expect(
      validateSession({ ...ids, distributedAt: "2026-05-24", hangersDistributed: 0 }).ok,
    ).toBe(false);
    expect(
      validateSession({ ...ids, distributedAt: "2026-05-24", hangersDistributed: 2.5 }).ok,
    ).toBe(false);
  });
  it("rejects negative time", () => {
    const r = validateSession({
      ...ids,
      distributedAt: "2026-05-24",
      hangersDistributed: 5,
      timeSpentSeconds: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe("timeSpentSeconds");
  });
});

describe("hasEnoughInventory", () => {
  it("allows when remaining ≥ requested", () => {
    expect(
      hasEnoughInventory({ quantityReceived: 100, quantityUsed: 40, hangersDistributed: 60 }),
    ).toBe(true);
    expect(
      hasEnoughInventory({ quantityReceived: 100, quantityUsed: 40, hangersDistributed: 61 }),
    ).toBe(false);
  });
  it("rejects when used already exceeds received (defensive)", () => {
    expect(
      hasEnoughInventory({ quantityReceived: 10, quantityUsed: 50, hangersDistributed: 1 }),
    ).toBe(false);
  });
});
