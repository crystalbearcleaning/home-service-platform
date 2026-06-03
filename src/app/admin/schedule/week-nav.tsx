import Link from "next/link";

import { formatWeekKey } from "@/core/jobs/scheduling";

// Phase 10C — server-rendered week navigation strip.
// Prev / Today / Next links route via `?week=YYYY-MM-DD` (Monday of
// the visible week). "Today" is the effective-today week, which is
// `simulated_current_at` in a simulation workspace with an active
// save, otherwise `new Date()`.

type Props = {
  visibleWeekStart: Date;
  todayWeekStart: Date;
  todayLabel: string; // shown next to the Today button
};

function shiftWeek(weekStart: Date, weeks: number): Date {
  return new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + weeks * 7,
    0,
    0,
    0,
    0,
  );
}

function weekRangeLabel(start: Date): string {
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
    0,
    0,
    0,
    0,
  );
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${fmt(start)} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

export function WeekNav({
  visibleWeekStart,
  todayWeekStart,
  todayLabel,
}: Props) {
  const prev = formatWeekKey(shiftWeek(visibleWeekStart, -1));
  const next = formatWeekKey(shiftWeek(visibleWeekStart, 1));
  const today = formatWeekKey(todayWeekStart);
  const isTodayWeek =
    formatWeekKey(visibleWeekStart) === formatWeekKey(todayWeekStart);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Link
        href={`/admin/schedule?week=${prev}`}
        className="rounded-control border border-line bg-surface px-2.5 py-1 text-ink-muted hover:text-ink"
      >
        ← Prev
      </Link>
      <Link
        href={`/admin/schedule?week=${today}`}
        aria-current={isTodayWeek ? "page" : undefined}
        className={
          "rounded-control border px-2.5 py-1 " +
          (isTodayWeek
            ? "border-ink bg-surface text-ink"
            : "border-line bg-surface text-ink-muted hover:text-ink")
        }
      >
        Today
      </Link>
      <Link
        href={`/admin/schedule?week=${next}`}
        className="rounded-control border border-line bg-surface px-2.5 py-1 text-ink-muted hover:text-ink"
      >
        Next →
      </Link>
      <span className="ml-2 text-ink-faint">
        {weekRangeLabel(visibleWeekStart)}
      </span>
      {!isTodayWeek && (
        <span className="text-ink-faint">· today is {todayLabel}</span>
      )}
    </div>
  );
}
