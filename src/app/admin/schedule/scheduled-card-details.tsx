"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/admin/status-badge";
import type { JobRow } from "@/core/jobs/admin-data";
import {
  formatCentsAsDollars,
  formatSchedulingRange,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";

import { unscheduleJobAction } from "./actions";
import {
  computeScheduleDefaults,
  isJobReschedulableStatus,
  isJobUnschedulableStatus,
} from "./modal-helpers";
import { ScheduleJobModal } from "./schedule-job-modal";

// Phase 10D UI polish — calendar cards used to render Reschedule
// + Unschedule inline, which got cut off in short cards (≤ 60 min).
// The compact card now shows only status + title + a short time
// hint; clicking it opens a full details modal that hosts the
// actions. The reschedule modal stacks on top via the existing
// `<ScheduleJobModal />` (mode="reschedule"). Action logic remains
// in `actions.ts` — this component owns presentation only.

type Props = {
  job: JobRow;
  topPct: number;
  heightPct: number;
  fallbackDate: string;
};

type View = "closed" | "details" | "reschedule";

export function ScheduledCardWithDetails({
  job,
  topPct,
  heightPct,
  fallbackDate,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("closed");
  const [unschedulePending, startUnschedule] = useTransition();
  const [unscheduleError, setUnscheduleError] = useState<string | null>(null);

  const defaults = computeScheduleDefaults({
    existingStartIso: job.scheduledStartAt,
    existingEndIso: job.scheduledEndAt,
    existingArrivalWindowLabel: job.arrivalWindowLabel,
    fallbackDate,
  });

  function onUnschedule() {
    if (
      !window.confirm(
        `Unschedule "${job.title}"? It will move back to the Unscheduled panel.`,
      )
    ) {
      return;
    }
    setUnscheduleError(null);
    startUnschedule(async () => {
      const r = await unscheduleJobAction({ jobId: job.id });
      if (!r.ok) {
        setUnscheduleError(r.error.message);
        return;
      }
      setView("closed");
      router.refresh();
    });
  }

  const tone = jobStatusTone(job.status);
  const dimClass = job.status === "completed" ? "opacity-70" : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setView("details")}
        style={{
          top: `${topPct}%`,
          height: `${Math.max(heightPct, 4)}%`,
        }}
        className={
          "absolute left-1 right-1 overflow-hidden rounded-control border border-line bg-surface px-2 py-1 text-left text-[11px] text-ink shadow-sm hover:border-ink/50 focus:outline-none focus:ring-1 focus:ring-ink/40 " +
          dimClass
        }
        aria-label={`Open details for ${job.title}`}
      >
        <div className="flex items-baseline gap-1.5">
          <StatusBadge tone={tone}>{jobStatusLabel(job.status)}</StatusBadge>
        </div>
        <div className="mt-0.5 truncate text-[11px] font-medium text-ink">
          {job.title}
        </div>
        <div className="truncate text-[10px] text-ink-faint">
          {formatSchedulingRange({
            startAt: job.scheduledStartAt,
            endAt: job.scheduledEndAt,
            arrivalWindowLabel: null,
          })}
        </div>
      </button>

      {view === "details" && (
        <DetailsModal
          job={job}
          onClose={() => setView("closed")}
          onReschedule={
            isJobReschedulableStatus(job.status)
              ? () => setView("reschedule")
              : null
          }
          onUnschedule={
            isJobUnschedulableStatus(job.status) ? onUnschedule : null
          }
          unschedulePending={unschedulePending}
          unscheduleError={unscheduleError}
        />
      )}

      <ScheduleJobModal
        open={view === "reschedule"}
        onClose={() => setView("closed")}
        mode="reschedule"
        job={{
          id: job.id,
          title: job.title,
          contactName: job.contactFullName,
          propertyAddressLine: job.propertyAddressLine,
        }}
        initialDate={defaults.date}
        initialStartTime={defaults.startTime}
        initialEndTime={defaults.endTime}
        initialArrivalWindowLabel={defaults.arrivalWindowLabel}
      />
    </>
  );
}

function DetailsModal({
  job,
  onClose,
  onReschedule,
  onUnschedule,
  unschedulePending,
  unscheduleError,
}: {
  job: JobRow;
  onClose: () => void;
  onReschedule: (() => void) | null;
  onUnschedule: (() => void) | null;
  unschedulePending: boolean;
  unscheduleError: string | null;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Job details"
        className="w-full max-w-md rounded-control border border-line bg-surface p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3">
          <div className="mb-1 flex items-center gap-1.5">
            <StatusBadge tone={jobStatusTone(job.status)}>
              {jobStatusLabel(job.status)}
            </StatusBadge>
            <StatusBadge tone="neutral">
              {jobSourceLabel(job.source)}
            </StatusBadge>
          </div>
          <h2 className="text-base font-semibold text-ink">{job.title}</h2>
          {job.summary && (
            <p className="mt-1 text-xs text-ink-muted">{job.summary}</p>
          )}
        </header>

        <dl className="space-y-2 text-xs">
          <Row label="Contact" value={job.contactFullName ?? "—"} />
          <Row label="Property" value={job.propertyAddressLine ?? "—"} />
          <Row
            label="Scheduled"
            value={formatSchedulingRange({
              startAt: job.scheduledStartAt,
              endAt: job.scheduledEndAt,
              arrivalWindowLabel: null,
            })}
          />
          {job.arrivalWindowLabel && (
            <Row label="Arrival window" value={job.arrivalWindowLabel} />
          )}
          <Row
            label="Estimated total"
            value={formatCentsAsDollars(job.estimatedTotalCents)}
          />
        </dl>

        {unscheduleError && (
          <p className="mt-2 text-xs text-danger">{unscheduleError}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/admin/jobs/${job.id}`}
            className="text-xs text-ink-muted underline-offset-2 hover:underline"
          >
            Open job →
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              Close
            </button>
            {onUnschedule && (
              <button
                type="button"
                onClick={onUnschedule}
                disabled={unschedulePending}
                className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
              >
                {unschedulePending ? "…" : "Unschedule"}
              </button>
            )}
            {onReschedule && (
              <button
                type="button"
                onClick={onReschedule}
                className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
              >
                Reschedule
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
