// Public types for the rate limiter foundation.

export type ActionLimitConfig = {
  windowSeconds: number;
  maxPerIp: number;
  maxPerAddress?: number;
};

export type CheckRateLimitInput = {
  actionKey: string;
  ipHash: string;
  addressHash?: string | null;
};

export type RecordRateLimitInput = {
  actionKey: string;
  ipHash: string;
  addressHash?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AllowedResult = {
  allowed: true;
  remaining: number;
  resetAt: string; // ISO timestamp
  limit: number;
  windowSeconds: number;
};

export type BlockedReason = "ip_limit" | "address_limit";

export type BlockedResult = {
  allowed: false;
  reason: BlockedReason;
  retryAfterSeconds: number;
  resetAt: string; // ISO timestamp
  limit: number;
  windowSeconds: number;
};

export type CheckOutcome = AllowedResult | BlockedResult;

export type RateLimitErrorCode =
  | "UNKNOWN_ACTION"
  | "INVALID_INPUT"
  | "DB_ERROR"
  | "HASH_FAILED"
  | "CLIENT_INIT_FAILED"
  | (string & {});

export type RateLimitError = {
  code: RateLimitErrorCode;
  message: string;
  details?: unknown;
};

export type RateLimitCheckResult =
  | { ok: true; check: CheckOutcome }
  | { ok: false; error: RateLimitError };

export type RateLimitRecordResult =
  | { ok: true; eventId: string }
  | { ok: false; error: RateLimitError };
