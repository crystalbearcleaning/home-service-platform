import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Create a simple admin Task row. Phase 1 task engine is intentionally
// minimal: title, description, category, status, related object pointer.
// No claiming, no dependencies, no priority calculation.
// =========================================================================

export type CreateTaskInput = {
  businessId: string;
  title: string;
  description: string | null;
  taskCategory: string;
  priority?: "low" | "normal" | "high";
  status?: "open" | "in_progress" | "blocked" | "done";
  relatedObjectType: string;
  relatedObjectId: string;
  sourcePluginKey: string | null;
  sourceEventId?: string | null;
  dueAt?: string | null;
};

export type CreateTaskResult =
  | { ok: true; taskId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function createTask(
  input: CreateTaskInput,
): Promise<CreateTaskResult> {
  if (!input.businessId || !input.title || !input.taskCategory) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId, title, taskCategory are required.",
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
    .from("tasks")
    .insert({
      business_id: input.businessId,
      title: input.title,
      description: input.description,
      task_category: input.taskCategory,
      priority: input.priority ?? "normal",
      status: input.status ?? "open",
      related_object_type: input.relatedObjectType,
      related_object_id: input.relatedObjectId,
      source_plugin_key: input.sourcePluginKey,
      source_event_id: input.sourceEventId ?? null,
      due_at: input.dueAt ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert task row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, taskId: data.id };
}
