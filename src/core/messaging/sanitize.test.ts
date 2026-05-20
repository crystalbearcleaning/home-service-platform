import { describe, expect, it } from "vitest";
import { sanitizeProviderResponse } from "./sanitize";

describe("sanitizeProviderResponse", () => {
  it("returns an empty safe shape for non-objects", () => {
    expect(sanitizeProviderResponse(null)).toEqual({
      providerMessageId: null,
      status: null,
      echo: {},
    });
    expect(sanitizeProviderResponse("oops")).toEqual({
      providerMessageId: null,
      status: null,
      echo: {},
    });
    expect(sanitizeProviderResponse([1, 2, 3])).toEqual({
      providerMessageId: null,
      status: null,
      echo: {},
    });
  });

  it("picks messageId from messageId / message_id / msgId / id in priority order", () => {
    expect(sanitizeProviderResponse({ messageId: "m1", id: "x" }).providerMessageId).toBe("m1");
    expect(sanitizeProviderResponse({ message_id: "m2", id: "x" }).providerMessageId).toBe("m2");
    expect(sanitizeProviderResponse({ id: "m3" }).providerMessageId).toBe("m3");
  });

  it("picks status from status / deliveryStatus / state", () => {
    expect(sanitizeProviderResponse({ status: "sent" }).status).toBe("sent");
    expect(sanitizeProviderResponse({ state: "queued" }).status).toBe("queued");
  });

  it("strips Authorization / api_key / token shaped keys from echo", () => {
    const safe = sanitizeProviderResponse({
      id: "m1",
      status: "ok",
      authorization: "Bearer secret",
      apiKey: "k",
      api_key: "k",
      token: "t",
      secret: "s",
    });
    expect(safe.echo).toEqual({ id: "m1", status: "ok" });
    expect(JSON.stringify(safe)).not.toContain("Bearer secret");
    expect(JSON.stringify(safe)).not.toMatch(/api[_]?key/i);
    expect(JSON.stringify(safe)).not.toMatch(/token/i);
  });

  it("drops nested objects / arrays from echo (whitelisted scalars only)", () => {
    const safe = sanitizeProviderResponse({
      id: "m1",
      status: "ok",
      from: { phone: "+1" }, // nested object — drop
      to: ["a", "b"], // array — drop
    });
    expect(safe.echo.id).toBe("m1");
    expect(safe.echo.status).toBe("ok");
    expect(safe.echo.from).toBeUndefined();
    expect(safe.echo.to).toBeUndefined();
  });

  it("ignores keys not on the echo whitelist", () => {
    const safe = sanitizeProviderResponse({
      id: "m1",
      arbitrary: "value",
      anotherField: 42,
    });
    expect(safe.echo.id).toBe("m1");
    expect(safe.echo.arbitrary).toBeUndefined();
    expect(safe.echo.anotherField).toBeUndefined();
  });

  it("truncates long string values", () => {
    const long = "x".repeat(500);
    const safe = sanitizeProviderResponse({ id: long });
    expect(safe.providerMessageId?.length).toBe(120);
    expect(safe.echo.id?.toString().length).toBe(120);
  });

  it("preserves conversationId at the top level", () => {
    const safe = sanitizeProviderResponse({
      id: "m1",
      conversationId: "c1",
    });
    expect(safe.conversationId).toBe("c1");
    expect(safe.echo.conversationId).toBe("c1");
  });

  it("rejects message ids that look like secrets", () => {
    const safe = sanitizeProviderResponse({ id: "Bearer abc.def" });
    expect(safe.providerMessageId).toBeNull();
  });
});
