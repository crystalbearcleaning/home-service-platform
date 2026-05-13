import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Create or reuse a Contact for a public quote submission.
//
// Dedup strategy: look up by (business_id, lower(email)). If a matching
// contact exists, reuse it; otherwise insert a new one. Phone is updated
// if the existing row is missing one but the form supplied one — names
// are NOT overwritten (avoid stomping a hand-edited record).
// =========================================================================

export type CreateContactInput = {
  businessId: string;
  fullName: string;
  phone: string;
  email: string;
  source: string; // "quote_app"
  createdFromAppSurfaceId: string;
  createdFromPluginKey: string;
};

export type CreateContactResult =
  | { ok: true; contactId: string; reused: boolean }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

function deriveNames(fullName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const first = parts[0] ?? null;
  if (parts.length === 1) return { firstName: first, lastName: null };
  return {
    firstName: first,
    lastName: parts.slice(1).join(" "),
  };
}

export async function createOrReuseContact(
  input: CreateContactInput,
): Promise<CreateContactResult> {
  if (!input.businessId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "businessId is required." },
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

  const email = input.email.trim().toLowerCase();

  const existing = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("business_id", input.businessId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: existing.error.message },
    };
  }

  if (existing.data) {
    // Backfill phone if the stored row has none.
    if (!existing.data.phone && input.phone) {
      await supabase
        .from("contacts")
        .update({ phone: input.phone })
        .eq("id", existing.data.id);
    }
    return { ok: true, contactId: existing.data.id, reused: true };
  }

  const { firstName, lastName } = deriveNames(input.fullName);

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      business_id: input.businessId,
      full_name: input.fullName.trim(),
      first_name: firstName,
      last_name: lastName,
      phone: input.phone.trim(),
      email,
      source: input.source,
      created_from_app_surface_id: input.createdFromAppSurfaceId,
      created_from_plugin_key: input.createdFromPluginKey,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert contact row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, contactId: data.id, reused: false };
}
