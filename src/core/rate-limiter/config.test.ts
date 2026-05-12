import { describe, it, expect } from "vitest";
import { getActionLimitConfig, listActionKeys, phase1RateLimits } from "./config";

describe("phase 1 rate limit config", () => {
  it("includes the three required action keys", () => {
    expect(Object.keys(phase1RateLimits).sort()).toEqual(
      [
        "quote.address_lookup",
        "quote.submit_contact",
        "geo.autocomplete_server",
      ].sort(),
    );
  });

  it("uses the documented Phase 1 numbers", () => {
    expect(phase1RateLimits["quote.address_lookup"]).toEqual({
      windowSeconds: 600,
      maxPerIp: 20,
      maxPerAddress: 8,
    });
    expect(phase1RateLimits["quote.submit_contact"]).toEqual({
      windowSeconds: 600,
      maxPerIp: 5,
      maxPerAddress: 3,
    });
    expect(phase1RateLimits["geo.autocomplete_server"]).toEqual({
      windowSeconds: 600,
      maxPerIp: 30,
    });
  });

  it("getActionLimitConfig returns null for unknown keys", () => {
    expect(getActionLimitConfig("not.a.real.action")).toBeNull();
  });

  it("listActionKeys returns the action keys", () => {
    expect(listActionKeys()).toContain("quote.address_lookup");
    expect(listActionKeys()).toHaveLength(3);
  });
});
