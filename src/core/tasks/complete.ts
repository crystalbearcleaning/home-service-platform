import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// Server-only helper: mark a task completed. Verifies business
// ownership + only acts on tasks that are not already completed.
// Status text is `completed` to align with the existing tasks schema
// status taxonomy (open / completed / canceled).

export type CompleteTaskInput = {
  businessId: string;
  taskId: string;
  completedByUserId: string;
};

export type CompleteTaskResult =
  | {
      ok: true;
      taskId: string;
      title: string;
      relatedObjectType: string | null;
      relatedObjectId: string | null;
    }
  | {
      ok: false;
      error: {
        code:
          | "INVALID_INPUT"
          | "NOT_FOUND"
          | "FOREIGN_BUSINESS"
          | "ALREADY_COMPLETED"
          | "DB_ERROR"
          | "CLIENT_INIT_FAILED";
        message: string;
        details?: unknown;
      };
    };

export async function completeTask(
  input: CompleteTaskInput,
): Promise<CompleteTaskResult> {
  if (!input.businessId || !input.taskId || !input.completedByUserId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "businessId, taskId, and completedByUserId are required.",
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

  const { data: existing, error: readErr } = await supabase
    .from("tasks")
    .select("id,business_id,status,title,related_object_type,related_object_id")
    .eq("id", input.taskId)
    .maybeSingle();

  if (readErr) {
    return { ok: false, error: { code: "DB_ERROR", message: readErr.message } };
  }
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Task not found." } };
  }
  if (existing.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Task does not belong to the active business.",
      },
    };
  }
  if (existing.status === "completed") {
    return {
      ok: false,
      error: {
        code: "ALREADY_COMPLETED",
        message: "Task is already completed.",
      },
    };
  }

  const { error: updErr } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by_user_id: input.completedByUserId,
    })
    .eq("id", input.taskId)
    .eq("business_id", input.businessId);

  if (updErr) {
    return { ok: false, error: { code: "DB_ERROR", message: updErr.message } };
  }

  return {
    ok: true,
    taskId: existing.id,
    title: existing.title,
    relatedObjectType: existing.related_object_type,
    relatedObjectId: existing.related_object_id,
  };
}
