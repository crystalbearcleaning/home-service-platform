import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";

// Read quote_expiration_days from business_settings. Returns the raw
// jsonb value — callers clamp/default via resolveExpirationDays so the
// fallback chain stays in one place.

export type LoadQuoteExpirationResult =
  | { ok: true; rawValue: unknown }
  | { ok: false; error: { code: string; message: string } };

export async function loadQuoteExpirationSetting(
  businessId: string,
): Promise<LoadQuoteExpirationResult> {
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
    .from("business_settings")
    .select("value")
    .eq("business_id", businessId)
    .eq("key", "quote_expiration_days")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }

  return { ok: true, rawValue: data?.value ?? null };
}
