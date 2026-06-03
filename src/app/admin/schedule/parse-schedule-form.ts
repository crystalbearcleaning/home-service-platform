import {
  combineDateAndTimeToISO,
  defaultEndForStart,
} from "@/core/jobs/scheduling";

// Phase 10D — pure parser shared by the schedule + reschedule
// server actions. Converts the modal's three string fields
// (`date` = YYYY-MM-DD, `startTime` = HH:MM, `endTime` = HH:MM)
// into local-time ISO timestamps. End is optional and defaults to
// start + 60 minutes via the Phase 10B `defaultEndForStart` helper.

export type ScheduleFormFields = {
  date: string | null | undefined;
  startTime: string | null | undefined;
  endTime?: string | null;
  arrivalWindowLabel?: string | null;
};

export type ScheduleFormFieldErrors = Partial<{
  date: string;
  startTime: string;
  endTime: string;
}>;

export type ParsedScheduleForm =
  | {
      ok: true;
      startIso: string;
      endIso: string;
      arrivalWindowLabel: string | null;
    }
  | { ok: false; fieldErrors: ScheduleFormFieldErrors };

const ARRIVAL_WINDOW_MAX = 120;

export function parseScheduleFormFields(
  input: ScheduleFormFields,
): ParsedScheduleForm {
  const fieldErrors: ScheduleFormFieldErrors = {};

  const date = (input.date ?? "").trim();
  const startTime = (input.startTime ?? "").trim();
  const endTimeRaw = (input.endTime ?? "").trim();

  if (!date) fieldErrors.date = "Pick a date.";
  if (!startTime) fieldErrors.startTime = "Pick a start time.";

  const startIso =
    date && startTime ? combineDateAndTimeToISO(date, startTime) : null;
  if (date && startTime && !startIso) {
    fieldErrors.startTime = "Invalid date or start time.";
  }

  let endIso: string | null = null;
  if (endTimeRaw) {
    const combined = date ? combineDateAndTimeToISO(date, endTimeRaw) : null;
    if (!combined) {
      fieldErrors.endTime = "Invalid end time.";
    } else {
      endIso = combined;
    }
  } else if (startIso) {
    endIso = defaultEndForStart(startIso);
  }

  if (
    startIso &&
    endIso &&
    new Date(endIso).getTime() < new Date(startIso).getTime()
  ) {
    fieldErrors.endTime = "End must be on or after start.";
  }

  if (Object.keys(fieldErrors).length > 0 || !startIso || !endIso) {
    return { ok: false, fieldErrors };
  }

  const arrival = (input.arrivalWindowLabel ?? "").trim();
  const arrivalTrimmed =
    arrival.length === 0
      ? null
      : arrival.length > ARRIVAL_WINDOW_MAX
        ? arrival.slice(0, ARRIVAL_WINDOW_MAX)
        : arrival;

  return {
    ok: true,
    startIso,
    endIso,
    arrivalWindowLabel: arrivalTrimmed,
  };
}
