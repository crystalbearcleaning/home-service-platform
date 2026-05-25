import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  diffContactEdit,
  validateContactEdit,
  type ContactDiff,
  type ContactEditInput,
} from "./validate";

// Server-only helper: update the editable fields on a contact
// (full_name / phone / email). Verifies business ownership.
//
// Returns the validated post-update values + a diff of what actually
// changed, so the caller can write a useful activity entry.

export type UpdateContactInput = {
  businessId: string;
  contactId: string;
  fullName: string;
  phone: string;
  email: string;
};

export type UpdateContactResult =
  | {
      ok: true;
      contactId: string;
      data: ContactEditInput;
      diff: ContactDiff;
    }
  | {
      ok: false;
      error: {
        code:
          | "INVALID_INPUT"
          | "VALIDATION_FAILED"
          | "NOT_FOUND"
          | "FOREIGN_BUSINESS"
          | "DB_ERROR"
          | "CLIENT_INIT_FAILED";
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

export async function updateContact(
  input: UpdateContactInput,
): Promise<UpdateContactResult> {
  if (!input.businessId || !input.contactId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId and contactId are required.",
      },
    };
  }

  const validation = validateContactEdit({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
  });
  if (!validation.ok) {
    const fieldErrors: Record<string, string> = {};
    for (const e of validation.errors) fieldErrors[e.field] = e.message;
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        fieldErrors,
      },
    };
  }
  const safe = validation.data;

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

  const { data: existing, error: readErr } = await supabase
    .from("contacts")
    .select("id,business_id,full_name,phone,email")
    .eq("id", input.contactId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, error: { code: "DB_ERROR", message: readErr.message } };
  }
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Contact not found." },
    };
  }
  if (existing.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Contact does not belong to the active business.",
      },
    };
  }

  const diff = diffContactEdit(
    {
      fullName: existing.full_name,
      phone: existing.phone,
      email: existing.email,
    },
    safe,
  );

  // If nothing changed, skip the write — but still return ok so the UI
  // can flash a "no changes" message without an error code path.
  if (diff.length === 0) {
    return { ok: true, contactId: existing.id, data: safe, diff };
  }

  const { error: updErr } = await supabase
    .from("contacts")
    .update({
      full_name: safe.fullName,
      phone: safe.phone,
      email: safe.email,
    })
    .eq("id", input.contactId)
    .eq("business_id", input.businessId);
  if (updErr) {
    return { ok: false, error: { code: "DB_ERROR", message: updErr.message } };
  }

  return { ok: true, contactId: existing.id, data: safe, diff };
}
