"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type ContactRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  primaryProperty: {
    id: string;
    formattedAddress: string;
    city: string;
  } | null;
  latestLeadStatus: string | null;
  latestQuoteStatus: string | null;
  openTaskCount: number;
  lastActivityAt: string | null;
};

export function ContactsListClient({
  contacts,
  initialQuery,
  totalCount,
}: {
  contacts: ContactRow[];
  initialQuery: string;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // Debounce URL update so typing doesn't fire a navigation per keystroke.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const showingFiltered = query.trim().length > 0 && contacts.length !== totalCount;

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
          placeholder="Name, phone, email, address…"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          aria-busy={isPending}
        />
        <div className="mt-1 text-[11px] text-ink-faint">
          {showingFiltered
            ? `Showing ${contacts.length} of ${totalCount}.`
            : `Showing ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`}
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
          No contacts match this search.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/contacts/${c.id}`}
                className="block rounded-control p-3 transition hover:bg-surface-muted"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {c.fullName}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {c.email} · {c.phone}
                    </div>
                    {c.primaryProperty && (
                      <div className="mt-1 break-all text-xs text-ink-muted">
                        {c.primaryProperty.formattedAddress}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px]">
                    {c.latestQuoteStatus && (
                      <span className="text-ink-muted">
                        quote · <strong>{c.latestQuoteStatus}</strong>
                      </span>
                    )}
                    {c.latestLeadStatus && (
                      <span className="text-ink-muted">
                        lead · {c.latestLeadStatus.replace(/_/g, " ")}
                      </span>
                    )}
                    {c.openTaskCount > 0 && (
                      <span className="rounded-pill border border-warning bg-warning-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-warning-strong">
                        {c.openTaskCount} open task
                        {c.openTaskCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {c.lastActivityAt && (
                      <span className="text-ink-faint">
                        last activity{" "}
                        {new Date(c.lastActivityAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
