import { describe, it, expect } from "vitest";
import { normalizeCity } from "./match-service-area";

describe("normalizeCity", () => {
  it("lowercases", () => {
    expect(normalizeCity("Boynton Beach")).toBe("boynton beach");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCity("  Boca Raton  ")).toBe("boca raton");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeCity("Delray   Beach")).toBe("delray beach");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeCity("   ")).toBe("");
  });

  it("handles tab and newline whitespace", () => {
    expect(normalizeCity("\tBoynton\nBeach\t")).toBe("boynton beach");
  });
});
