"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createJobFromQuoteAction } from "../../jobs/actions";

type Props = {
  quoteId: string;
  hasExistingJobs: boolean;
};

export function CreateJobButton({ quoteId, hasExistingJobs }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const r = await createJobFromQuoteAction({ quoteId });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.push(`/admin/jobs/${r.data.jobId}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-control bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {isPending
          ? "Creating job…"
          : hasExistingJobs
            ? "Create another job"
            : "Create job"}
      </button>
      {hasExistingJobs && (
        <span className="text-[11px] text-ink-faint">
          A job already exists for this quote. Re-conversion is allowed.
        </span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
