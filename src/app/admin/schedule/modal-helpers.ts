// Phase 10D — pure helpers for the schedule modal's date/time
// pre-fills + per-status mutation eligibility. No DB, no env, no
// `server-only`, no React imports. Safe to import from anywhere.

const DEFAULT_START = "09:00";
const DEFAULT_END = "10:00";

export function extractDateFromIso(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function extractTimeFromIso(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ScheduleDefaults = {
  date: string;
  startTime: string;
  endTime: string;
  arrivalWindowLabel: string;
};

// `fallbackDate` is the YYYY-MM-DD string the modal should default
// to when no existing scheduling is present (page-level: today's
// local date when the visible week is today's week, otherwise the
// visible Monday).
export function computeScheduleDefaults(input: {
  existingStartIso?: string | null;
  existingEndIso?: string | null;
  existingArrivalWindowLabel?: string | null;
  fallbackDate: string;
}): ScheduleDefaults {
  if (input.existingStartIso) {
    return {
      date: extractDateFromIso(input.existingStartIso) || input.fallbackDate,
      startTime:
        extractTimeFromIso(input.existingStartIso) || DEFAULT_START,
      endTime:
        extractTimeFromIso(input.existingEndIso ?? null) || DEFAULT_END,
      arrivalWindowLabel: input.existingArrivalWindowLabel ?? "",
    };
  }
  return {
    date: input.fallbackDate,
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
    arrivalWindowLabel: "",
  };
}

// Per Phase 10 doc §10:
// - schedule only `draft` / `unscheduled`
// - reschedule + unschedule only `scheduled`
// - `in_progress` / `completed` / `canceled` expose NO scheduling
//   mutation controls on the schedule page.
export function isJobSchedulableStatus(status: string): boolean {
  return status === "draft" || status === "unscheduled";
}

export function isJobReschedulableStatus(status: string): boolean {
  return status === "scheduled";
}

export function isJobUnschedulableStatus(status: string): boolean {
  return status === "scheduled";
}
