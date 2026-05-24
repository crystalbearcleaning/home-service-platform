import { describe, expect, it } from "vitest";
import { NOTE_MAX_LENGTH, validateNoteBody } from "./validate";

describe("validateNoteBody", () => {
  it("trims and accepts a normal note", () => {
    const r = validateNoteBody("  Called customer  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toBe("Called customer");
  });
  it("rejects empty / whitespace-only / null / undefined", () => {
    for (const v of ["", "   ", null, undefined]) {
      const r = validateNoteBody(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("REQUIRED");
    }
  });
  it("rejects bodies longer than NOTE_MAX_LENGTH", () => {
    const r = validateNoteBody("x".repeat(NOTE_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TOO_LONG");
  });
  it("accepts exactly NOTE_MAX_LENGTH", () => {
    const r = validateNoteBody("x".repeat(NOTE_MAX_LENGTH));
    expect(r.ok).toBe(true);
  });
});
