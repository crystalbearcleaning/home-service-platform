import { describe, expect, it } from "vitest";

import { DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER } from "./assumptions";
import { validateStartSessionForm } from "./start-validation";

describe("validateStartSessionForm", () => {
  const baseValid = {
    routeId: "route-1",
    designId: "design-1",
    secondsPerHanger: 30,
  };

  it("accepts a valid form", () => {
    const r = validateStartSessionForm(baseValid);
    expect(r).toEqual({
      ok: true,
      data: {
        routeId: "route-1",
        designId: "design-1",
        secondsPerHanger: 30,
      },
    });
  });

  it("trims string ids", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      routeId: "  route-2  ",
      designId: " design-2 ",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.routeId).toBe("route-2");
    expect(r.data.designId).toBe("design-2");
  });

  it("defaults seconds_per_hanger to 30 when empty", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: "",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.secondsPerHanger).toBe(
      DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
    );
  });

  it("defaults seconds_per_hanger to 30 when null", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: null,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.secondsPerHanger).toBe(
      DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
    );
  });

  it("rejects empty routeId", () => {
    const r = validateStartSessionForm({ ...baseValid, routeId: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("routeId");
  });

  it("rejects whitespace-only routeId", () => {
    const r = validateStartSessionForm({ ...baseValid, routeId: "   " });
    expect(r.ok).toBe(false);
  });

  it("rejects empty designId", () => {
    const r = validateStartSessionForm({ ...baseValid, designId: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors.map((e) => e.field)).toContain("designId");
  });

  it("rejects non-numeric seconds_per_hanger", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: "abc",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0]?.field).toBe("secondsPerHanger");
    expect(r.errors[0]?.message).toContain("number");
  });

  it("rejects non-integer seconds_per_hanger", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: 30.5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.errors[0]?.message).toContain("whole number");
  });

  it("rejects out-of-range seconds_per_hanger", () => {
    const tooLow = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: 0,
    });
    const tooHigh = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: 9999,
    });
    expect(tooLow.ok).toBe(false);
    expect(tooHigh.ok).toBe(false);
  });

  it("collects multiple field errors at once", () => {
    const r = validateStartSessionForm({
      routeId: "",
      designId: "",
      secondsPerHanger: "nope",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain("routeId");
    expect(fields).toContain("designId");
    expect(fields).toContain("secondsPerHanger");
  });

  it("accepts seconds_per_hanger as a numeric string", () => {
    const r = validateStartSessionForm({
      ...baseValid,
      secondsPerHanger: "45",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.secondsPerHanger).toBe(45);
  });
});
