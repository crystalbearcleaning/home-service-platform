"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markReceiptSentAction } from "../actions";

type Props = {
  invoiceId: string;
};

export function MarkReceiptSentButton({ invoiceId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        "Mark receipt as sent? This only records that you sent it manually. It will not send an email or text.",
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const r = await markReceiptSentAction({ invoiceId });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
      >
        {pending ? "Marking…" : "Mark receipt sent"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
