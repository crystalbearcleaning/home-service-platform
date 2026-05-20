// Provider-agnostic SMS adapter interface. The automation engine + the
// internal SMS test page speak this interface; only the per-provider
// modules in ./providers/ know their endpoint shapes.
//
// Future providers (Twilio, etc.) implement SmsProviderAdapter and the
// resolver below routes by provider_key.

import { sendSmsViaGoHighLevel } from "./providers/gohighlevel";
import type {
  ProviderKey,
  SmsSendInput,
  SmsSendResult,
} from "./types";

export type SmsProviderAdapter = {
  providerKey: ProviderKey;
  sendSms: (input: SmsSendInput) => Promise<SmsSendResult>;
};

// Single source of truth for "which adapter handles which provider_key".
const ADAPTERS: Record<ProviderKey, SmsProviderAdapter> = {
  gohighlevel: {
    providerKey: "gohighlevel",
    sendSms: sendSmsViaGoHighLevel,
  },
};

export function getSmsProviderAdapter(
  providerKey: ProviderKey,
): SmsProviderAdapter {
  return ADAPTERS[providerKey];
}
