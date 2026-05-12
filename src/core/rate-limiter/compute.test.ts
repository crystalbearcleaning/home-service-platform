import { describe, it, expect } from "vitest";
import { computeCheckOutcome } from "./compute";
import type { ActionLimitConfig } from "./types";

const CONFIG: ActionLimitConfig = {
  windowSeconds: 600,
  maxPerIp: 5,
  maxPerAddress: 3,
};

const NOW = new Date("2026-05-11T20:00:00.000Z");

describe("computeCheckOutcome", () => {
  it("returns allowed when both counts are under the limit", () => {
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 2,
      oldestIpEventAt: null,
      addressCount: 1,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    // 5-2=3 ip remaining; 3-1=2 address remaining; min = 2.
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.windowSeconds).toBe(600);
    expect(result.resetAt).toBe("2026-05-11T20:10:00.000Z");
  });

  it("uses ipRemaining when no address is supplied", () => {
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 4,
      oldestIpEventAt: null,
      addressCount: null,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.remaining).toBe(1);
  });

  it("blocks with ip_limit when ipCount >= maxPerIp", () => {
    const oldest = new Date(NOW.getTime() - 60_000); // 1 min ago
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 5,
      oldestIpEventAt: oldest,
      addressCount: 0,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe("ip_limit");
    expect(result.limit).toBe(5);
    // window=600s, oldest 60s ago → retry in ~540s
    expect(result.retryAfterSeconds).toBe(540);
    expect(result.resetAt).toBe("2026-05-11T20:09:00.000Z");
  });

  it("blocks with address_limit when only the address bucket is full", () => {
    const oldest = new Date(NOW.getTime() - 120_000); // 2 min ago
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 2,
      oldestIpEventAt: new Date(NOW.getTime() - 30_000),
      addressCount: 3,
      oldestAddressEventAt: oldest,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe("address_limit");
    expect(result.limit).toBe(3);
    expect(result.retryAfterSeconds).toBe(480);
  });

  it("ip_limit beats address_limit when both are exceeded", () => {
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 10,
      oldestIpEventAt: new Date(NOW.getTime() - 10_000),
      addressCount: 10,
      oldestAddressEventAt: new Date(NOW.getTime() - 10_000),
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason).toBe("ip_limit");
  });

  it("retryAfter falls back to full window when oldestEventAt is null", () => {
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 5,
      oldestIpEventAt: null,
      addressCount: null,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.retryAfterSeconds).toBe(600);
  });

  it("never returns negative retryAfter when oldest event is past the window", () => {
    const oldest = new Date(NOW.getTime() - 10 * 60 * 1000 - 5000); // 605s ago
    const result = computeCheckOutcome({
      config: CONFIG,
      ipCount: 5,
      oldestIpEventAt: oldest,
      addressCount: null,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it("ignores the address bucket when the config has no maxPerAddress", () => {
    const ipOnly: ActionLimitConfig = { windowSeconds: 600, maxPerIp: 5 };
    const result = computeCheckOutcome({
      config: ipOnly,
      ipCount: 1,
      oldestIpEventAt: null,
      addressCount: 999,
      oldestAddressEventAt: null,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.remaining).toBe(4);
  });
});
