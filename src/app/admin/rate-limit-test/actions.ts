"use server";

import { headers } from "next/headers";
import { createClient } from "@/core/auth/server";
import {
  checkRateLimit,
  getActionLimitConfig,
  getClientIpFromHeaders,
  hashIp,
  hashNormalizedAddress,
  listActionKeys,
  recordRateLimitEvent,
  type CheckOutcome,
} from "@/core/rate-limiter";

export type RateLimitTestResult =
  | {
      ok: true;
      data: {
        actionKey: string;
        addressUsed: string | null;
        ipDisplay: string;
        ipHashPrefix: string;
        addressHashPrefix: string | null;
        check: CheckOutcome;
        recorded: boolean;
        recordError: { code: string; message: string } | null;
      };
    }
  | { ok: false; error: { code: string; message: string } };

const SHARED_INTRO = "Admin must be logged in to use the rate-limit test.";

// Server action: auth-gate, hash IP/address, check, then (if allowed)
// record. Returns a structured result for the client to render. Writes
// to rate_limit_events only — never touches business tables.
export async function checkAndRecordTestAction(input: {
  actionKey: string;
  address: string;
}): Promise<RateLimitTestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: SHARED_INTRO },
    };
  }

  const knownKeys = listActionKeys();
  if (!knownKeys.includes(input.actionKey)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ACTION",
        message: `actionKey must be one of: ${knownKeys.join(", ")}`,
      },
    };
  }

  const config = getActionLimitConfig(input.actionKey);
  if (!config) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ACTION",
        message: `No config for ${input.actionKey}.`,
      },
    };
  }

  const requestHeaders = await headers();
  const ipRaw = getClientIpFromHeaders(requestHeaders) ?? "0.0.0.0";
  const ipHash = hashIp(ipRaw);

  const addressTrimmed = input.address.trim();
  const addressUsed = addressTrimmed.length > 0 ? addressTrimmed : null;
  const addressHash =
    addressUsed && config.maxPerAddress !== undefined
      ? hashNormalizedAddress(addressUsed)
      : null;

  const check = await checkRateLimit({
    actionKey: input.actionKey,
    ipHash,
    addressHash,
  });
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  let recorded = false;
  let recordError: { code: string; message: string } | null = null;
  if (check.check.allowed) {
    const record = await recordRateLimitEvent({
      actionKey: input.actionKey,
      ipHash,
      addressHash,
      metadata: { source: "admin_rate_limit_test", user_id: user.id },
    });
    if (record.ok) {
      recorded = true;
    } else {
      recordError = { code: record.error.code, message: record.error.message };
    }
  }

  return {
    ok: true,
    data: {
      actionKey: input.actionKey,
      addressUsed,
      ipDisplay: ipRaw,
      ipHashPrefix: ipHash.slice(0, 12) + "…",
      addressHashPrefix: addressHash ? addressHash.slice(0, 12) + "…" : null,
      check: check.check,
      recorded,
      recordError,
    },
  };
}
