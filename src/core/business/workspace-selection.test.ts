import { describe, expect, it } from "vitest";
import { isValidBusinessIdCandidate } from "./workspace-selection";

describe("isValidBusinessIdCandidate", () => {
  it("accepts a canonical lowercase uuid", () => {
    expect(
      isValidBusinessIdCandidate("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe(true);
  });

  it("accepts uppercase uuid characters", () => {
    expect(
      isValidBusinessIdCandidate("550E8400-E29B-41D4-A716-446655440000"),
    ).toBe(true);
  });

  it("rejects non-string input", () => {
    expect(isValidBusinessIdCandidate(undefined)).toBe(false);
    expect(isValidBusinessIdCandidate(null)).toBe(false);
    expect(isValidBusinessIdCandidate(42)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isValidBusinessIdCandidate("not-a-uuid")).toBe(false);
    expect(isValidBusinessIdCandidate("550e8400e29b41d4a716446655440000")).toBe(
      false,
    );
  });

  it("rejects empty / whitespace", () => {
    expect(isValidBusinessIdCandidate("")).toBe(false);
    expect(isValidBusinessIdCandidate("   ")).toBe(false);
  });
});
