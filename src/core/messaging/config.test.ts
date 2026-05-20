import { describe, expect, it } from "vitest";
import {
  GHL_DEFAULT_BASE_URL,
  GHL_REQUIRED_ENV_KEYS,
  readGhlConfigStatus,
  resolveGhlConfig,
} from "./config";

describe("readGhlConfigStatus", () => {
  it("flags all required keys as missing on empty env", () => {
    const status = readGhlConfigStatus({});
    expect(status.providerKey).toBe("gohighlevel");
    expect(status.configured).toBe(false);
    expect(status.missingKeys.sort()).toEqual(
      [...GHL_REQUIRED_ENV_KEYS].sort(),
    );
  });

  it("treats whitespace-only values as missing", () => {
    const status = readGhlConfigStatus({
      GHL_API_KEY: "   ",
      GHL_LOCATION_ID: "",
      GHL_FROM_PHONE_NUMBER: "\n",
    });
    expect(status.configured).toBe(false);
    expect(status.missingKeys.sort()).toEqual(
      [...GHL_REQUIRED_ENV_KEYS].sort(),
    );
  });

  it("reports configured=true when all three required keys are set", () => {
    const status = readGhlConfigStatus({
      GHL_API_KEY: "key",
      GHL_LOCATION_ID: "loc",
      GHL_FROM_PHONE_NUMBER: "+15551234567",
    });
    expect(status.configured).toBe(true);
    expect(status.missingKeys).toEqual([]);
  });

  it("does not require GHL_BASE_URL", () => {
    const status = readGhlConfigStatus({
      GHL_API_KEY: "k",
      GHL_LOCATION_ID: "l",
      GHL_FROM_PHONE_NUMBER: "+1",
      // GHL_BASE_URL intentionally absent
    });
    expect(status.configured).toBe(true);
    expect(status.missingKeys).not.toContain("GHL_BASE_URL");
  });
});

describe("resolveGhlConfig", () => {
  it("returns missing keys when not configured", () => {
    const result = resolveGhlConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingKeys.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the default base URL when GHL_BASE_URL is absent", () => {
    const result = resolveGhlConfig({
      GHL_API_KEY: "k",
      GHL_LOCATION_ID: "l",
      GHL_FROM_PHONE_NUMBER: "+15551234567",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.baseUrl).toBe(GHL_DEFAULT_BASE_URL);
      expect(result.config.apiKey).toBe("k");
      expect(result.config.locationId).toBe("l");
      expect(result.config.fromPhoneNumber).toBe("+15551234567");
    }
  });

  it("trims a custom base URL and strips trailing slashes", () => {
    const result = resolveGhlConfig({
      GHL_API_KEY: "k",
      GHL_LOCATION_ID: "l",
      GHL_FROM_PHONE_NUMBER: "+15551234567",
      GHL_BASE_URL: "  https://custom.example.com//  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.baseUrl).toBe("https://custom.example.com");
    }
  });
});
