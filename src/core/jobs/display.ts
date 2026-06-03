// Pure presentation helpers for the Phase 9C Jobs UI.
//
// No DB, no env, no `server-only`. Safe to import from client OR
// server components. Centralised so the list, detail, and any
// future Phase 9D edit forms render the same labels + tones.

import type { JobLineItemSource, JobSource, JobStatus } from "./constants";

export type JobStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Canceled",
};

// Tones map to the existing <StatusBadge> taxonomy
// (`neutral` / `success` / `warning` / `danger` / `info`).
const STATUS_TONES: Record<JobStatus, JobStatusTone> = {
  draft: "neutral",
  unscheduled: "info",
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
  canceled: "danger",
};

const SOURCE_LABELS: Record<JobSource, string> = {
  manual: "Manual",
  quote: "From quote",
};

const LINE_ITEM_SOURCE_LABELS: Record<JobLineItemSource, string> = {
  quote: "From quote",
  service: "Catalog",
  custom: "Custom",
};

export function jobStatusLabel(status: string): string {
  return STATUS_LABELS[status as JobStatus] ?? status;
}

export function jobStatusTone(status: string): JobStatusTone {
  return STATUS_TONES[status as JobStatus] ?? "neutral";
}

export function jobSourceLabel(source: string): string {
  return SOURCE_LABELS[source as JobSource] ?? source;
}

export function jobLineItemSourceLabel(source: string): string {
  return LINE_ITEM_SOURCE_LABELS[source as JobLineItemSource] ?? source;
}

// $1,234.56 — no currency symbol localisation in Phase 9 (USD only).
// Falls back to "—" for null / non-finite inputs so the list/detail
// templates never render "NaN" or "$undefined".
export function formatCentsAsDollars(
  cents: number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isFinite(cents)) return "—";
  const value = Math.trunc(cents) / 100;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Quantities are stored as numeric(10,2). The UI shows "1" instead of
// "1.00" when the value is a whole number to keep the line readable.
export function formatJobQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined) return "—";
  if (!Number.isFinite(quantity)) return "—";
  if (Number.isInteger(quantity)) return String(quantity);
  // Trim trailing zeroes ("1.50" → "1.5") but keep at least one decimal.
  return quantity
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

// Two scheduling formatters — one for a single timestamp ("Scheduled
// start"), one for a start + end range ("scheduled window"). The range
// formatter falls back to start-only / end-only / "—" so the list page
// stays readable when scheduling is partially filled in.
export function formatSchedulingTimestamp(
  iso: string | null | undefined,
): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export function formatSchedulingRange(input: {
  startAt: string | null | undefined;
  endAt: string | null | undefined;
  arrivalWindowLabel?: string | null;
}): string {
  const start = formatSchedulingTimestamp(input.startAt ?? null);
  const end = formatSchedulingTimestamp(input.endAt ?? null);
  const label = (input.arrivalWindowLabel ?? "").trim();

  let body: string;
  if (start === "—" && end === "—") body = "Not scheduled";
  else if (start !== "—" && end !== "—") body = `${start} → ${end}`;
  else if (start !== "—") body = start;
  else body = end;

  return label.length > 0 ? `${body} · ${label}` : body;
}
