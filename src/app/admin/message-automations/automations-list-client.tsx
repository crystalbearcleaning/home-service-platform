"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

// Pure data shape — keep this client component independent of server-only
// loader types so the bundle stays small.
type ListRow = {
  id: string;
  automationKey: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerFilters: Record<string, unknown> | null;
  channel: string;
  providerKey: string;
  isEnabled: boolean;
  recipientCount: number;
  lastLog: {
    id: string;
    status: "pending" | "sent" | "failed" | "skipped";
    createdAt: string;
  } | null;
};

export function AutomationsListClient({
  automations,
  initialQuery,
  totalCount,
}: {
  automations: ListRow[];
  initialQuery: string;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // Debounce the URL update so typing doesn't fire a navigation per
  // keystroke. The server component re-runs filterAutomations on
  // change.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (query.trim().length === 0) sp.delete("q");
      else sp.set("q", query.trim());
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    }, 200);
    return () => clearTimeout(t);
    // We only react to query input, not searchParams (router pushes update
    // searchParams when the user navigates back).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const showingFiltered = query.trim().length > 0 && automations.length !== totalCount;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
          Search
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, description, or automation_key…"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          aria-busy={isPending}
        />
        <div className="mt-1 text-[11px] text-ink-faint">
          {showingFiltered
            ? `Showing ${automations.length} of ${totalCount}.`
            : `Showing ${automations.length} automation${automations.length === 1 ? "" : "s"}.`}
        </div>
      </div>

      {automations.length === 0 ? (
        <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
          No automations match this search.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {automations.map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/message-automations/${a.id}`}
                className="block rounded-control p-3 transition hover:bg-surface-muted"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{a.name}</div>
                    {a.description && (
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {a.description}
                      </div>
                    )}
                  </div>
                  <EnabledPill enabled={a.isEnabled} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
                  <code>{a.automationKey}</code>
                  <span>·</span>
                  <span>
                    <span className="text-ink-muted">trigger</span>{" "}
                    <code>{a.triggerType}</code>
                    {a.triggerFilters && Object.keys(a.triggerFilters).length > 0 && (
                      <>
                        {" "}
                        <code>{JSON.stringify(a.triggerFilters)}</code>
                      </>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="text-ink-muted">channel</span> {a.channel}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="text-ink-muted">provider</span>{" "}
                    {a.providerKey}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="text-ink-muted">recipients</span>{" "}
                    {a.recipientCount}
                  </span>
                  {a.lastLog && (
                    <>
                      <span>·</span>
                      <span>
                        <span className="text-ink-muted">last send</span>{" "}
                        <strong>{a.lastLog.status}</strong>{" "}
                        {new Date(a.lastLog.createdAt).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnabledPill({ enabled }: { enabled: boolean }) {
  const tone = enabled
    ? "border-success bg-success-soft text-success-strong"
    : "border-line bg-surface-muted text-ink-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-pill ${enabled ? "bg-success" : "bg-ink-faint"}`}
      />
      {enabled ? "enabled" : "disabled"}
    </span>
  );
}
