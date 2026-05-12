import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  createActivityInputSchema,
  type CreateActivityInput,
} from "./input-schema";

export type CreateActivityResult =
  | { ok: true; activityId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createActivity(
  input: CreateActivityInput,
): Promise<CreateActivityResult> {
  const parse = createActivityInputSchema.safeParse(input);
  if (!parse.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid activity input.",
        details: parse.error.issues,
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

  const v = parse.data;
  const { data, error } = await supabase
    .from("activities")
    .insert({
      business_id: v.businessId,
      event_id: v.eventId ?? null,
      actor_type: v.actorType,
      actor_user_id: v.actorUserId ?? null,
      source_plugin_key: v.sourcePluginKey ?? null,
      activity_type: v.activityType,
      summary: v.summary,
      details: v.details ?? null,
      related_object_type: v.relatedObjectType ?? null,
      related_object_id: v.relatedObjectId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert activity row.",
        details: error
          ? { hint: error.hint, code: error.code }
          : undefined,
      },
    };
  }

  return { ok: true, activityId: data.id };
}
