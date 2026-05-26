import { describe, expect, it } from "vitest";
import { shouldSkipForSimulation } from "./is-simulation-business";

describe("shouldSkipForSimulation", () => {
  it("skips only when the lookup confirms is_simulation=true", () => {
    expect(shouldSkipForSimulation({ ok: true, isSimulation: true })).toBe(true);
  });

  it("does not skip when the lookup says is_simulation=false", () => {
    expect(shouldSkipForSimulation({ ok: true, isSimulation: false })).toBe(
      false,
    );
  });

  it("falls through to the normal send path when the lookup failed", () => {
    expect(
      shouldSkipForSimulation({
        ok: false,
        error: { code: "DB_ERROR", message: "oops" },
      }),
    ).toBe(false);
  });

  it("does not throw on unexpected lookup shapes", () => {
    expect(
      shouldSkipForSimulation({
        // forced unknown shape
        ok: false,
        error: { code: "CLIENT_INIT_FAILED", message: "" },
      }),
    ).toBe(false);
  });
});
