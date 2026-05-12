import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getActionLimitConfig } from "./config";
import { computeCheckOutcome } from "./compute";
import type {
  CheckRateLimitInput,
  RateLimitCheckResult,
} from "./types";

// Check the rate limit for the given action. Read-only — does NOT
// record the event. Callers should call recordRateLimitEvent after a
// successful action (so failed/blocked attempts don't count against
// the bucket).
//
// Service-role only. RLS on rate_limit_events denies anon and
// authenticated, so this lookup must run with elevated privs.
export async function checkRateLimit(
  input: CheckRateLimitInput,
): Promise<RateLimitCheckResult> {
  const config = getActionLimitConfig(input.actionKey);
  if (!config) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ACTION",
        message: `No rate-limit config for action "${input.actionKey}".`,
      },
    };
  }

  if (!input.ipHash || input.ipHash.length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "ipHash is required." },
    };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Service-role Supabase client init failed.",
      },
    };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);
  const windowStartIso = windowStart.toISOString();

  // IP bucket: count + oldest within window
  const ipQuery = await supabase
    .from("rate_limit_events")
    .select("created_at", { count: "exact" })
    .eq("action_key", input.actionKey)
    .eq("ip_hash", input.ipHash)
    .gte("created_at", windowStartIso)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ipQuery.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: ipQuery.error.message },
    };
  }

  const ipCount = ipQuery.count ?? 0;
  const oldestIpEventAt = ipQuery.data?.[0]?.created_at
    ? new Date(ipQuery.data[0].created_at)
    : null;

  // Address bucket (only if both the action has a per-address limit
  // AND the caller supplied an address hash).
  let addressCount: number | null = null;
  let oldestAddressEventAt: Date | null = null;

  if (config.maxPerAddress !== undefined && input.addressHash) {
    const addrQuery = await supabase
      .from("rate_limit_events")
      .select("created_at", { count: "exact" })
      .eq("action_key", input.actionKey)
      .eq("normalized_address_hash", input.addressHash)
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: true })
      .limit(1);

    if (addrQuery.error) {
      return {
        ok: false,
        error: { code: "DB_ERROR", message: addrQuery.error.message },
      };
    }
    addressCount = addrQuery.count ?? 0;
    oldestAddressEventAt = addrQuery.data?.[0]?.created_at
      ? new Date(addrQuery.data[0].created_at)
      : null;
  }

  const outcome = computeCheckOutcome({
    config,
    ipCount,
    oldestIpEventAt,
    addressCount,
    oldestAddressEventAt,
    now,
  });

  return { ok: true, check: outcome };
}
