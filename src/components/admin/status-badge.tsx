import { cn } from "@/lib/cn";

// Small pill used to communicate status / category. Tone-driven; never
// build one-off colored spans on pages — use this and pick a tone.

export type StatusTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

const TONE_CLASSES: Record<StatusTone, string> = {
  default: "bg-surface-muted text-ink-muted",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  neutral: "bg-neutral-soft text-neutral-strong",
  brand: "bg-brand/10 text-brand-strong",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  default: "bg-ink-faint",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
  brand: "bg-brand",
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function StatusBadge({
  tone = "default",
  dot = false,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-pill", DOT_CLASSES[tone])}
        />
      )}
      {children}
    </span>
  );
}
