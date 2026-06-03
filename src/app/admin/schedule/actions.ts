"use server";

import { revalidatePath } from "next/cache";

import { createActivity } from "@/core/activity/logger";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  updateJobScheduling,
  updateJobStatus,
} from "@/core/jobs/admin-create";
import {
  getJob,
  listScheduleOverlapCandidates,
  type JobRow,
} from "@/core/jobs/admin-data";
import { detectScheduleOverlaps } from "@/core/jobs/scheduling";

import { parseScheduleFormFields } from "./parse-schedule-form";

// =========================================================================
// Phase 10D — /admin/schedule server actions.
//
// Three actions: scheduleJobAction, rescheduleJobAction,
// unscheduleJobAction. Each composes the existing Phase 9B
// updateJobScheduling + updateJobStatus helpers, runs a same-business
// overlap pre-check (warning only, never a hard block — Phase 10 doc
// §11), and soft-fails a single activity row per success.
//
// No customer notifications. No message-automation calls. No external
// calendar sync. No new low-level DB helpers introduced.
// =========================================================================

export type ScheduleConflictDTO = {
  jobId: string;
  title: string;
  status: string;
  contactName: string | null;
  start: string;
  end: string;
};

type ActionError = {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    conflicts?: ScheduleConflictDTO[];
  };
};

export type ScheduleActionResult = { ok: true } | ActionError;

type AuthOk = { ok: true; userId: string; businessId: string };

// Generous window so long jobs anchored outside the proposed range
// still surface; the pure `detectScheduleOverlaps` helper does the
// precise half-open math.
const OVERLAP_WINDOW_MS = 48 * 60 * 60 * 1000;

async function requireBusiness(): Promise<AuthOk | ActionError> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign-in required." },
    };
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

function revalidateAfterScheduleMutation(jobId: string) {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

async function runOverlapCheck(input: {
  businessId: string;
  startIso: string;
  endIso: string;
  excludeJobId?: string;
}): Promise<ScheduleConflictDTO[]> {
  const candidates = await listScheduleOverlapCandidates({
    businessId: input.businessId,
    fromIso: shiftIso(input.startIso, -OVERLAP_WINDOW_MS),
    toIso: shiftIso(input.endIso, OVERLAP_WINDOW_MS),
  });
  const conflicts = detectScheduleOverlaps<JobRow>(
    { scheduledStartAt: input.startIso, scheduledEndAt: input.endIso },
    candidates,
    { excludeJobId: input.excludeJobId ?? null },
  );
  return conflicts.map((c) => ({
    jobId: c.job.id,
    title: c.job.title,
    status: c.job.status,
    contactName: c.job.contactFullName,
    start: c.start,
    end: c.end,
  }));
}

export type ScheduleJobInput = {
  jobId: string;
  date: string;
  startTime: string;
  endTime?: string;
  arrivalWindowLabel?: string | null;
  confirmOverlap?: boolean;
};

// -------------------------------------------------------------------------
// scheduleJobAction — draft/unscheduled → scheduled
// -------------------------------------------------------------------------

export async function scheduleJobAction(
  input: ScheduleJobInput,
): Promise<ScheduleActionResult> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.jobId?.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing jobId." },
    };
  }

  const parsed = parseScheduleFormFields({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    arrivalWindowLabel: input.arrivalWindowLabel ?? null,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid scheduling fields.",
        fieldErrors: parsed.fieldErrors,
      },
    };
  }

  const job = await getJob({
    businessId: auth.businessId,
    jobId: input.jobId,
  });
  if (!job) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    };
  }
  if (job.status !== "draft" && job.status !== "unscheduled") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS",
        message: `Cannot schedule a ${job.status} job.`,
      },
    };
  }

  let conflictCount = 0;
  if (!input.confirmOverlap) {
    const conflicts = await runOverlapCheck({
      businessId: auth.businessId,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
      excludeJobId: input.jobId,
    });
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: {
          code: "OVERLAP_WARNING",
          message: "This time overlaps other scheduled work.",
          conflicts,
        },
      };
    }
  } else {
    // Surface the count for the activity row even on confirmed
    // override.
    const conflicts = await runOverlapCheck({
      businessId: auth.businessId,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
      excludeJobId: input.jobId,
    });
    conflictCount = conflicts.length;
  }

  const schedRes = await updateJobScheduling({
    businessId: auth.businessId,
    jobId: input.jobId,
    fields: {
      scheduledStartAt: parsed.startIso,
      scheduledEndAt: parsed.endIso,
      arrivalWindowLabel: parsed.arrivalWindowLabel,
    },
  });
  if (!schedRes.ok) return { ok: false, error: schedRes.error };

  const statusRes = await updateJobStatus({
    businessId: auth.businessId,
    jobId: input.jobId,
    status: "scheduled",
  });
  if (!statusRes.ok) return { ok: false, error: statusRes.error };

  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.scheduled",
    summary: `Job scheduled: ${job.title}`,
    relatedObjectType: "job",
    relatedObjectId: input.jobId,
    details: {
      scheduled_start_at: parsed.startIso,
      scheduled_end_at: parsed.endIso,
      arrival_window_label: parsed.arrivalWindowLabel,
      conflict_count: conflictCount,
      confirmed_overlap: Boolean(input.confirmOverlap),
    },
  });

  revalidateAfterScheduleMutation(input.jobId);
  return { ok: true };
}

// -------------------------------------------------------------------------
// rescheduleJobAction — scheduled → scheduled (new times)
// -------------------------------------------------------------------------

export type RescheduleJobInput = ScheduleJobInput;

export async function rescheduleJobAction(
  input: RescheduleJobInput,
): Promise<ScheduleActionResult> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.jobId?.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing jobId." },
    };
  }

  const parsed = parseScheduleFormFields({
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime ?? null,
    arrivalWindowLabel: input.arrivalWindowLabel ?? null,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid scheduling fields.",
        fieldErrors: parsed.fieldErrors,
      },
    };
  }

  const job = await getJob({
    businessId: auth.businessId,
    jobId: input.jobId,
  });
  if (!job) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    };
  }
  if (job.status !== "scheduled") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS",
        message: `Cannot reschedule a ${job.status} job.`,
      },
    };
  }

  let conflictCount = 0;
  if (!input.confirmOverlap) {
    const conflicts = await runOverlapCheck({
      businessId: auth.businessId,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
      excludeJobId: input.jobId,
    });
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: {
          code: "OVERLAP_WARNING",
          message: "This time overlaps other scheduled work.",
          conflicts,
        },
      };
    }
  } else {
    const conflicts = await runOverlapCheck({
      businessId: auth.businessId,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
      excludeJobId: input.jobId,
    });
    conflictCount = conflicts.length;
  }

  const previous = {
    scheduled_start_at: job.scheduledStartAt,
    scheduled_end_at: job.scheduledEndAt,
    arrival_window_label: job.arrivalWindowLabel,
  };

  const schedRes = await updateJobScheduling({
    businessId: auth.businessId,
    jobId: input.jobId,
    fields: {
      scheduledStartAt: parsed.startIso,
      scheduledEndAt: parsed.endIso,
      arrivalWindowLabel: parsed.arrivalWindowLabel,
    },
  });
  if (!schedRes.ok) return { ok: false, error: schedRes.error };

  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.rescheduled",
    summary: `Job rescheduled: ${job.title}`,
    relatedObjectType: "job",
    relatedObjectId: input.jobId,
    details: {
      scheduled_start_at: parsed.startIso,
      scheduled_end_at: parsed.endIso,
      arrival_window_label: parsed.arrivalWindowLabel,
      previous,
      conflict_count: conflictCount,
      confirmed_overlap: Boolean(input.confirmOverlap),
    },
  });

  revalidateAfterScheduleMutation(input.jobId);
  return { ok: true };
}

// -------------------------------------------------------------------------
// unscheduleJobAction — scheduled → unscheduled (clears all 3 fields)
// -------------------------------------------------------------------------

export async function unscheduleJobAction(input: {
  jobId: string;
}): Promise<ScheduleActionResult> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.jobId?.trim()) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing jobId." },
    };
  }

  const job = await getJob({
    businessId: auth.businessId,
    jobId: input.jobId,
  });
  if (!job) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    };
  }
  if (job.status !== "scheduled") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS",
        message: `Cannot unschedule a ${job.status} job.`,
      },
    };
  }

  const previous = {
    scheduled_start_at: job.scheduledStartAt,
    scheduled_end_at: job.scheduledEndAt,
    arrival_window_label: job.arrivalWindowLabel,
  };

  const schedRes = await updateJobScheduling({
    businessId: auth.businessId,
    jobId: input.jobId,
    fields: {
      scheduledStartAt: null,
      scheduledEndAt: null,
      arrivalWindowLabel: null,
    },
  });
  if (!schedRes.ok) return { ok: false, error: schedRes.error };

  const statusRes = await updateJobStatus({
    businessId: auth.businessId,
    jobId: input.jobId,
    status: "unscheduled",
  });
  if (!statusRes.ok) return { ok: false, error: statusRes.error };

  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.unscheduled",
    summary: `Job unscheduled: ${job.title}`,
    relatedObjectType: "job",
    relatedObjectId: input.jobId,
    details: { previous },
  });

  revalidateAfterScheduleMutation(input.jobId);
  return { ok: true };
}
