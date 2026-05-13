import { cn } from "@/lib/cn";

// Label / value pair grid. Use inside SectionCards (Quote detail, Lead
// detail, etc.) when showing a record's fields. Replaces every existing
// inline <dl><dt><dd> block on admin pages.

export type DetailGridItem = {
  label: string;
  value: React.ReactNode;
  // Optional emphasis — "muted" reduces the value weight (useful for
  // "—" placeholders and ids).
  tone?: "default" | "muted";
};

export type DetailGridProps = {
  items: DetailGridItem[];
  columns?: 2 | 3 | 4;
  className?: string;
};

const COL_CLASSES: Record<NonNullable<DetailGridProps["columns"]>, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function DetailGrid({
  items,
  columns = 3,
  className,
}: DetailGridProps) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", COL_CLASSES[columns], className)}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          <dt className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 text-sm break-words",
              item.tone === "muted" ? "text-ink-muted" : "text-ink font-medium",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
