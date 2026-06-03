"use client";

import { useState, useTransition } from "react";

import { JOB_STATUSES, type JobStatus } from "@/core/jobs/constants";
import { jobStatusLabel } from "@/core/jobs/display";

import { updateJobStatusAction } from "../actions";

type Props = {
  jobId: string;
  initialStatus: JobStatus;
};

export function StatusControl({ jobId, initialStatus }: Props) {
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onChange(next: string) {
    setError(null);
    setSuccess(false);
    const prev = status;
    setStatus(next as JobStatus);
    start(async () => {
      const r = await updateJobStatusAction({ jobId, status: next });
      if (!r.ok) {
        setStatus(prev);
        setError(r.error.message);
      } else {
        setSuccess(true);
        // Soft-reset the success indicator after a beat.
        setTimeout(() => setSuccess(false), 1500);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="text-ink-muted" htmlFor="job-status-select">
        Status:
      </label>
      <select
        id="job-status-select"
        value={status}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className="rounded-control border border-line bg-surface px-2 py-1 text-xs"
      >
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s}>
            {jobStatusLabel(s)}
          </option>
        ))}
      </select>
      {isPending && <span className="text-ink-faint">Saving…</span>}
      {success && <span className="text-success">Saved.</span>}
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
