"use client";

import { useState } from "react";
import { resetStagingDataAction } from "./actions";

// Keep this constant in sync with REQUIRED_CONFIRMATION in actions.ts —
// the server re-checks it.
const REQUIRED_CONFIRMATION = "RESET QUOTE FLOW DATA";

type Counts = Record<string, number>;

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done"; counts: Counts; businessId: string }
  | { kind: "error"; message: string };

export function ResetButtonClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [typed, setTyped] = useState("");

  async function run() {
    setState({ kind: "running" });
    let result;
    try {
      result = await resetStagingDataAction({ confirmation: typed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        kind: "error",
        message: `Action call failed: ${message}`,
      });
      return;
    }
    if (!result.ok) {
      setState({ kind: "error", message: result.error.message });
      return;
    }
    setState({
      kind: "done",
      counts: result.data.counts,
      businessId: result.data.businessId,
    });
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-card border border-success bg-success-soft p-4 text-sm">
        <p className="font-medium text-success-strong">Reset complete.</p>
        <p className="mt-1 text-xs text-success-strong">
          business{" "}
          <code className="font-mono">{state.businessId.slice(0, 8)}…</code>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-success-strong sm:grid-cols-3">
          {Object.entries(state.counts).map(([table, count]) => (
            <div key={table}>
              <dt className="uppercase tracking-wide opacity-80">{table}</dt>
              <dd className="font-medium">{count}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "idle" });
            setTyped("");
          }}
          className="mt-3 text-xs text-success-strong underline"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-card border border-danger bg-danger-soft p-4 text-sm">
      <div>
        <p className="font-semibold text-danger-strong">
          Destructive: this deletes quote-flow test data.
        </p>
        <p className="mt-1 text-xs text-danger-strong">
          Type{" "}
          <code className="rounded border border-danger bg-surface px-1 font-mono">
            {REQUIRED_CONFIRMATION}
          </code>{" "}
          below, then click Reset.
        </p>
      </div>

      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        disabled={state.kind === "running"}
        placeholder={REQUIRED_CONFIRMATION}
        className="w-full rounded-control border border-danger bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-danger/30 disabled:opacity-60"
        autoComplete="off"
        spellCheck={false}
      />

      <button
        type="button"
        onClick={run}
        disabled={
          typed.trim() !== REQUIRED_CONFIRMATION || state.kind === "running"
        }
        className="w-full rounded-control bg-danger py-2 text-sm font-medium text-surface transition hover:bg-danger-strong disabled:opacity-40"
      >
        {state.kind === "running" ? "Resetting…" : "Reset quote-flow data"}
      </button>

      {state.kind === "error" && (
        <p className="rounded-control border border-danger bg-surface p-2 text-xs text-danger-strong">
          {state.message}
        </p>
      )}
    </div>
  );
}
