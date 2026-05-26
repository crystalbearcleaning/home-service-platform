// Pure validation + parsing helpers for Phase 6C simulation_runs.
//
// No DB access, no env reads, no `server-only` import — these helpers are
// safe to import from client form components for early-feedback parity.

export const SIMULATION_RUN_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export type SimulationRunStatus = (typeof SIMULATION_RUN_STATUSES)[number];

export const SIMULATION_RUN_NAME_MAX_LENGTH = 120;
export const SIMULATION_RUN_NOTES_MAX_LENGTH = 2000;

export type SimulationRunFormInput = {
  name: string;
  startingCashDollars: string | number | null | undefined;
  simulatedStartAt: string | null | undefined;
  notes?: string | null;
  status?: SimulationRunStatus | string | null;
};

export type ValidatedSimulationRun = {
  name: string;
  startingCashCents: number;
  simulatedStartAt: string;
  status: SimulationRunStatus;
  notes: string | null;
};

export type FieldError = { field: string; message: string };

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldError[] };

export type CashParseResult =
  | { ok: true; cents: number }
  | {
      ok: false;
      reason: "EMPTY" | "NOT_A_NUMBER" | "NEGATIVE";
    };

export function parseCashDollarsToCents(
  raw: string | number | null | undefined,
): CashParseResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "EMPTY" };
  const str = typeof raw === "number" ? String(raw) : raw.trim();
  if (str.length === 0) return { ok: false, reason: "EMPTY" };
  const stripped = str.replace(/[$,\s]/g, "");
  const n = Number(stripped);
  if (!Number.isFinite(n)) return { ok: false, reason: "NOT_A_NUMBER" };
  if (n < 0) return { ok: false, reason: "NEGATIVE" };
  return { ok: true, cents: Math.round(n * 100) };
}

export function isSimulationRunStatus(
  value: unknown,
): value is SimulationRunStatus {
  return (
    typeof value === "string" &&
    (SIMULATION_RUN_STATUSES as readonly string[]).includes(value)
  );
}

// Accepts either an ISO string or the value produced by an
// `<input type="datetime-local">` (e.g. `2026-05-26T10:30`). Returns the
// canonical ISO string at UTC for storage.
export function parseSimulatedStart(
  raw: string | null | undefined,
): { ok: true; iso: string } | { ok: false; reason: "EMPTY" | "INVALID" } {
  if (raw === null || raw === undefined) return { ok: false, reason: "EMPTY" };
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return { ok: false, reason: "EMPTY" };
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: "INVALID" };
  return { ok: true, iso: d.toISOString() };
}

export function validateSimulationRunForm(
  input: SimulationRunFormInput,
): ValidationResult<ValidatedSimulationRun> {
  const errors: FieldError[] = [];

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    errors.push({ field: "name", message: "Name is required." });
  } else if (name.length > SIMULATION_RUN_NAME_MAX_LENGTH) {
    errors.push({
      field: "name",
      message: `Name must be ${SIMULATION_RUN_NAME_MAX_LENGTH} characters or fewer.`,
    });
  }

  const cash = parseCashDollarsToCents(input.startingCashDollars);
  if (!cash.ok) {
    const message =
      cash.reason === "EMPTY"
        ? "Starting cash is required."
        : cash.reason === "NEGATIVE"
          ? "Starting cash cannot be negative."
          : "Starting cash must be a number.";
    errors.push({ field: "startingCashDollars", message });
  }

  const start = parseSimulatedStart(input.simulatedStartAt ?? null);
  if (!start.ok) {
    errors.push({
      field: "simulatedStartAt",
      message:
        start.reason === "EMPTY"
          ? "Simulated start date/time is required."
          : "Simulated start date/time is invalid.",
    });
  }

  const rawStatus = input.status ?? "draft";
  const status: SimulationRunStatus = isSimulationRunStatus(rawStatus)
    ? rawStatus
    : "draft";

  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;
  if (notes !== null && notes.length > SIMULATION_RUN_NOTES_MAX_LENGTH) {
    errors.push({
      field: "notes",
      message: `Notes must be ${SIMULATION_RUN_NOTES_MAX_LENGTH} characters or fewer.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  // Both parses are ok here because their failures pushed errors above.
  return {
    ok: true,
    data: {
      name,
      startingCashCents: (cash as { ok: true; cents: number }).cents,
      simulatedStartAt: (start as { ok: true; iso: string }).iso,
      status,
      notes,
    },
  };
}

// Phase 6C single-active-save rule (§5): when a save is marked active,
// every other save on the same workspace that was previously `active`
// drops to `paused`. `draft` and `archived` are not touched.
export function statusesAfterMarkingActive(input: {
  runs: ReadonlyArray<{ id: string; status: SimulationRunStatus }>;
  targetId: string;
}): Array<{ id: string; nextStatus: SimulationRunStatus }> {
  const updates: Array<{ id: string; nextStatus: SimulationRunStatus }> = [];
  for (const r of input.runs) {
    if (r.id === input.targetId) {
      if (r.status !== "active") {
        updates.push({ id: r.id, nextStatus: "active" });
      }
      continue;
    }
    if (r.status === "active") {
      updates.push({ id: r.id, nextStatus: "paused" });
    }
  }
  return updates;
}

export function formatCentsAsDollars(
  cents: number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
