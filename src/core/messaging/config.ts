// Pure helpers around the GoHighLevel provider config. Takes an env-like
// record so unit tests don't need to monkey-patch process.env. The
// adapter (providers/gohighlevel.ts) is the only place that actually
// reads process.env.

import type { ProviderConfigStatus } from "./types";

// The four env-var names the GHL adapter consumes. Centralised so the
// admin UI can render presence without echoing values, and so test
// fixtures stay in lockstep with the adapter.
export const GHL_ENV_KEYS = {
  apiKey: "GHL_API_KEY",
  locationId: "GHL_LOCATION_ID",
  fromPhoneNumber: "GHL_FROM_PHONE_NUMBER",
  baseUrl: "GHL_BASE_URL",
} as const;

// Three keys are REQUIRED to send. baseUrl is optional — falls back to
// the documented LeadConnector v2 host.
export const GHL_REQUIRED_ENV_KEYS = [
  GHL_ENV_KEYS.apiKey,
  GHL_ENV_KEYS.locationId,
  GHL_ENV_KEYS.fromPhoneNumber,
] as const;

export const GHL_DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";

export type GhlConfig = {
  apiKey: string;
  locationId: string;
  fromPhoneNumber: string;
  baseUrl: string;
};

// Pure: classifies env presence into a ProviderConfigStatus. Never returns
// a value — only key names.
export function readGhlConfigStatus(
  env: Record<string, string | undefined>,
): ProviderConfigStatus {
  const missing: string[] = [];
  for (const key of GHL_REQUIRED_ENV_KEYS) {
    const v = env[key];
    if (!v || v.trim().length === 0) {
      missing.push(key);
    }
  }
  return {
    providerKey: "gohighlevel",
    configured: missing.length === 0,
    missingKeys: missing,
  };
}

// Pure: resolves a fully-populated config, or returns the missing-key
// list. Never throws.
export function resolveGhlConfig(env: Record<string, string | undefined>):
  | { ok: true; config: GhlConfig }
  | { ok: false; missingKeys: string[] } {
  const status = readGhlConfigStatus(env);
  if (!status.configured) {
    return { ok: false, missingKeys: status.missingKeys };
  }
  const baseUrlRaw = env[GHL_ENV_KEYS.baseUrl];
  const baseUrl =
    baseUrlRaw && baseUrlRaw.trim().length > 0
      ? baseUrlRaw.trim().replace(/\/+$/, "")
      : GHL_DEFAULT_BASE_URL;
  return {
    ok: true,
    config: {
      apiKey: env[GHL_ENV_KEYS.apiKey]!.trim(),
      locationId: env[GHL_ENV_KEYS.locationId]!.trim(),
      fromPhoneNumber: env[GHL_ENV_KEYS.fromPhoneNumber]!.trim(),
      baseUrl,
    },
  };
}
