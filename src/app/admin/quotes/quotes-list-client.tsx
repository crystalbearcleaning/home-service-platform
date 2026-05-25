"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type QuoteRow = {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  selectedOptionKey: string | null;
  selectedTotal: number | null;
  sourcePluginVersion: string;
  leadId: string;
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  propertyAddress: string | null;
};

export function QuotesListClient({
  quotes,
  initialQuery,
  initialStatus,
  totalCount,
  statusOptions,
}: {
  quotes: QuoteRow[];
  initialQuery: string;
  initialStatus: string;
  totalCount: number;
  statusOptions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  // Debounced URL sync — same pattern as contacts + automations.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (query.trim().length === 0) sp.delete("q");
      else sp.set("q", query.trim());
      if (!status || status.length === 0) sp.delete("status");
      else sp.set("status", status);
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status]);

  const filtered = quotes;
  const filtering = query.trim().length > 0 || status.length > 0;
  const now = Date.now();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
            Search
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contact name, phone, email, or address…"
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            aria-busy={isPending}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-[11px] text-ink-faint">
        {filtering
          ? `Showing ${filtered.length} of ${totalCount}.`
          : `Showing ${filtered.length} quote${filtered.length === 1 ? "" : "s"}.`}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
          No quotes match the current filter.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((q) => {
            const expired = new Date(q.expiresAt).getTime() < now;
            return (
              <li key={q.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      <Link
                        href={`/admin/contacts/${q.contactId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {q.contactName ?? "—"}
                      </Link>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {q.contactEmail ?? "—"}
                      {q.contactPhone ? ` · ${q.contactPhone}` : ""}
                    </div>
                    {q.propertyAddress && (
                      <div className="mt-1 break-all text-xs text-ink-muted">
                        {q.propertyAddress}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                      >
                        Open quote →
                      </Link>
                      <span className="font-mono text-ink-faint">
                        quote {q.id.slice(0, 8)}… · lead {q.leadId.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap text-[11px]">
                    <StatusPill tone={statusTone(q.status)}>{q.status}</StatusPill>
                    {expired && q.status !== "expired" && (
                      <StatusPill tone="danger">past expires_at</StatusPill>
                    )}
                    <span className="text-ink-muted">
                      {q.selectedOptionKey ?? "—"}{" "}
                      {q.selectedTotal !== null ? `· $${q.selectedTotal}` : ""}
                    </span>
                    <span className="text-ink-faint">
                      expires {new Date(q.expiresAt).toLocaleDateString()}
                    </span>
                    <span className="text-ink-faint">
                      {new Date(q.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "info" | "warning" | "danger" | "default";
  children: React.ReactNode;
}) {
  const cls: Record<typeof tone, string> = {
    info: "border-info bg-info-soft text-info-strong",
    warning: "border-warning bg-warning-soft text-warning-strong",
    danger: "border-danger bg-danger-soft text-danger-strong",
    default: "border-line bg-surface text-ink-muted",
  };
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls[tone]}`}
    >
      {children}
    </span>
  );
}

function statusTone(status: string): "info" | "warning" | "danger" | "default" {
  switch (status) {
    case "submitted":
      return "info";
    case "expired":
      return "warning";
    case "void":
      return "danger";
    default:
      return "default";
  }
}
