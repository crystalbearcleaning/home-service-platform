"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { createActivity } from "@/core/activity/logger";
import { createNote } from "@/core/notes/create";
import { completeTask } from "@/core/tasks/complete";
import { validateNoteBody } from "@/core/notes/validate";

// =========================================================================
// Phase 3F admin server actions for the lead detail page.
//
// Allowed writes:
//   - tasks: set status='completed' / completed_at / completed_by_user_id
//   - notes: insert (related_object_type='lead')
//   - activities: insert (task_completed, note_added)
//
// No customer SMS, no business-record creation, no schema changes.
// =========================================================================

type Result<T = void> =
  | (T extends void
      ? { ok: true }
      : { ok: true; data: T })
  | {
      ok: false;
      error: { code: string; message: string; fieldErrors?: Record<string, string> };
    };

async function requireBusiness(): Promise<
  { ok: true; userId: string; businessId: string } | Result<never>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Sign-in required." } };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

// -------------------------------------------------------------------------
// Complete the related task. Optional completion note is persisted as a
// note attached to the lead (so the operator-facing thread on the lead
// detail page reflects the full story).
// -------------------------------------------------------------------------
export async function completeTaskAction(input: {
  taskId: string;
  leadId: string;
  completionNote?: string | null;
}): Promise<
  Result<{
    taskId: string;
    noteId: string | null;
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.taskId || !input.leadId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "taskId and leadId are required." },
    };
  }

  // Validate completion-note up front so we don't complete the task and
  // then fail on a bad note.
  const noteRaw = (input.completionNote ?? "").trim();
  let validatedBody: string | null = null;
  if (noteRaw.length > 0) {
    const v = validateNoteBody(noteRaw);
    if (!v.ok) {
      return {
        ok: false,
        error: {
          code: v.error.code,
          message: v.error.message,
          fieldErrors: { completionNote: v.error.message },
        },
      };
    }
    validatedBody = v.body;
  }

  const taskResult = await completeTask({
    businessId: auth.businessId,
    taskId: input.taskId,
    completedByUserId: auth.userId,
  });
  if (!taskResult.ok) {
    return { ok: false, error: taskResult.error };
  }

  // Optional note (attached to the lead, not the task — keeps the
  // lead-detail thread coherent).
  let noteId: string | null = null;
  if (validatedBody) {
    const noteResult = await createNote({
      businessId: auth.businessId,
      authorUserId: auth.userId,
      body: validatedBody,
      relatedObjectType: "lead",
      relatedObjectId: input.leadId,
    });
    if (noteResult.ok) {
      noteId = noteResult.noteId;
    } else {
      // Don't roll back the completion — surface the note error.
      console.error(
        "[completeTaskAction] task completed but note insert failed:",
        noteResult.error.message,
      );
    }
  }

  // Activity entry. Attach to the lead so it shows in the lead-detail
  // activity list AND in /admin/activity.
  await createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "task.completed",
    summary: validatedBody
      ? `Completed task: ${taskResult.title}. Note: ${validatedBody}`
      : `Completed task: ${taskResult.title}.`,
    relatedObjectType: "lead",
    relatedObjectId: input.leadId,
  });

  revalidatePath(`/admin/leads/${input.leadId}`);
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/activity");
  return { ok: true, data: { taskId: taskResult.taskId, noteId } };
}

// -------------------------------------------------------------------------
// Add a standalone internal note to a lead.
// -------------------------------------------------------------------------
export async function addLeadNoteAction(input: {
  leadId: string;
  body: string;
}): Promise<Result<{ noteId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.leadId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "leadId is required." },
    };
  }

  const noteResult = await createNote({
    businessId: auth.businessId,
    authorUserId: auth.userId,
    body: input.body,
    relatedObjectType: "lead",
    relatedObjectId: input.leadId,
  });
  if (!noteResult.ok) {
    return {
      ok: false,
      error: {
        code: noteResult.error.code,
        message: noteResult.error.message,
        ...(noteResult.error.code === "REQUIRED" || noteResult.error.code === "TOO_LONG"
          ? { fieldErrors: { body: noteResult.error.message } }
          : {}),
      },
    };
  }

  await createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "note.added",
    summary: `Internal note added: ${noteResult.body}`,
    relatedObjectType: "lead",
    relatedObjectId: input.leadId,
  });

  revalidatePath(`/admin/leads/${input.leadId}`);
  revalidatePath("/admin/activity");
  return { ok: true, data: { noteId: noteResult.noteId } };
}
