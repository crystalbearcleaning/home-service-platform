// Public core rate-limiter API.
//
// Phase 1 pattern at call sites (e.g. public quote server actions):
//
//   const ip = getClientIpFromHeaders(headers) ?? '0.0.0.0';
//   const ipHash = hashIp(ip);
//   const addressHash = address ? hashNormalizedAddress(address) : null;
//   const check = await checkRateLimit({ actionKey, ipHash, addressHash });
//   if (!check.ok) return errorResponse(check.error);
//   if (!check.check.allowed) return blockedResponse(check.check);
//   // ...do the expensive work (Google, RentCast, DB writes)...
//   await recordRateLimitEvent({ actionKey, ipHash, addressHash });

export { checkRateLimit } from "./check";
export { recordRateLimitEvent } from "./record";
export { hashIp, hashNormalizedAddress, UNKNOWN_IP_HASH } from "./hashing";
export { getClientIpFromHeaders } from "./headers";
export {
  getActionLimitConfig,
  listActionKeys,
  phase1RateLimits,
} from "./config";
export { computeCheckOutcome } from "./compute";

export type {
  ActionLimitConfig,
  AllowedResult,
  BlockedResult,
  BlockedReason,
  CheckOutcome,
  CheckRateLimitInput,
  RateLimitCheckResult,
  RateLimitError,
  RateLimitErrorCode,
  RateLimitRecordResult,
  RecordRateLimitInput,
} from "./types";
