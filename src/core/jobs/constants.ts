// Phase 9B — pure enums for jobs + job_line_items.
//
// Kept in sync with the CHECK constraints in
// `supabase/migrations/20260603120000_phase_9_jobs.sql`.
// No DB, no env, no `server-only`. Safe to import from anywhere.

export const JOB_STATUSES = [
  "draft",
  "unscheduled",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_SOURCES = ["manual", "quote"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const JOB_LINE_ITEM_SOURCES = [
  "quote",
  "service",
  "custom",
] as const;
export type JobLineItemSource = (typeof JOB_LINE_ITEM_SOURCES)[number];

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === "string" && (JOB_STATUSES as readonly string[]).includes(v);
}

export function isJobSource(v: unknown): v is JobSource {
  return typeof v === "string" && (JOB_SOURCES as readonly string[]).includes(v);
}

export function isJobLineItemSource(v: unknown): v is JobLineItemSource {
  return (
    typeof v === "string" &&
    (JOB_LINE_ITEM_SOURCES as readonly string[]).includes(v)
  );
}
