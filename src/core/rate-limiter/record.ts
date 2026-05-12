import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getActionLimitConfig } from "./config";
import type {
  RateLimitRecordResult,
  RecordRateLimitInput,
} from "./types";

// Append a row to rate_limit_events. Call after a successful action
// (so blocked attempts don't count against the bucket).
//
// Service-role only. The rate_limit_events table has RLS enabled with
// zero policies, so anon and authenticated cannot write to it.
export async function recordRateLimitEvent(
  input: RecordRateLimitInput,
): Promise<RateLimitRecordResult> {
  // Validate the action key against the config so we don't silently
  // record events for action keys nobody can rate-limit on.
  if (!getActionLimitConfig(input.actionKey)) {
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

  const { data, error } = await supabase
    .from("rate_limit_events")
    .insert({
      action_key: input.actionKey,
      ip_hash: input.ipHash,
      normalized_address_hash: input.addressHash ?? null,
      metadata: input.metadata ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert rate_limit_events row.",
        details: error
          ? { hint: error.hint, code: error.code }
          : undefined,
      },
    };
  }

  return { ok: true, eventId: data.id };
}
