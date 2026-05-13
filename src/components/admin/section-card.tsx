import { cn } from "@/lib/cn";

// Generic card wrapper with optional title/description/actions header.
// Use for grouping related content on a page (e.g. "Recent quote
// interactions" on the dashboard, the staging-tools plan list, etc.).

export type SectionCardProps = {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  padding?: "default" | "tight" | "none";
  className?: string;
  children: React.ReactNode;
};

const PADDING_CLASS: Record<NonNullable<SectionCardProps["padding"]>, string> = {
  default: "p-5",
  tight: "p-3",
  none: "p-0",
};

export function SectionCard({
  title,
  description,
  actions,
  padding = "default",
  className,
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className={PADDING_CLASS[padding]}>{children}</div>
    </section>
  );
}
