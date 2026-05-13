import { cn } from "@/lib/cn";
import type { StatusTone } from "./status-badge";

// Compact metric card. Used in dashboard grids and section headers.
// Keep the API small — label + value covers most cases; description and
// tone are optional.

export type StatCardProps = {
  label: string;
  value: React.ReactNode;
  description?: string;
  tone?: StatusTone;
  icon?: React.ReactNode;
  className?: string;
};

const TONE_VALUE_CLASS: Record<StatusTone, string> = {
  default: "text-ink",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
  info: "text-info-strong",
  neutral: "text-ink",
  brand: "text-brand-strong",
};

export function StatCard({
  label,
  value,
  description,
  tone = "default",
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </div>
        {icon && <div className="text-ink-faint">{icon}</div>}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold", TONE_VALUE_CLASS[tone])}>
        {value}
      </div>
      {description && (
        <div className="mt-1 text-xs text-ink-muted">{description}</div>
      )}
    </div>
  );
}
