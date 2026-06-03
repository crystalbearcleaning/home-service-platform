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

import {
  RescheduleAction,
  ScheduleAction,
  UnscheduleAction,
} from "./card-actions";
import {
  isJobReschedulableStatus,
  isJobSchedulableStatus,
  isJobUnschedulableStatus,
} from "./modal-helpers";
import { ScheduledCardWithDetails } from "./scheduled-card-details";

// Phase 10C/D — schedule surface views. Server components compose
// the read-only grid + lists; the Phase 10D card-actions slot in
// the client buttons + modal per scheduled / unscheduled card.
// Status eligibility per Phase 10 doc §10:
//   - schedule → draft / unscheduled
//   - reschedule + unschedule → scheduled only
//   - in_progress / completed / canceled → no mutation controls

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VISIBLE_HOURS = SCHEDULE_VISIBLE_END_HOUR - SCHEDULE_VISIBLE_START_HOUR;

// -------------------------------------------------------------------------
// Week grid (Mon–Fri visible band 8 AM–6 PM)
// -------------------------------------------------------------------------

export function ScheduleWeekGrid({
  jobs,
  weekRange,
  fallbackDate,
}: {
  jobs: ReadonlyArray<JobRow>;
  weekRange: WeekRange;
  fallbackDate: string;
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
            <div
              className="relative"
              style={{ height: `${VISIBLE_HOURS * 56}px` }}
            >
              {hourLabels.map((h, idx) => {
                const topPct =
                  ((h - SCHEDULE_VISIBLE_START_HOUR) / VISIBLE_HOURS) * 100;
                if (idx === hourLabels.length - 1) return null;
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

                {cards.map((job) => {
                  const pos = calculateCalendarPosition({
                    scheduledStartAt: job.scheduledStartAt,
                    scheduledEndAt: job.scheduledEndAt,
                  });
                  if (!pos) return null;
                  if (pos.heightPct <= 0) return null;

                  return (
                    <ScheduledCardWithDetails
                      key={job.id}
                      job={job}
                      topPct={pos.topPct}
                      heightPct={pos.heightPct}
                      fallbackDate={fallbackDate}
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
// Outside-hours / weekend list — never silently hide a scheduled job
// -------------------------------------------------------------------------

export type ScheduleClassification = {
  visibleJobs: JobRow[];
  outsideHoursJobs: JobRow[];
  weekendJobs: JobRow[];
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
    const day = start.getDay();
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
  fallbackDate,
  emptyHint,
}: {
  title: string;
  jobs: ReadonlyArray<JobRow>;
  fallbackDate: string;
  emptyHint?: string;
}) {
  if (jobs.length === 0) {
    if (!emptyHint) return null;
    return <div className="text-[11px] text-ink-faint">{emptyHint}</div>;
  }
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-ink-muted">{title}</div>
      <ul className="divide-y divide-line rounded-control border border-line">
        {jobs.map((job) => (
          <li key={job.id} className="px-3 py-2">
            <OutsideHoursRow job={job} fallbackDate={fallbackDate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutsideHoursRow({
  job,
  fallbackDate,
}: {
  job: JobRow;
  fallbackDate: string;
}) {
  return (
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
          {job.propertyAddressLine ? ` · ${job.propertyAddressLine}` : ""}
        </div>
        <div className="text-[11px] text-ink-faint">
          {formatSchedulingRange({
            startAt: job.scheduledStartAt,
            endAt: job.scheduledEndAt,
            arrivalWindowLabel: job.arrivalWindowLabel,
          })}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-medium text-ink">
          {formatCentsAsDollars(job.estimatedTotalCents)}
        </span>
        {(isJobReschedulableStatus(job.status) ||
          isJobUnschedulableStatus(job.status)) && (
          <div className="flex flex-wrap gap-1">
            {isJobReschedulableStatus(job.status) && (
              <RescheduleAction job={job} fallbackDate={fallbackDate} />
            )}
            {isJobUnschedulableStatus(job.status) && (
              <UnscheduleAction jobId={job.id} title={job.title} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Unscheduled jobs panel
// -------------------------------------------------------------------------

export function UnscheduledJobsPanel({
  jobs,
  fallbackDate,
}: {
  jobs: ReadonlyArray<JobRow>;
  fallbackDate: string;
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
          <UnscheduledJobCard job={job} fallbackDate={fallbackDate} />
        </li>
      ))}
    </ul>
  );
}

function UnscheduledJobCard({
  job,
  fallbackDate,
}: {
  job: JobRow;
  fallbackDate: string;
}) {
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
        {isJobSchedulableStatus(job.status) && (
          <ScheduleAction job={job} fallbackDate={fallbackDate} />
        )}
      </div>
    </div>
  );
}
