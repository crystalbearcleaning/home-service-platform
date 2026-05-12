import { describe, it, expect } from "vitest";
import {
  hashIp,
  hashNormalizedAddress,
  UNKNOWN_IP_HASH,
} from "./hashing";

describe("hashIp", () => {
  it("returns a hex string, not the raw IP", () => {
    const hash = hashIp("203.0.113.42");
    expect(hash).not.toBe("203.0.113.42");
    expect(hash).not.toContain("203");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same IP", () => {
    expect(hashIp("203.0.113.42")).toBe(hashIp("203.0.113.42"));
  });

  it("produces different hashes for different IPs", () => {
    expect(hashIp("203.0.113.42")).not.toBe(hashIp("203.0.113.43"));
  });

  it("treats IPv4-mapped IPv6 as the same as plain IPv4", () => {
    expect(hashIp("::ffff:203.0.113.42")).toBe(hashIp("203.0.113.42"));
  });

  it("ignores leading / trailing whitespace and case", () => {
    expect(hashIp("  203.0.113.42  ")).toBe(hashIp("203.0.113.42"));
    expect(hashIp("FE80::1")).toBe(hashIp("fe80::1"));
  });

  it("UNKNOWN_IP_HASH is the hash of 0.0.0.0", () => {
    expect(UNKNOWN_IP_HASH).toBe(hashIp("0.0.0.0"));
    expect(UNKNOWN_IP_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashNormalizedAddress", () => {
  it("returns a hex string, not the raw address", () => {
    const hash = hashNormalizedAddress("123 Main St, Boynton Beach, FL");
    expect(hash).not.toContain("Main");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across case and whitespace differences", () => {
    expect(hashNormalizedAddress("123 Main St, Boynton Beach, FL")).toBe(
      hashNormalizedAddress("  123  MAIN st,  boynton beach, fl  "),
    );
  });

  it("produces different hashes for different addresses", () => {
    expect(
      hashNormalizedAddress("123 Main St, Boynton Beach, FL"),
    ).not.toBe(hashNormalizedAddress("125 Main St, Boynton Beach, FL"));
  });

  it("is distinct from hashIp for the same input string", () => {
    // The bucket prefix in hmacHex prevents an attacker from comparing
    // hashIp('foo') vs hashNormalizedAddress('foo') and finding a match.
    expect(hashIp("foo")).not.toBe(hashNormalizedAddress("foo"));
  });
});
