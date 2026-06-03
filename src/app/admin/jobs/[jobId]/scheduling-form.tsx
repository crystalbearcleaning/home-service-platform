"use client";

import { useState, useTransition } from "react";

import { updateJobSchedulingAction } from "../actions";

type Props = {
  jobId: string;
  initialStartAt: string | null;
  initialEndAt: string | null;
  initialArrivalWindowLabel: string | null;
};

// Convert an ISO timestamp into a `datetime-local` input value
// (`YYYY-MM-DDTHH:MM`). The input renders in the operator's local tz;
// the server normalises back to ISO on save.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  } catch {
    return "";
  }
}

export function SchedulingForm({
  jobId,
  initialStartAt,
  initialEndAt,
  initialArrivalWindowLabel,
}: Props) {
  const [startAt, setStartAt] = useState(isoToLocalInput(initialStartAt));
  const [endAt, setEndAt] = useState(isoToLocalInput(initialEndAt));
  const [arrival, setArrival] = useState(initialArrivalWindowLabel ?? "");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [success, setSuccess] = useState(false);
  const [isPending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSuccess(false);
    start(async () => {
      const r = await updateJobSchedulingAction({
        jobId,
        scheduledStartAt: startAt || null,
        scheduledEndAt: endAt || null,
        arrivalWindowLabel: arrival.trim() || null,
      });
      if (!r.ok) {
        setErrors({
          ...(r.error.fieldErrors ?? {}),
          _form: r.error.message,
        });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 1500);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Start" error={errors.scheduledStartAt}>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="End" error={errors.scheduledEndAt}>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Arrival window" error={errors.arrivalWindowLabel}>
          <input
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            maxLength={120}
            placeholder="8–10 AM"
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      {errors._form && (
        <p className="text-xs text-danger">{errors._form}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save scheduling"}
        </button>
        {success && (
          <span className="text-xs text-success">Saved.</span>
        )}
      </div>
    </form>
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
