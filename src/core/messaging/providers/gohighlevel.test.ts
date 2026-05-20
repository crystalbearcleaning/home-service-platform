import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractContactObject,
  pickContactId,
  sendSmsViaGoHighLevel,
} from "./gohighlevel";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });
}
function setGhlEnv() {
  process.env.GHL_API_KEY = "test_key_value";
  process.env.GHL_LOCATION_ID = "loc_1";
  process.env.GHL_FROM_PHONE_NUMBER = "+15550001111";
  delete process.env.GHL_BASE_URL;
}

// We test only the no-fetch branches here: input validation + MISSING_CONFIG.
// Live network calls against GHL are intentionally NOT exercised in the
// automated suite — they'd leak quota, require real credentials, and be
// non-deterministic. The manual /admin/testing/message-sms page exercises
// the end-to-end path against the real provider when GHL env is set.

const ENV_KEYS = [
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "GHL_FROM_PHONE_NUMBER",
  "GHL_BASE_URL",
];

function clearGhlEnv() {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

describe("sendSmsViaGoHighLevel — pre-flight", () => {
  const originalEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    clearGhlEnv();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    vi.restoreAllMocks();
  });

  it("returns INVALID_INPUT when phone is not E.164", async () => {
    const result = await sendSmsViaGoHighLevel({ to: "5551234", body: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("returns INVALID_INPUT when body is empty / whitespace", async () => {
    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("returns MISSING_CONFIG and never calls fetch when env is unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called when config missing");
    });

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hello",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_CONFIG");
      expect(result.error.message).toMatch(/Missing: /);
      // Error message lists missing keys but never an actual value.
      expect(result.error.message).not.toMatch(/Bearer/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pickContactId", () => {
  it("returns the top-level contactId / contact_id / id", () => {
    expect(pickContactId({ contactId: "c1" })).toBe("c1");
    expect(pickContactId({ contact_id: "c2" })).toBe("c2");
    expect(pickContactId({ id: "c3" })).toBe("c3");
  });
  it("returns the nested contact.id when present", () => {
    expect(pickContactId({ contact: { id: "nested" } })).toBe("nested");
  });
  it("returns null for non-object inputs", () => {
    expect(pickContactId(null)).toBeNull();
    expect(pickContactId("oops")).toBeNull();
    expect(pickContactId(42)).toBeNull();
  });
  it("returns null when no usable id is present", () => {
    expect(pickContactId({ unrelated: "x" })).toBeNull();
  });
});

describe("sendSmsViaGoHighLevel — diagnostics on HTTP errors", () => {
  const originalEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    clearGhlEnv();
    setGhlEnv();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    vi.restoreAllMocks();
  });

  it("maps 401 on contact upsert to UPSTREAM_UNAUTHORIZED with step=contact_upsert", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(401, { message: "Invalid token", token: "secret-xyz" }),
      );

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/contacts/upsert");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UPSTREAM_UNAUTHORIZED");
      expect(result.error.step).toBe("contact_upsert");
      expect(result.error.httpStatus).toBe(401);
      // Sanitized response: VALUES like "secret-xyz" or a Bearer token
      // must never appear in the serialized raw. Key names ("token",
      // "authorization") are allowed — they're not secret.
      const serialized = JSON.stringify(result.error.raw);
      expect(serialized).not.toMatch(/secret-xyz/);
      expect(serialized).not.toMatch(/Bearer\s+\S/);
      expect(result.error.raw?.step).toBe("contact_upsert");
      expect(result.error.raw?.httpStatus).toBe(401);
    }
  });

  it("maps 403 on contact upsert to UPSTREAM_UNAUTHORIZED", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(403, { message: "forbidden" }),
    );

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UPSTREAM_UNAUTHORIZED");
      expect(result.error.step).toBe("contact_upsert");
      expect(result.error.httpStatus).toBe(403);
    }
  });

  it("maps 401 on send_message to UPSTREAM_UNAUTHORIZED with step=send_message", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // contact upsert succeeds
      .mockResolvedValueOnce(jsonResponse(200, { contact: { id: "c1" } }))
      // message send returns 401
      .mockResolvedValueOnce(jsonResponse(401, { message: "no permission" }));

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain(
      "/conversations/messages",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UPSTREAM_UNAUTHORIZED");
      expect(result.error.step).toBe("send_message");
      expect(result.error.httpStatus).toBe(401);
    }
  });

  it("scrubs bearer / api_key shapes from the error body snippet", async () => {
    const dirty =
      'something Bearer eyJhbG.abc.def failed apiKey="sk_live_abcdef"';
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      textResponse(401, dirty),
    );

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const snippet = result.error.raw?.snippet ?? "";
      expect(snippet).toContain("[redacted]");
      expect(snippet).not.toContain("eyJhbG.abc.def");
      expect(snippet).not.toContain("sk_live_abcdef");
    }
  });

  it("never includes Authorization in outgoing headers… but if upstream echoes one back, sanitization strips it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(401, {
        authorization: "Bearer leaked",
        api_key: "leaked",
        status: "denied",
      }),
    );

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = JSON.stringify(result.error.raw);
      // Values are redacted; key names are allowed to remain.
      expect(serialized).not.toMatch(/Bearer leaked/);
      expect(serialized).not.toMatch(/"api_key"\s*:\s*"leaked"/i);
      expect(serialized).not.toContain("leaked");
      // status is on the safe whitelist
      expect(result.error.raw?.status).toBe("denied");
    }
  });

  it("non-401 HTTP errors map to HTTP_ERROR with step + status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(500, { message: "boom" }),
    );

    const result = await sendSmsViaGoHighLevel({
      to: "+15551234567",
      body: "hi",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HTTP_ERROR");
      expect(result.error.step).toBe("contact_upsert");
      expect(result.error.httpStatus).toBe(500);
    }
  });
});

describe("extractContactObject", () => {
  it("returns the inner contact object when present", () => {
    expect(extractContactObject({ contact: { id: "x" } })).toEqual({
      id: "x",
    });
  });
  it("returns the raw object when no contact wrapper exists", () => {
    expect(extractContactObject({ id: "x" })).toEqual({ id: "x" });
  });
  it("returns raw value when input is not an object", () => {
    expect(extractContactObject(null)).toBeNull();
    expect(extractContactObject("oops")).toBe("oops");
  });
});
