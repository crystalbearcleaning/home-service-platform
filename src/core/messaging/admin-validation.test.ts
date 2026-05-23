import { describe, expect, it } from "vitest";
import {
  E164_REGEX,
  maskPhoneE164,
  validateRecipientInput,
} from "./admin-validation";

describe("E164_REGEX", () => {
  it("accepts standard US E.164", () => {
    expect(E164_REGEX.test("+15615551234")).toBe(true);
  });
  it("accepts a 7-digit minimum and 15-digit maximum", () => {
    expect(E164_REGEX.test("+1234567")).toBe(true);
    expect(E164_REGEX.test("+123456789012345")).toBe(true);
  });
  it("rejects missing +, leading zero, dashes, spaces, parentheses", () => {
    expect(E164_REGEX.test("15615551234")).toBe(false);
    expect(E164_REGEX.test("+05615551234")).toBe(false);
    expect(E164_REGEX.test("+1-561-555-1234")).toBe(false);
    expect(E164_REGEX.test("+1 561 555 1234")).toBe(false);
    expect(E164_REGEX.test("+1(561)5551234")).toBe(false);
  });
  it("rejects too short / too long", () => {
    expect(E164_REGEX.test("+123456")).toBe(false);
    expect(E164_REGEX.test("+1234567890123456")).toBe(false);
  });
});

describe("validateRecipientInput", () => {
  it("trims name, lowercases nothing, returns ok shape", () => {
    const r = validateRecipientInput({
      name: "  Sam  ",
      phoneE164: "  +15615551234  ",
      roleLabel: "  Owner  ",
      isActive: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Sam");
      expect(r.data.phoneE164).toBe("+15615551234");
      expect(r.data.roleLabel).toBe("Owner");
      expect(r.data.isActive).toBe(true);
    }
  });

  it("returns null roleLabel when empty/whitespace", () => {
    const r = validateRecipientInput({
      name: "Sam",
      phoneE164: "+15615551234",
      roleLabel: "   ",
      isActive: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.roleLabel).toBeNull();
  });

  it("requires non-empty name", () => {
    const r = validateRecipientInput({
      name: "  ",
      phoneE164: "+15615551234",
      isActive: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "name" && e.code === "REQUIRED")).toBe(true);
    }
  });

  it("requires non-empty phoneE164", () => {
    const r = validateRecipientInput({
      name: "Sam",
      phoneE164: "",
      isActive: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.field === "phoneE164" && e.code === "REQUIRED",
        ),
      ).toBe(true);
    }
  });

  it("requires E.164 shape", () => {
    const r = validateRecipientInput({
      name: "Sam",
      phoneE164: "555-1234",
      isActive: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.field === "phoneE164" && e.code === "INVALID_E164",
        ),
      ).toBe(true);
    }
  });

  it("rejects names longer than 120 chars", () => {
    const r = validateRecipientInput({
      name: "x".repeat(121),
      phoneE164: "+15615551234",
      isActive: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.field === "name" && e.code === "TOO_LONG")).toBe(true);
    }
  });

  it("rejects role labels longer than 80 chars", () => {
    const r = validateRecipientInput({
      name: "Sam",
      phoneE164: "+15615551234",
      roleLabel: "y".repeat(81),
      isActive: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.field === "roleLabel" && e.code === "TOO_LONG"),
      ).toBe(true);
    }
  });

  it("rejects non-boolean isActive (defense-in-depth)", () => {
    const r = validateRecipientInput({
      name: "Sam",
      phoneE164: "+15615551234",
      // simulate a JSON deserialization mistake where isActive came through as a string
      isActive: "true" as unknown as boolean,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.field === "isActive" && e.code === "INVALID_BOOLEAN",
        ),
      ).toBe(true);
    }
  });
});

describe("maskPhoneE164", () => {
  it("hides the middle digits", () => {
    expect(maskPhoneE164("+15615551234")).toBe("+1••••••1234");
  });
  it("returns placeholder for very short input", () => {
    expect(maskPhoneE164("")).toBe("•••");
    expect(maskPhoneE164("+1")).toBe("•••");
  });
});
