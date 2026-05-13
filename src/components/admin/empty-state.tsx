import { cn } from "@/lib/cn";

// Soft empty state used when a list / section has no rows. Friendly
// copy, optional CTA. Always preferable to a bare "No rows" string.

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-line bg-surface-muted px-5 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-pill bg-surface text-ink-faint">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
