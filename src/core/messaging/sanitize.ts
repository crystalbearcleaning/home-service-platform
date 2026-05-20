// Pure helpers that take a raw provider response (JSON body) and project
// it into the SafeProviderResponse shape we persist on notification_logs.
//
// The provider response MUST be sanitized before:
//   - returning to the caller of sendSms
//   - storing in notification_logs.provider_response
//   - rendering in the admin test page
//
// Rules:
//   - never echo auth headers or token-like values
//   - never echo nested objects / arrays — flatten to primitives only
//   - whitelist known-safe scalar keys; drop everything else
//   - cap echoed string length so a malformed response can't bloat the
//     notification_logs row

import type { SafeProviderResponse } from "./types";

// Selected fields from any provider response that are safe to echo.
const ECHO_WHITELIST = new Set<string>([
  "id",
  "messageId",
  "message_id",
  "msgId",
  "msg_id",
  "conversationId",
  "conversation_id",
  "status",
  "type",
  "channel",
  "to",
  "from",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
]);

// Anything matching this regex is treated as secret-shaped and never
// echoed — even if it appears under a whitelisted key. Belt + suspenders.
const SECRET_PATTERN =
  /(authorization|apikey|api_key|secret|token|bearer)/i;

const MAX_ECHO_STRING_LENGTH = 120;

function coerceScalar(
  key: string,
  value: unknown,
): string | number | boolean | null {
  if (SECRET_PATTERN.test(key)) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (SECRET_PATTERN.test(value)) return null;
    return value.length > MAX_ECHO_STRING_LENGTH
      ? value.slice(0, MAX_ECHO_STRING_LENGTH)
      : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  // Drop arrays, objects, functions, symbols.
  return null;
}

function pickFirstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0 && !SECRET_PATTERN.test(v)) {
      return v.length > MAX_ECHO_STRING_LENGTH
        ? v.slice(0, MAX_ECHO_STRING_LENGTH)
        : v;
    }
  }
  return null;
}

export function sanitizeProviderResponse(raw: unknown): SafeProviderResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { providerMessageId: null, status: null, echo: {} };
  }
  const obj = raw as Record<string, unknown>;

  const providerMessageId = pickFirstString(obj, [
    "messageId",
    "message_id",
    "msgId",
    "msg_id",
    "id",
  ]);
  const status = pickFirstString(obj, ["status", "deliveryStatus", "state"]);
  const conversationId = pickFirstString(obj, [
    "conversationId",
    "conversation_id",
  ]);

  const echo: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!ECHO_WHITELIST.has(key)) continue;
    const coerced = coerceScalar(key, value);
    if (coerced === null && value !== null) continue;
    echo[key] = coerced;
  }

  return {
    providerMessageId,
    status,
    conversationId,
    echo,
  };
}
