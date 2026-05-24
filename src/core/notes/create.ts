import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { validateNoteBody } from "./validate";

// Server-only helper: insert a single internal note attached to a
// business-owned record. Always uses visibility='all_internal' for
// Phase 3F. Author is the caller's auth user id.

export type CreateNoteInput = {
  businessId: string;
  authorUserId: string;
  body: string;
  relatedObjectType: string;
  relatedObjectId: string;
};

export type CreateNoteResult =
  | { ok: true; noteId: string; body: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
  if (!input.businessId || !input.authorUserId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId and authorUserId are required.",
      },
    };
  }
  if (!input.relatedObjectType || !input.relatedObjectId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "relatedObjectType and relatedObjectId are required.",
      },
    };
  }
  const validation = validateNoteBody(input.body);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: validation.error.code,
        message: validation.error.message,
      },
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
    .from("notes")
    .insert({
      business_id: input.businessId,
      body: validation.body,
      visibility: "all_internal",
      author_user_id: input.authorUserId,
      related_object_type: input.relatedObjectType,
      related_object_id: input.relatedObjectId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert note row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, noteId: data.id, body: validation.body };
}
