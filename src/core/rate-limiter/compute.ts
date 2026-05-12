import type {
  ActionLimitConfig,
  AllowedResult,
  BlockedResult,
  CheckOutcome,
} from "./types";

// Pure helper. Given the row counts the DB layer has already fetched
// (plus the oldest event in each bucket for accurate retryAfter
// computation), produce the discriminated check outcome.
//
// Separating this from the DB call lets us unit-test every branch
// without spinning up Postgres.

export type ComputeInput = {
  config: ActionLimitConfig;
  ipCount: number;
  oldestIpEventAt: Date | null;
  // Pass nulls when no address hash was supplied OR when the action has
  // no per-address limit.
  addressCount: number | null;
  oldestAddressEventAt: Date | null;
  now: Date;
};

export function computeCheckOutcome(input: ComputeInput): CheckOutcome {
  const { config, ipCount, oldestIpEventAt, addressCount, oldestAddressEventAt, now } = input;
  const windowMs = config.windowSeconds * 1000;

  // IP limit takes precedence so a single abusive IP can't cycle
  // through addresses to keep hammering.
  if (ipCount >= config.maxPerIp) {
    return buildBlocked(
      config,
      config.maxPerIp,
      "ip_limit",
      oldestIpEventAt,
      windowMs,
      now,
    );
  }

  const addressLimitActive =
    config.maxPerAddress !== undefined && addressCount !== null;

  if (
    addressLimitActive &&
    addressCount !== null &&
    config.maxPerAddress !== undefined &&
    addressCount >= config.maxPerAddress
  ) {
    return buildBlocked(
      config,
      config.maxPerAddress,
      "address_limit",
      oldestAddressEventAt,
      windowMs,
      now,
    );
  }

  return buildAllowed(
    config,
    ipCount,
    addressCount,
    windowMs,
    now,
  );
}

function buildAllowed(
  config: ActionLimitConfig,
  ipCount: number,
  addressCount: number | null,
  windowMs: number,
  now: Date,
): AllowedResult {
  const ipRemaining = Math.max(0, config.maxPerIp - ipCount);
  const addressRemaining =
    config.maxPerAddress !== undefined && addressCount !== null
      ? Math.max(0, config.maxPerAddress - addressCount)
      : Number.POSITIVE_INFINITY;

  // Report the tighter of the two budgets so callers can show a useful
  // "remaining" hint.
  const remaining = Number.isFinite(addressRemaining)
    ? Math.min(ipRemaining, addressRemaining)
    : ipRemaining;

  return {
    allowed: true,
    remaining,
    resetAt: new Date(now.getTime() + windowMs).toISOString(),
    limit: config.maxPerIp,
    windowSeconds: config.windowSeconds,
  };
}

function buildBlocked(
  config: ActionLimitConfig,
  limit: number,
  reason: BlockedResult["reason"],
  oldestEventAt: Date | null,
  windowMs: number,
  now: Date,
): BlockedResult {
  const retryAfterMs = oldestEventAt
    ? Math.max(0, oldestEventAt.getTime() + windowMs - now.getTime())
    : windowMs;

  return {
    allowed: false,
    reason,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    resetAt: new Date(now.getTime() + retryAfterMs).toISOString(),
    limit,
    windowSeconds: config.windowSeconds,
  };
}
