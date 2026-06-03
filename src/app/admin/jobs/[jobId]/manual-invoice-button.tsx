"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createInvoiceFromJobAction } from "../actions";

type Props = {
  jobId: string;
  existingInvoiceCount: number;
};

export function ManualInvoiceButton({ jobId, existingInvoiceCount }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label =
    existingInvoiceCount > 0
      ? "Create another invoice from this job"
      : "Create invoice from this job (manual)";

  function onClick() {
    if (existingInvoiceCount > 0) {
      if (
        !window.confirm(
          `This job already has ${existingInvoiceCount} invoice${
            existingInvoiceCount === 1 ? "" : "s"
          }. Create another?`,
        )
      ) {
        return;
      }
    }
    setError(null);
    start(async () => {
      const r = await createInvoiceFromJobAction({ jobId });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.push(`/admin/invoices/${r.data.invoiceId}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
      >
        {pending ? "Creating…" : label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
