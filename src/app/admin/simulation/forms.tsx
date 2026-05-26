"use client";

import { useState, useTransition } from "react";
import {
  createSimulationRunAction,
  markSimulationRunActiveAction,
} from "./actions";

type FieldErrors = Record<string, string | undefined>;

// Local-time datetime-local default ("2026-05-26T10:00") rather than ISO,
// so the input renders in the operator's tz. The server normalises to ISO.
function defaultStartLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

export function SimulationRunCreateForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cash, setCash] = useState("1000");
  const [startAt, setStartAt] = useState(defaultStartLocal());
  const [notes, setNotes] = useState("");
  const [markActive, setMarkActive] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setName("");
    setCash("1000");
    setStartAt(defaultStartLocal());
    setNotes("");
    setMarkActive(false);
    setErrors({});
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {success && (
          <p className="text-xs text-success">{success}</p>
        )}
        <button
          type="button"
          onClick={() => {
            setSuccess(null);
            setOpen(true);
          }}
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          + New save
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setSuccess(null);
        start(async () => {
          const r = await createSimulationRunAction({
            name,
            startingCashDollars: cash,
            simulatedStartAt: startAt,
            notes: notes || null,
            markActive,
          });
          if (r.ok) {
            setSuccess(
              markActive
                ? "Save created and marked active."
                : "Save created.",
            );
            reset();
            setOpen(false);
          } else {
            setErrors({
              ...(r.error.fieldErrors ?? {}),
              _form: r.error.message,
            });
          }
        });
      }}
      className="space-y-3 rounded-control border border-line bg-surface p-3"
    >
      <div className="text-sm font-medium text-ink">New simulation save</div>

      <Field label="Name" error={errors.name}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          placeholder="Starter save"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Starting cash (USD)"
          error={errors.startingCashDollars}
        >
          <input
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            required
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            placeholder="1000"
          />
        </Field>
        <Field
          label="Simulated start date/time"
          error={errors.simulatedStartAt}
        >
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="Notes (optional)" error={errors.notes}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={markActive}
          onChange={(e) => setMarkActive(e.target.checked)}
        />
        Make this the active save
      </label>

      {errors._form && (
        <p className="text-xs text-danger">{errors._form}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-control bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create save"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MakeActiveButton({
  runId,
  disabled,
}: {
  runId: string;
  disabled?: boolean;
}) {
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await markSimulationRunActiveAction({ runId });
            if (!r.ok) setError(r.error.message);
          });
        }}
        className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
      >
        {isPending ? "Activating…" : "Make active"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}
