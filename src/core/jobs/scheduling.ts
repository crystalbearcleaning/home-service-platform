// Phase 10B — pure scheduling helpers for the /admin/schedule
// week view.
//
// No DB, no env, no `server-only`, no browser globals. Safe to import
// from anywhere (client OR server). All time math uses the operator's
// local timezone via the JS Date constructor — matching the existing
// `datetime-local` boundary in
// `src/app/admin/jobs/[jobId]/scheduling-form.tsx`. The schedule
// surface defaults to Monday-start weeks, a visible 8 AM–6 PM band,
// and 60-minute default duration when an end timestamp is missing.

export const SCHEDULE_VISIBLE_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
] as const;
export const SCHEDULE_VISIBLE_START_HOUR = 8;
export const SCHEDULE_VISIBLE_END_HOUR = 18;
export const SCHEDULE_DEFAULT_DURATION_MINUTES = 60;

// Statuses that count as a real scheduling commitment for overlap
// detection. Per Phase 10 doc §11: completed/canceled/draft/
// unscheduled are NOT conflict candidates.
const CONFLICT_STATUSES = new Set<string>(["scheduled", "in_progress"]);

// -------------------------------------------------------------------------
// Week range
// -------------------------------------------------------------------------

export type WeekRange = {
  start: Date; // Monday 00:00 local
  end: Date; // following Monday 00:00 local (exclusive)
  weekKey: string; // YYYY-MM-DD of `start` in local time
};

export function getWeekRange(
  reference?: Date | string | null,
  options?: { weekStartsOn?: 1 },
): WeekRange {
  // `weekStartsOn` is currently fixed to Monday (1). The option is
  // accepted for forward compatibility but ignored.
  void options;
  const ref = coerceDate(reference);
  // 0=Sun, 1=Mon, ..., 6=Sat. Distance back to Monday:
  // Sun→6, Mon→0, Tue→1, ..., Sat→5.
  const distance = (ref.getDay() + 6) % 7;
  const start = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate() - distance,
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7,
    0,
    0,
    0,
    0,
  );
  return { start, end, weekKey: formatLocalDateKey(start) };
}

export function formatWeekKey(start: Date): string {
  return formatLocalDateKey(start);
}

// Parses a YYYY-MM-DD week key into a local-time Date at 00:00.
// Returns null on malformed input. Caller decides what to do (the UI
// falls back to "this week" in Phase 10C).
export function parseWeekKey(weekKey: string | null | undefined): Date | null {
  if (typeof weekKey !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  // Catch overflow (e.g. 2026-02-31 → 2026-03-03).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function enumerateWeekDays(start: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i,
        0,
        0,
        0,
        0,
      ),
    );
  }
  return days;
}

// -------------------------------------------------------------------------
// Group jobs by day
// -------------------------------------------------------------------------

export type ScheduleJobInput = {
  id: string;
  scheduledStartAt: string | null | undefined;
  scheduledEndAt?: string | null;
  status?: string | null;
};

// Buckets jobs by local-date key (YYYY-MM-DD). Jobs outside the
// `[weekRange.start, weekRange.end)` window or with a null/invalid
// start are skipped. Saturday + Sunday buckets are produced when
// applicable; the calendar UI decides where to render them.
export function groupJobsByDay<T extends ScheduleJobInput>(
  jobs: ReadonlyArray<T> | null | undefined,
  weekRange: WeekRange,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const job of jobs ?? []) {
    const start = parseIsoSafe(job?.scheduledStartAt);
    if (!start) continue;
    if (start.getTime() < weekRange.start.getTime()) continue;
    if (start.getTime() >= weekRange.end.getTime()) continue;
    const key = formatLocalDateKey(start);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(job);
    else buckets.set(key, [job]);
  }
  return buckets;
}

// -------------------------------------------------------------------------
// Calendar position
// -------------------------------------------------------------------------

export type CalendarGridSettings = {
  visibleStartHour?: number; // default 8
  visibleEndHour?: number; // default 18
  defaultDurationMinutes?: number; // default 60
};

export type CalendarPosition = {
  dayKey: string;
  topPct: number; // 0..100 (clamped to visible band)
  heightPct: number; // 0..100 (clamped to visible band)
  isOutsideVisibleHours: boolean;
  startsBeforeVisible: boolean;
  endsAfterVisible: boolean;
};

export function calculateCalendarPosition(
  job: {
    scheduledStartAt: string | null | undefined;
    scheduledEndAt?: string | null;
  },
  gridSettings?: CalendarGridSettings,
): CalendarPosition | null {
  const start = parseIsoSafe(job?.scheduledStartAt);
  if (!start) return null;

  const visibleStart =
    gridSettings?.visibleStartHour ?? SCHEDULE_VISIBLE_START_HOUR;
  const visibleEnd =
    gridSettings?.visibleEndHour ?? SCHEDULE_VISIBLE_END_HOUR;
  const defaultDuration =
    gridSettings?.defaultDurationMinutes ?? SCHEDULE_DEFAULT_DURATION_MINUTES;

  if (
    !Number.isFinite(visibleStart) ||
    !Number.isFinite(visibleEnd) ||
    visibleEnd <= visibleStart
  ) {
    return null;
  }

  let end = parseIsoSafe(job?.scheduledEndAt);
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + sanitizeDurationMinutes(defaultDuration) * 60_000);
  }

  const startHours = localTimeAsHours(start);
  const endHours = localTimeAsHours(end);
  const visibleSpan = visibleEnd - visibleStart;

  const rawTop = ((startHours - visibleStart) / visibleSpan) * 100;
  const rawBottom = ((endHours - visibleStart) / visibleSpan) * 100;

  const topPct = clamp(rawTop, 0, 100);
  const bottomPct = clamp(rawBottom, 0, 100);
  const heightPct = Math.max(0, bottomPct - topPct);

  const startsBeforeVisible = startHours < visibleStart;
  const endsAfterVisible = endHours > visibleEnd;
  // Entirely outside the band when it ends before visible or starts
  // after visible — those events render with height 0 unless the
  // grid expands or an outside-hours strip catches them.
  const isOutsideVisibleHours =
    startsBeforeVisible ||
    endsAfterVisible ||
    endHours <= visibleStart ||
    startHours >= visibleEnd;

  return {
    dayKey: formatLocalDateKey(start),
    topPct,
    heightPct,
    isOutsideVisibleHours,
    startsBeforeVisible,
    endsAfterVisible,
  };
}

// -------------------------------------------------------------------------
// Overlap detection
// -------------------------------------------------------------------------

export type OverlapCandidate = {
  id: string;
  scheduledStartAt: string | null | undefined;
  scheduledEndAt?: string | null;
  status?: string | null;
};

export type ScheduleConflict<T extends OverlapCandidate = OverlapCandidate> = {
  job: T;
  start: string; // ISO of effective start
  end: string; // ISO of effective end
};

export type DetectOverlapsOptions = {
  excludeJobId?: string | null;
  defaultDurationMinutes?: number; // default 60
};

// Half-open overlap: `existing.start < proposed.end && existing.end > proposed.start`.
// Caller passes the candidate list (same-business is enforced upstream
// in the loader / action — this helper is workspace-agnostic).
//
// Only `scheduled` + `in_progress` candidates are considered. Missing
// ends default to a 60-minute block on both sides. Empty result =
// safe to commit. Phase 10D will surface a non-empty result as a soft
// warning (operator can confirm anyway).
export function detectScheduleOverlaps<T extends OverlapCandidate>(
  proposed: {
    scheduledStartAt: string | null | undefined;
    scheduledEndAt?: string | null;
  },
  existingJobs: ReadonlyArray<T> | null | undefined,
  options?: DetectOverlapsOptions,
): ScheduleConflict<T>[] {
  const exclude = (options?.excludeJobId ?? "").trim();
  const defaultDuration = sanitizeDurationMinutes(
    options?.defaultDurationMinutes ?? SCHEDULE_DEFAULT_DURATION_MINUTES,
  );

  const pStart = parseIsoSafe(proposed?.scheduledStartAt);
  if (!pStart) return [];
  let pEnd = parseIsoSafe(proposed?.scheduledEndAt);
  if (!pEnd || pEnd.getTime() <= pStart.getTime()) {
    pEnd = new Date(pStart.getTime() + defaultDuration * 60_000);
  }

  const conflicts: ScheduleConflict<T>[] = [];
  for (const candidate of existingJobs ?? []) {
    if (!candidate?.id) continue;
    if (exclude.length > 0 && candidate.id === exclude) continue;
    const status = (candidate.status ?? "").trim();
    if (!CONFLICT_STATUSES.has(status)) continue;
    const cStart = parseIsoSafe(candidate.scheduledStartAt);
    if (!cStart) continue;
    let cEnd = parseIsoSafe(candidate.scheduledEndAt);
    if (!cEnd || cEnd.getTime() <= cStart.getTime()) {
      cEnd = new Date(cStart.getTime() + defaultDuration * 60_000);
    }
    if (
      cStart.getTime() < pEnd.getTime() &&
      cEnd.getTime() > pStart.getTime()
    ) {
      conflicts.push({
        job: candidate,
        start: cStart.toISOString(),
        end: cEnd.toISOString(),
      });
    }
  }
  return conflicts;
}

// -------------------------------------------------------------------------
// Date / time combination
// -------------------------------------------------------------------------

// Combines a YYYY-MM-DD date + HH:MM time (operator-local) into an ISO
// string. Mirrors the `datetime-local` semantics already used by the
// Phase 9D `<SchedulingForm>` (local input, server-side ISO).
export function combineDateAndTimeToISO(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
): string | null {
  const dParts = parseDateStr(dateStr);
  const tParts = parseTimeStr(timeStr);
  if (!dParts || !tParts) return null;
  const d = new Date(
    dParts.year,
    dParts.month - 1,
    dParts.day,
    tParts.hour,
    tParts.minute,
    0,
    0,
  );
  if (Number.isNaN(d.getTime())) return null;
  // Catch overflow (e.g. 2026-02-31 → 2026-03-03).
  if (
    d.getFullYear() !== dParts.year ||
    d.getMonth() !== dParts.month - 1 ||
    d.getDate() !== dParts.day
  ) {
    return null;
  }
  return d.toISOString();
}

export function defaultEndForStart(
  startISO: string | null | undefined,
  defaultDurationMinutes: number = SCHEDULE_DEFAULT_DURATION_MINUTES,
): string | null {
  const d = parseIsoSafe(startISO);
  if (!d) return null;
  const minutes = sanitizeDurationMinutes(defaultDurationMinutes);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.max(lo, Math.min(hi, value));
}

function parseIsoSafe(v: string | null | undefined): Date | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function coerceDate(v: Date | string | null | undefined): Date {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function formatLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTimeAsHours(d: Date): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

function sanitizeDurationMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return SCHEDULE_DEFAULT_DURATION_MINUTES;
  }
  return Math.floor(minutes);
}

function parseDateStr(
  s: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseTimeStr(
  s: string | null | undefined,
): { hour: number; minute: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
