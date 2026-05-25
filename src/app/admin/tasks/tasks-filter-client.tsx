"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function TasksFilterClient({
  initialStatus,
  initialCategory,
  statusOptions,
  categoryOptions,
  showingCount,
  totalCount,
}: {
  initialStatus: string;
  initialCategory: string;
  statusOptions: string[];
  categoryOptions: string[];
  showingCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState(initialCategory);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (!status || status.length === 0) sp.delete("status");
      else sp.set("status", status);
      if (!category || category.length === 0) sp.delete("category");
      else sp.set("category", category);
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  const filtering = status.length > 0 || category.length > 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            aria-busy={isPending}
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-[11px] text-ink-faint">
        {filtering
          ? `Showing ${showingCount} of ${totalCount}.`
          : `Showing ${showingCount} task${showingCount === 1 ? "" : "s"}.`}
      </div>
    </div>
  );
}
