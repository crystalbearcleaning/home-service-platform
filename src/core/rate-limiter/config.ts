import type { ActionLimitConfig } from "./types";

// Phase 1 default limits. Conservative on purpose — easy to widen later
// once we see real traffic. Times are in seconds.
//
// Each action key is also used as the `action_key` column value in the
// `rate_limit_events` table.

export const phase1RateLimits: Record<string, ActionLimitConfig> = {
  // Customer-facing: address lookup. Triggered by a confirmed Google
  // place selection on the public quote page.
  "quote.address_lookup": {
    windowSeconds: 600,
    maxPerIp: 20,
    maxPerAddress: 8,
  },

  // Customer-facing: contact-form submission that creates Contact +
  // Property + Lead + Quote. The most expensive public action.
  "quote.submit_contact": {
    windowSeconds: 600,
    maxPerIp: 5,
    maxPerAddress: 3,
  },

  // Server-side autocomplete proxy (currently unused by the browser
  // widget, but reserved for plugins / scripted lookups).
  "geo.autocomplete_server": {
    windowSeconds: 600,
    maxPerIp: 30,
  },
};

export function getActionLimitConfig(
  actionKey: string,
): ActionLimitConfig | null {
  return phase1RateLimits[actionKey] ?? null;
}

export function listActionKeys(): string[] {
  return Object.keys(phase1RateLimits);
}
