import { describe, expect, it } from "vitest";
import { diffContactEdit, validateContactEdit } from "./validate";

describe("validateContactEdit", () => {
  it("accepts a normal valid edit", () => {
    const r = validateContactEdit({
      fullName: "  Jane Smith ",
      phone: "+1 (561) 555-1234",
      email: "JANE@Example.com",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fullName).toBe("Jane Smith");
      expect(r.data.phone).toBe("+1 (561) 555-1234");
      expect(r.data.email).toBe("jane@example.com");
    }
  });

  it("requires name", () => {
    const r = validateContactEdit({
      fullName: "   ",
      phone: "+15615551234",
      email: "x@y.co",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "fullName" && e.code === "REQUIRED")).toBe(true);
    }
  });

  it("rejects phone with fewer than 7 digits", () => {
    const r = validateContactEdit({
      fullName: "Jane",
      phone: "555-12",
      email: "x@y.co",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "phone" && e.code === "INVALID_PHONE")).toBe(true);
    }
  });

  it("rejects invalid email shapes", () => {
    const r = validateContactEdit({
      fullName: "Jane",
      phone: "+15615551234",
      email: "not-an-email",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "email" && e.code === "INVALID_EMAIL")).toBe(true);
    }
  });

  it("rejects overly long fields", () => {
    const r = validateContactEdit({
      fullName: "x".repeat(121),
      phone: "+1" + "2".repeat(31),
      email: "a".repeat(250) + "@b.co",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "fullName" && e.code === "TOO_LONG")).toBe(true);
      expect(r.errors.some((e) => e.field === "phone" && e.code === "TOO_LONG")).toBe(true);
      expect(r.errors.some((e) => e.field === "email" && e.code === "TOO_LONG")).toBe(true);
    }
  });
});

describe("diffContactEdit", () => {
  const before = { fullName: "Jane", phone: "+15615551234", email: "jane@example.com" };

  it("returns empty when nothing changed", () => {
    expect(diffContactEdit(before, { ...before })).toEqual([]);
  });

  it("detects name changes", () => {
    const d = diffContactEdit(before, { ...before, fullName: "Jane Smith" });
    expect(d.map((x) => x.field)).toEqual(["fullName"]);
  });

  it("treats email comparison case-insensitively", () => {
    const d = diffContactEdit(before, { ...before, email: "JANE@Example.com" });
    expect(d).toEqual([]);
  });

  it("treats whitespace-only changes as no-op", () => {
    const d = diffContactEdit(before, { ...before, fullName: "  Jane  " });
    expect(d).toEqual([]);
  });

  it("captures multi-field diffs", () => {
    const d = diffContactEdit(before, {
      fullName: "John",
      phone: "+15615559999",
      email: "john@example.com",
    });
    expect(d.map((x) => x.field).sort()).toEqual(["email", "fullName", "phone"]);
  });
});
