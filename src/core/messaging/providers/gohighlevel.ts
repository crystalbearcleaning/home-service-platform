import "server-only";

// =========================================================================
// GoHighLevel SMS provider adapter — Phase 3C
//
// This is the ONLY place in the codebase that knows GHL endpoint shapes,
// headers, or response formats. The rest of the app speaks the
// provider-agnostic SmsProviderAdapter interface from ../provider.ts.
//
// Assumptions (documented because the public GHL surface evolves):
//
// 1. The adapter targets the **LeadConnector v2** API at
//    https://services.leadconnectorhq.com (configurable via GHL_BASE_URL).
//    v2 requires a contact id to send a conversation message — there is
//    no "send to phone" endpoint that accepts a raw E.164 number directly.
//
// 2. We therefore perform a two-call send labelled by ProviderStep:
//      a) "contact_upsert" — POST /contacts/upsert
//      b) "send_message"   — POST /conversations/messages
//
// 3. Required headers on every request:
//      Authorization: Bearer <GHL_API_KEY>
//      Version: 2021-04-15
//      Accept: application/json
//      Content-Type: application/json
//
// 4. If the user's GHL setup needs a different endpoint, body shape, or
//    version header, edit this file — none of the engine, log writer, or
//    admin UI need to change.
//
// The adapter never throws. It returns a discriminated SmsSendResult.
// API keys, bearer tokens, and raw response headers are never echoed.
// Every error path is tagged with `step` so /admin/testing/message-sms
// can show *which* call failed without re-running the request.
// =========================================================================

import { resolveGhlConfig, GHL_REQUIRED_ENV_KEYS } from "../config";
import { sanitizeProviderResponse } from "../sanitize";
import type {
  ProviderStep,
  SafeProviderResponse,
  SmsSendInput,
  SmsSendResult,
} from "../types";

const REQUEST_HEADERS_BASE = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Version: "2021-04-15",
} as const;

const E164 = /^\+[1-9][0-9]{6,14}$/;

const STEP_CONTACT_UPSERT: ProviderStep = "contact_upsert";
const STEP_SEND_MESSAGE: ProviderStep = "send_message";

export async function sendSmsViaGoHighLevel(
  input: SmsSendInput,
): Promise<SmsSendResult> {
  // 1. Validate the call-site input before reading any env.
  if (!input || typeof input.to !== "string" || !E164.test(input.to)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Recipient phone must be an E.164 string (e.g. +15551234567).",
      },
    };
  }
  const body = (input.body ?? "").trim();
  if (body.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "SMS body must be a non-empty string.",
      },
    };
  }

  // 2. Resolve env → typed config. Returns MISSING_CONFIG without ever
  //    initiating a network call when keys are absent.
  const resolved = resolveGhlConfig(process.env);
  if (!resolved.ok) {
    return {
      ok: false,
      error: {
        code: "MISSING_CONFIG",
        message: `GoHighLevel is not configured. Missing: ${resolved.missingKeys.join(", ")}.`,
        details: {
          missingKeys: resolved.missingKeys,
          requiredKeys: GHL_REQUIRED_ENV_KEYS,
        },
      },
    };
  }
  const { apiKey, locationId, fromPhoneNumber, baseUrl } = resolved.config;

  // 3. Step A — upsert the contact so we have a contactId for the message.
  let contactId: string | null = null;
  try {
    const upsertResp = await fetch(`${baseUrl}/contacts/upsert`, {
      method: "POST",
      headers: {
        ...REQUEST_HEADERS_BASE,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        locationId,
        phone: input.to,
      }),
    });

    if (upsertResp.status === 401 || upsertResp.status === 403) {
      return await buildHttpError({
        resp: upsertResp,
        step: STEP_CONTACT_UPSERT,
        code: "UPSTREAM_UNAUTHORIZED",
        message:
          "GoHighLevel rejected the API key (401/403) during contact upsert.",
      });
    }
    if (!upsertResp.ok) {
      return await buildHttpError({
        resp: upsertResp,
        step: STEP_CONTACT_UPSERT,
        code: "HTTP_ERROR",
        message: `GoHighLevel contacts/upsert returned ${upsertResp.status}.`,
      });
    }

    const json = await safeReadJson(upsertResp);
    if (json === null) {
      return {
        ok: false,
        error: {
          code: "INVALID_RESPONSE",
          message: "GoHighLevel contacts/upsert returned a non-JSON body.",
          step: STEP_CONTACT_UPSERT,
          httpStatus: upsertResp.status,
          raw: emptyRaw(STEP_CONTACT_UPSERT, upsertResp.status, null),
        },
      };
    }

    const safeContactEcho = sanitizeProviderResponse(extractContactObject(json));
    contactId = pickContactId(json);
    if (!contactId) {
      return {
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message:
            "GoHighLevel contacts/upsert succeeded but no contact id was returned.",
          step: STEP_CONTACT_UPSERT,
          httpStatus: upsertResp.status,
          raw: {
            ...safeContactEcho,
            step: STEP_CONTACT_UPSERT,
            httpStatus: upsertResp.status,
          },
        },
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error
            ? `Network failure calling GoHighLevel contacts/upsert: ${err.message}`
            : "Network failure calling GoHighLevel contacts/upsert.",
        step: STEP_CONTACT_UPSERT,
        raw: emptyRaw(STEP_CONTACT_UPSERT, undefined, null),
      },
    };
  }

  // 4. Step B — send the SMS to the resolved contact.
  try {
    const sendResp = await fetch(`${baseUrl}/conversations/messages`, {
      method: "POST",
      headers: {
        ...REQUEST_HEADERS_BASE,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        type: "SMS",
        contactId,
        message: body,
        fromNumber: fromPhoneNumber,
      }),
    });

    if (sendResp.status === 401 || sendResp.status === 403) {
      return await buildHttpError({
        resp: sendResp,
        step: STEP_SEND_MESSAGE,
        code: "UPSTREAM_UNAUTHORIZED",
        message:
          "GoHighLevel rejected the API key (401/403) during message send.",
      });
    }
    if (!sendResp.ok) {
      return await buildHttpError({
        resp: sendResp,
        step: STEP_SEND_MESSAGE,
        code: "HTTP_ERROR",
        message: `GoHighLevel conversations/messages returned ${sendResp.status}.`,
      });
    }

    const json = await safeReadJson(sendResp);
    if (json === null) {
      return {
        ok: false,
        error: {
          code: "INVALID_RESPONSE",
          message:
            "GoHighLevel conversations/messages returned a non-JSON body.",
          step: STEP_SEND_MESSAGE,
          httpStatus: sendResp.status,
          raw: emptyRaw(STEP_SEND_MESSAGE, sendResp.status, null),
        },
      };
    }

    const safe = sanitizeProviderResponse(json);
    return {
      ok: true,
      providerMessageId: safe.providerMessageId,
      raw: {
        ...safe,
        step: STEP_SEND_MESSAGE,
        httpStatus: sendResp.status,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error
            ? `Network failure calling GoHighLevel conversations/messages: ${err.message}`
            : "Network failure calling GoHighLevel conversations/messages.",
        step: STEP_SEND_MESSAGE,
        raw: emptyRaw(STEP_SEND_MESSAGE, undefined, null),
      },
    };
  }
}

// -------------------------------------------------------------------------
// Helpers — exported only for unit testing.
// -------------------------------------------------------------------------

export function pickContactId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // Most common shapes seen in the LeadConnector v2 docs.
  const directKeys = ["contactId", "contact_id", "id"];
  for (const k of directKeys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Nested contact object.
  const nested = obj.contact;
  if (nested && typeof nested === "object") {
    return pickContactId(nested);
  }
  return null;
}

// Reduce an upsert response down to just the contact subset before
// sanitizing. We never sanitize the whole top-level object because GHL
// includes location metadata + traceIds we don't need persisted.
export function extractContactObject(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.contact && typeof obj.contact === "object") return obj.contact;
  return obj;
}

// Centralised builder for HTTP error responses. Reads the response body
// once, sanitizes it through sanitizeProviderResponse (so auth-shaped
// keys / values are dropped), and packages a SafeProviderResponse the
// admin UI can render without leaking secrets.
async function buildHttpError(args: {
  resp: Response;
  step: ProviderStep;
  code: "UPSTREAM_UNAUTHORIZED" | "HTTP_ERROR";
  message: string;
}): Promise<SmsSendResult> {
  const text = await safeReadText(args.resp);
  const snippet = clampSnippet(text);
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const safe = sanitizeProviderResponse(parsed);
  const raw: SafeProviderResponse = {
    ...safe,
    step: args.step,
    httpStatus: args.resp.status,
    snippet,
  };
  return {
    ok: false,
    error: {
      code: args.code,
      message: args.message,
      step: args.step,
      httpStatus: args.resp.status,
      raw,
    },
  };
}

function emptyRaw(
  step: ProviderStep,
  httpStatus: number | undefined,
  snippet: string | null,
): SafeProviderResponse {
  return {
    providerMessageId: null,
    status: null,
    echo: {},
    step,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(snippet !== null ? { snippet } : {}),
  };
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

function clampSnippet(text: string): string {
  if (!text) return "";
  // Drop any obvious bearer / api-key tokens an upstream might echo
  // back in error bodies, in either text or JSON shape, then truncate.
  // We are intentionally aggressive: false-positive redactions of
  // non-secret content are harmless; leaking a real token is not.
  const scrubbed = text
    // "Bearer <token>"
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "[redacted]")
    // key=value / key: value (no quotes)
    .replace(
      /(api[_-]?key|token|secret|authorization)\s*[:=]\s*"?[A-Za-z0-9._\-]+"?/gi,
      "$1=[redacted]",
    )
    // JSON "key":"value" — quote-comma-colon shape that the no-quote
    // regex above misses.
    .replace(
      /"(api[_-]?key|token|secret|authorization)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    );
  return scrubbed.length > 200 ? scrubbed.slice(0, 200) : scrubbed;
}

async function safeReadJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}
