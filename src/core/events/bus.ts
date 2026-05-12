import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getEventPayloadSchema } from "./payload-schemas";
import type { PublishEventInput, PublishEventResult } from "./types";

const DEFAULT_SCHEMA_VERSION = 1;

export async function publishEvent(
  input: PublishEventInput,
): Promise<PublishEventResult> {
  const schema = getEventPayloadSchema(input.eventType);
  const parse = schema.safeParse(input.payload);
  if (!parse.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: `Invalid payload for event type "${input.eventType}".`,
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

  const { data, error } = await supabase
    .from("events")
    .insert({
      business_id: input.businessId,
      event_type: input.eventType,
      schema_version: input.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      payload: parse.data,
      source_type: input.sourceType,
      source_key: input.sourceKey ?? null,
      related_object_type: input.relatedObjectType ?? null,
      related_object_id: input.relatedObjectId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert event row.",
        details: error
          ? { hint: error.hint, code: error.code }
          : undefined,
      },
    };
  }

  return { ok: true, eventId: data.id };
}
