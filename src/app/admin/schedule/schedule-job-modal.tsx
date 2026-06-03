"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  rescheduleJobAction,
  scheduleJobAction,
  type ScheduleActionResult,
  type ScheduleConflictDTO,
} from "./actions";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "schedule" | "reschedule";
  job: {
    id: string;
    title: string;
    contactName: string | null;
    propertyAddressLine: string | null;
  };
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  initialArrivalWindowLabel: string;
};

export function ScheduleJobModal({
  open,
  onClose,
  mode,
  job,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialArrivalWindowLabel,
}: Props) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [arrival, setArrival] = useState(initialArrivalWindowLabel);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<ScheduleConflictDTO[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return null;

  function clearConflicts() {
    if (conflicts.length > 0) setConflicts([]);
  }

  function submit(confirmOverlap: boolean) {
    setErrors({});
    setServerError(null);

    const input = {
      jobId: job.id,
      date,
      startTime,
      endTime,
      arrivalWindowLabel: arrival.trim() || null,
      confirmOverlap,
    };

    start(async () => {
      const result: ScheduleActionResult =
        mode === "schedule"
          ? await scheduleJobAction(input)
          : await rescheduleJobAction(input);

      if (result.ok) {
        setConflicts([]);
        router.refresh();
        onClose();
        return;
      }

      if (
        result.error.code === "OVERLAP_WARNING" &&
        Array.isArray(result.error.conflicts)
      ) {
        setConflicts(result.error.conflicts);
        return;
      }

      if (result.error.fieldErrors) {
        setErrors(result.error.fieldErrors);
      }
      setServerError(result.error.message);
    });
  }

  const title = mode === "schedule" ? "Schedule job" : "Reschedule job";
  const submitLabel = mode === "schedule" ? "Schedule" : "Save";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-control border border-line bg-surface p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-ink-muted">{job.title}</p>
          {job.contactName && (
            <p className="text-[11px] text-ink-faint">
              {job.contactName}
              {job.propertyAddressLine
                ? ` · ${job.propertyAddressLine}`
                : ""}
            </p>
          )}
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="space-y-3"
        >
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearConflicts();
              }}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Start time" error={errors.startTime}>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  clearConflicts();
                }}
                className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="End time" error={errors.endTime}>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  clearConflicts();
                }}
                className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Arrival window (optional)">
            <input
              type="text"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              placeholder="8–10 AM"
              maxLength={120}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>

          {conflicts.length > 0 && (
            <div className="rounded-control border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="font-medium text-ink">
                Overlaps {conflicts.length} other job
                {conflicts.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-muted">
                {conflicts.map((c) => (
                  <li key={c.jobId}>
                    <a
                      href={`/admin/jobs/${c.jobId}`}
                      target="_blank"
                      rel="noopener"
                      className="hover:underline"
                    >
                      {c.title}
                    </a>
                    <span className="ml-1 text-ink-faint">
                      ({formatRangeLocal(c.start, c.end)})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-ink-faint">
                No crew assignment exists yet — overlap may be valid.
                Confirm anyway to schedule.
              </p>
            </div>
          )}

          {serverError && conflicts.length === 0 && (
            <p className="text-xs text-danger">{serverError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            {conflicts.length > 0 ? (
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={pending}
                className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Confirm anyway"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : submitLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

function formatRangeLocal(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    return `${s.toLocaleString()} → ${e.toLocaleTimeString()}`;
  } catch {
    return "";
  }
}
