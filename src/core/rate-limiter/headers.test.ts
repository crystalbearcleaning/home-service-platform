import { describe, it, expect } from "vitest";
import { getClientIpFromHeaders } from "./headers";

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe("getClientIpFromHeaders", () => {
  it("returns cf-connecting-ip when present (Cloudflare)", () => {
    expect(
      getClientIpFromHeaders(
        headers({
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.1, 203.0.113.10",
        }),
      ),
    ).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when cf is missing", () => {
    expect(
      getClientIpFromHeaders(
        headers({
          "x-real-ip": "203.0.113.11",
          "x-forwarded-for": "198.51.100.1, 203.0.113.11",
        }),
      ),
    ).toBe("203.0.113.11");
  });

  it("falls back to first entry of x-forwarded-for", () => {
    expect(
      getClientIpFromHeaders(
        headers({
          "x-forwarded-for": "203.0.113.12, 198.51.100.1",
        }),
      ),
    ).toBe("203.0.113.12");
  });

  it("falls back to x-client-ip last", () => {
    expect(
      getClientIpFromHeaders(headers({ "x-client-ip": "203.0.113.13" })),
    ).toBe("203.0.113.13");
  });

  it("returns null when no header carries an IP", () => {
    expect(getClientIpFromHeaders(headers({}))).toBeNull();
  });

  it("returns null for whitespace-only header values", () => {
    expect(
      getClientIpFromHeaders(
        headers({
          "x-forwarded-for": "   ",
          "x-real-ip": "",
        }),
      ),
    ).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(
      getClientIpFromHeaders(headers({ "cf-connecting-ip": "  203.0.113.20  " })),
    ).toBe("203.0.113.20");
  });
});
