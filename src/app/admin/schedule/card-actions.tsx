"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { unscheduleJobAction } from "./actions";
import { computeScheduleDefaults } from "./modal-helpers";
import { ScheduleJobModal } from "./schedule-job-modal";

type JobLite = {
  id: string;
  title: string;
  contactFullName: string | null;
  propertyAddressLine: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
};

// -------------------------------------------------------------------------
// Schedule (unscheduled → scheduled)
// -------------------------------------------------------------------------

export function ScheduleAction({
  job,
  fallbackDate,
}: {
  job: JobLite;
  fallbackDate: string;
}) {
  const [open, setOpen] = useState(false);
  const defaults = computeScheduleDefaults({
    existingStartIso: null,
    existingEndIso: null,
    existingArrivalWindowLabel: null,
    fallbackDate,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control bg-accent px-2.5 py-1 text-[11px] text-on-accent hover:opacity-90"
      >
        Schedule
      </button>
      <ScheduleJobModal
        open={open}
        onClose={() => setOpen(false)}
        mode="schedule"
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

// -------------------------------------------------------------------------
// Reschedule (scheduled → scheduled, new times)
// -------------------------------------------------------------------------

export function RescheduleAction({
  job,
  fallbackDate,
  size = "default",
}: {
  job: JobLite;
  fallbackDate: string;
  size?: "default" | "tiny";
}) {
  const [open, setOpen] = useState(false);
  const defaults = computeScheduleDefaults({
    existingStartIso: job.scheduledStartAt,
    existingEndIso: job.scheduledEndAt,
    existingArrivalWindowLabel: job.arrivalWindowLabel,
    fallbackDate,
  });

  const classes =
    size === "tiny"
      ? "rounded-control border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted hover:text-ink"
      : "rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted hover:text-ink";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={classes}>
        Reschedule
      </button>
      <ScheduleJobModal
        open={open}
        onClose={() => setOpen(false)}
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

// -------------------------------------------------------------------------
// Unschedule (scheduled → unscheduled)
// -------------------------------------------------------------------------

export function UnscheduleAction({
  jobId,
  title,
  size = "default",
}: {
  jobId: string;
  title: string;
  size?: "default" | "tiny";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        `Unschedule "${title}"? It will move back to the Unscheduled panel.`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const result = await unscheduleJobAction({ jobId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  const classes =
    size === "tiny"
      ? "rounded-control border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-muted hover:text-ink disabled:opacity-50"
      : "rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted hover:text-ink disabled:opacity-50";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={classes}
      >
        {pending ? "…" : "Unschedule"}
      </button>
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </span>
  );
}
