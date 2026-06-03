import Link from "next/link";

import { StatusBadge } from "@/components/admin";
import type { JobRow } from "@/core/jobs/admin-data";
import {
  formatCentsAsDollars,
  formatSchedulingRange,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";
import {
  calculateCalendarPosition,
  enumerateWeekDays,
  formatWeekKey,
  groupJobsByDay,
  SCHEDULE_VISIBLE_END_HOUR,
  SCHEDULE_VISIBLE_START_HOUR,
  type WeekRange,
} from "@/core/jobs/scheduling";

// Phase 10C — read-only schedule surface views. Pure server-side
// presentation; no mutations, no modals, no drag/drop. The page
// composes <ScheduleWeekGrid />, <OutsideHoursList />, and
// <UnscheduledJobsPanel />.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VISIBLE_HOURS = SCHEDULE_VISIBLE_END_HOUR - SCHEDULE_VISIBLE_START_HOUR;

// -------------------------------------------------------------------------
// Week grid (Mon–Fri visible band 8 AM–6 PM)
// -------------------------------------------------------------------------

export function ScheduleWeekGrid({
  jobs,
  weekRange,
}: {
  jobs: ReadonlyArray<JobRow>;
  weekRange: WeekRange;
}) {
  const byDay = groupJobsByDay(jobs, weekRange);
  const days = enumerateWeekDays(weekRange.start).slice(0, 5); // Mon–Fri
  const hourLabels: number[] = [];
  for (let h = SCHEDULE_VISIBLE_START_HOUR; h <= SCHEDULE_VISIBLE_END_HOUR; h++) {
    hourLabels.push(h);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        {/* Day header row */}
        <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-line text-xs text-ink-muted">
          <div className="px-2 py-2" />
          {days.map((day, idx) => (
            <div
              key={formatWeekKey(day)}
              className="border-l border-line px-2 py-2"
            >
              <div className="font-medium text-ink">{DAY_LABELS[idx]}</div>
              <div className="text-[11px] text-ink-faint">
                {day.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid grid-cols-[60px_repeat(5,1fr)]">
          {/* Hour labels column */}
          <div className="relative">
            <div className="relative" style={{ height: `${VISIBLE_HOURS * 56}px` }}>
              {hourLabels.map((h, idx) => {
                const topPct =
                  ((h - SCHEDULE_VISIBLE_START_HOUR) / VISIBLE_HOURS) * 100;
                if (idx === hourLabels.length - 1) return null; // bottom edge label hidden
                return (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-faint"
                    style={{ top: `${topPct}%` }}
                  >
                    {formatHourLabel(h)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayKey = formatWeekKey(day);
            const cards = byDay.get(dayKey) ?? [];
            return (
              <div
                key={dayKey}
                className="relative border-l border-line"
                style={{ height: `${VISIBLE_HOURS * 56}px` }}
              >
                {/* hour gridlines */}
                {hourLabels.slice(1, -1).map((h) => {
                  const topPct =
                    ((h - SCHEDULE_VISIBLE_START_HOUR) / VISIBLE_HOURS) * 100;
                  return (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0 border-t border-line/50"
                      style={{ top: `${topPct}%` }}
                    />
                  );
                })}

                {/* job cards */}
                {cards.map((job) => {
                  const pos = calculateCalendarPosition({
                    scheduledStartAt: job.scheduledStartAt,
                    scheduledEndAt: job.scheduledEndAt,
                  });
                  if (!pos) return null;
                  if (pos.heightPct <= 0) return null; // outside-hours rendering handled separately

                  return (
                    <ScheduledJobCard
                      key={job.id}
                      job={job}
                      topPct={pos.topPct}
                      heightPct={pos.heightPct}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

// -------------------------------------------------------------------------
// Scheduled job card (placed absolutely inside its day column)
// -------------------------------------------------------------------------

function ScheduledJobCard({
  job,
  topPct,
  heightPct,
}: {
  job: JobRow;
  topPct: number;
  heightPct: number;
}) {
  const tone = jobStatusTone(job.status);
  // Visually distinct for completed / in_progress so the operator
  // can see what's already underway / done in the week (per
  // Phase 10 doc §10).
  const opacityClass =
    job.status === "completed"
      ? "opacity-70"
      : job.status === "in_progress"
        ? ""
        : "";

  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      style={{
        top: `${topPct}%`,
        height: `${Math.max(heightPct, 4)}%`,
      }}
      className={
        "absolute left-1 right-1 overflow-hidden rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-sm hover:border-ink/50 " +
        opacityClass
      }
    >
      <div className="flex items-baseline gap-1.5">
        <StatusBadge tone={tone}>{jobStatusLabel(job.status)}</StatusBadge>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-ink">
        {job.title}
      </div>
      {job.contactFullName && (
        <div className="truncate text-[10px] text-ink-muted">
          {job.contactFullName}
        </div>
      )}
      <div className="text-[10px] text-ink-faint">
        {formatSchedulingRange({
          startAt: job.scheduledStartAt,
          endAt: job.scheduledEndAt,
          arrivalWindowLabel: job.arrivalWindowLabel,
        })}
      </div>
    </Link>
  );
}

// -------------------------------------------------------------------------
// Outside-hours / weekend list — never silently hide a scheduled job
// -------------------------------------------------------------------------

export type ScheduleClassification = {
  visibleJobs: JobRow[]; // Mon–Fri AND inside 8–18
  outsideHoursJobs: JobRow[]; // Mon–Fri AND outside 8–18 (or zero-height)
  weekendJobs: JobRow[]; // Sat / Sun
};

export function classifyScheduledJobs(
  jobs: ReadonlyArray<JobRow>,
): ScheduleClassification {
  const visible: JobRow[] = [];
  const outside: JobRow[] = [];
  const weekend: JobRow[] = [];
  for (const job of jobs) {
    if (!job.scheduledStartAt) continue;
    const start = new Date(job.scheduledStartAt);
    if (Number.isNaN(start.getTime())) continue;
    const day = start.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) {
      weekend.push(job);
      continue;
    }
    const pos = calculateCalendarPosition({
      scheduledStartAt: job.scheduledStartAt,
      scheduledEndAt: job.scheduledEndAt,
    });
    if (!pos) {
      outside.push(job);
      continue;
    }
    if (pos.isOutsideVisibleHours || pos.heightPct <= 0) {
      outside.push(job);
    } else {
      visible.push(job);
    }
  }
  return {
    visibleJobs: visible,
    outsideHoursJobs: outside,
    weekendJobs: weekend,
  };
}

export function OutsideHoursList({
  title,
  jobs,
  emptyHint,
}: {
  title: string;
  jobs: ReadonlyArray<JobRow>;
  emptyHint?: string;
}) {
  if (jobs.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="text-[11px] text-ink-faint">{emptyHint}</div>
    );
  }
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-ink-muted">{title}</div>
      <ul className="divide-y divide-line rounded-control border border-line">
        {jobs.map((job) => (
          <li key={job.id} className="px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <Link
                    href={`/admin/jobs/${job.id}`}
                    className="truncate text-sm font-medium text-ink hover:underline"
                  >
                    {job.title}
                  </Link>
                  <StatusBadge tone={jobStatusTone(job.status)}>
                    {jobStatusLabel(job.status)}
                  </StatusBadge>
                </div>
                <div className="text-[11px] text-ink-muted">
                  {job.contactFullName ?? "—"}
                  {job.propertyAddressLine
                    ? ` · ${job.propertyAddressLine}`
                    : ""}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {formatSchedulingRange({
                    startAt: job.scheduledStartAt,
                    endAt: job.scheduledEndAt,
                    arrivalWindowLabel: job.arrivalWindowLabel,
                  })}
                </div>
              </div>
              <div className="text-sm font-medium text-ink">
                {formatCentsAsDollars(job.estimatedTotalCents)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -------------------------------------------------------------------------
// Unscheduled jobs panel
// -------------------------------------------------------------------------

export function UnscheduledJobsPanel({
  jobs,
}: {
  jobs: ReadonlyArray<JobRow>;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-control border border-line bg-surface p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">All caught up.</p>
        <p className="mt-1 text-xs text-ink-faint">
          Create a job or convert a quote to add work to the schedule.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {jobs.map((job) => (
        <li key={job.id}>
          <UnscheduledJobCard job={job} />
        </li>
      ))}
    </ul>
  );
}

function UnscheduledJobCard({ job }: { job: JobRow }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <Link
          href={`/admin/jobs/${job.id}`}
          className="truncate text-sm font-medium text-ink hover:underline"
        >
          {job.title}
        </Link>
        <StatusBadge tone={jobStatusTone(job.status)}>
          {jobStatusLabel(job.status)}
        </StatusBadge>
        <StatusBadge tone="neutral">{jobSourceLabel(job.source)}</StatusBadge>
      </div>
      <div className="mt-1 text-[11px] text-ink-muted">
        {job.contactFullName ?? "—"}
        {job.propertyAddressLine ? ` · ${job.propertyAddressLine}` : ""}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">
          {formatCentsAsDollars(job.estimatedTotalCents)}
        </span>
        <span
          className="cursor-not-allowed rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-ink-faint"
          title="Scheduling action ships in Phase 10D"
          aria-disabled="true"
        >
          Schedule · Coming next
        </span>
      </div>
    </div>
  );
}
