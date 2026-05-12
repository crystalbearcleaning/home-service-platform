import { createHmac } from "node:crypto";

// Phase 1 fallback salt — picked so the hashes are stable across module
// reloads in dev. Production deployments should set RATE_LIMIT_HASH_SALT
// to an environment-specific secret (rotation is fine; old hashes simply
// stop matching the new ones, which only affects in-flight rate-limit
// windows for at most ~10 minutes per the configured limits).
const DEFAULT_SALT = "home-service-platform.rate-limit.phase1";

function getSalt(): string {
  const fromEnv = process.env.RATE_LIMIT_HASH_SALT;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_SALT;
}

function hmacHex(value: string): string {
  return createHmac("sha256", getSalt()).update(value).digest("hex");
}

// Normalize an IP for hashing. Lowercase (matters for IPv6),
// trim whitespace. Strip an obvious "::ffff:" IPv4-mapped IPv6 prefix
// so a request seen as both v4 and v6 hashes the same way.
function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

// Normalize an address-like string the same way matchServiceArea
// normalizes city names — lowercase, trim, collapse whitespace.
function normalizeAddressForHash(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hashIp(rawIp: string): string {
  return hmacHex(`ip:${normalizeIp(rawIp)}`);
}

export function hashNormalizedAddress(rawAddress: string): string {
  return hmacHex(`addr:${normalizeAddressForHash(rawAddress)}`);
}

// Sentinel for callers that can't determine a client IP (e.g., test
// scripts). Lets the rate limiter still gate the action under a
// well-known hash bucket instead of silently allowing everything.
export const UNKNOWN_IP_HASH = hashIp("0.0.0.0");
