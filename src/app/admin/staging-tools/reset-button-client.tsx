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
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <p className="font-medium text-green-900">Reset complete.</p>
        <p className="text-xs text-green-900 mt-1">
          business <code className="font-mono">{state.businessId.slice(0, 8)}…</code>
        </p>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-green-900">
          {Object.entries(state.counts).map(([table, count]) => (
            <div key={table}>
              <dt className="text-green-800/80 uppercase tracking-wide">
                {table}
              </dt>
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
          className="mt-3 text-xs underline"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm space-y-3">
      <div>
        <p className="font-semibold text-red-900">
          Destructive: this deletes quote-flow test data.
        </p>
        <p className="text-xs text-red-900 mt-1">
          Type{" "}
          <code className="font-mono bg-white border border-red-200 rounded px-1">
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
        className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
        autoComplete="off"
        spellCheck={false}
      />

      <button
        type="button"
        onClick={run}
        disabled={
          typed.trim() !== REQUIRED_CONFIRMATION || state.kind === "running"
        }
        className="w-full rounded-lg bg-red-700 text-white py-2 text-sm font-medium disabled:opacity-40"
      >
        {state.kind === "running"
          ? "Resetting…"
          : "Reset quote-flow data"}
      </button>

      {state.kind === "error" && (
        <p className="text-xs text-red-700 bg-white border border-red-200 rounded p-2">
          {state.message}
        </p>
      )}
    </div>
  );
}
