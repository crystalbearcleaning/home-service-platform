"use client";

import { useState, useTransition } from "react";
import { retryNotificationLogAction } from "../actions";

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      status: string;
      providerMessageId: string | null;
      newLogId: string;
    }
  | { kind: "err"; code: string; message: string };

export function RetryLogButtonClient({ logId }: { logId: string }) {
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setResult({ kind: "loading" });
    startTransition(async () => {
      const r = await retryNotificationLogAction({ logId });
      if (r.ok) {
        setResult({
          kind: "ok",
          status: r.data.status,
          providerMessageId: r.data.providerMessageId,
          newLogId: r.data.newLogId,
        });
      } else {
        setResult({ kind: "err", code: r.error.code, message: r.error.message });
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || result.kind === "loading"}
        className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted transition hover:border-ink-faint hover:text-ink disabled:opacity-50"
      >
        {result.kind === "loading" ? "Retrying…" : "Retry"}
      </button>
      {result.kind === "ok" && (
        <span className="text-[10px] text-success-strong">
          retry {result.status}
          {result.providerMessageId
            ? ` · msg ${result.providerMessageId.slice(0, 8)}…`
            : ""}
        </span>
      )}
      {result.kind === "err" && (
        <span className="max-w-[200px] text-right text-[10px] text-danger-strong">
          {result.code} — {result.message}
        </span>
      )}
    </span>
  );
}
