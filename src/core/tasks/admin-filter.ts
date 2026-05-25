// Pure filter helpers for the Phase 4E Tasks list. Mirrors the
// contacts / quotes / automations search pattern — no DB, no
// fetch, fully unit-testable.

export type TaskFilterable = {
  status: string;
  taskCategory: string;
};

export const TASK_STATUS_VALUES = [
  "open",
  "completed",
  "canceled",
] as const;
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

// Drawn from the Phase 1 schema + Phase 3 quote-flow usage. Listed
// explicitly so future categories don't silently appear in the filter
// without being acknowledged.
export const TASK_CATEGORY_VALUES = [
  "schedule_request",
  "manual_quote",
  "service_area_review",
  "admin_review",
  "issue_review",
] as const;
export type TaskCategory = (typeof TASK_CATEGORY_VALUES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS_VALUES as readonly string[]).includes(value);
}

export function isTaskCategory(value: string): value is TaskCategory {
  return (TASK_CATEGORY_VALUES as readonly string[]).includes(value);
}

function matchesStatus<T extends TaskFilterable>(
  row: T,
  status: string | null | undefined,
): boolean {
  if (!status || status.length === 0 || status === "all") return true;
  return row.status === status;
}

function matchesCategory<T extends TaskFilterable>(
  row: T,
  category: string | null | undefined,
): boolean {
  if (!category || category.length === 0 || category === "all") return true;
  return row.taskCategory === category;
}

export function filterTasks<T extends TaskFilterable>(
  rows: T[],
  input: { status?: string | null; category?: string | null },
): T[] {
  const hasStatus = !!input.status && input.status !== "all";
  const hasCategory = !!input.category && input.category !== "all";
  if (!hasStatus && !hasCategory) return rows;
  return rows.filter(
    (r) =>
      matchesStatus(r, input.status) && matchesCategory(r, input.category),
  );
}
