import "server-only";

import { cookies } from "next/headers";

// =========================================================================
// Phase 6D workspace selection cookie.
//
// Stores the user's currently-selected business id so the admin shell
// can render under that workspace even when they have memberships in
// multiple workspaces (today: Crystal Bear + Crystal Bear Simulation).
//
// Cookie is HTTP-only + scoped to /admin. It only carries a business id;
// authorization is re-checked server-side every request against
// business_memberships (RLS already prevents cross-workspace reads).
// =========================================================================

export const SELECTED_BUSINESS_COOKIE = "admin_active_business_id";

// Pure validation — kept here (not the cookies layer) so tests can call
// it without `next/headers`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidBusinessIdCandidate(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export async function readSelectedBusinessCookie(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SELECTED_BUSINESS_COOKIE)?.value ?? null;
  if (!raw) return null;
  return isValidBusinessIdCandidate(raw) ? raw : null;
}

export async function writeSelectedBusinessCookie(
  businessId: string,
): Promise<void> {
  if (!isValidBusinessIdCandidate(businessId)) return;
  const store = await cookies();
  store.set(SELECTED_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    // 30 days. Re-selection happens any time the user uses the switcher.
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSelectedBusinessCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SELECTED_BUSINESS_COOKIE);
}
