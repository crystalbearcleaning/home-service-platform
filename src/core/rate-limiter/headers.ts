// Helpers for extracting a client IP from request headers in Server
// Actions / Route Handlers. Pure functions — accept a Headers-like
// object so they're unit-testable without next/headers.

export type HeadersLike = {
  get(name: string): string | null;
};

// Order of precedence matches what most CDNs / reverse proxies set:
//   1. cf-connecting-ip (Cloudflare)
//   2. x-real-ip (Nginx etc.)
//   3. x-forwarded-for (Vercel, most others — comma-separated list, take first)
//   4. x-client-ip (fallback)
export function getClientIpFromHeaders(
  headers: HeadersLike,
): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf && cf.trim().length > 0) return cf.trim();

  const real = headers.get("x-real-ip");
  if (real && real.trim().length > 0) return real.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first && first.length > 0) return first;
  }

  const xClient = headers.get("x-client-ip");
  if (xClient && xClient.trim().length > 0) return xClient.trim();

  return null;
}
