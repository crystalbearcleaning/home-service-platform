"use client";

import { useState } from "react";
import {
  checkAndRecordTestAction,
  type RateLimitTestResult,
} from "./actions";

type Props = {
  actionKeys: string[];
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: RateLimitTestResult };

export function RateLimitTestClient({ actionKeys }: Props) {
  const [actionKey, setActionKey] = useState(actionKeys[0] ?? "");
  const [address, setAddress] = useState("123 Main St, Boynton Beach, FL");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });
    const result = await checkAndRecordTestAction({ actionKey, address });
    setState({ kind: "result", result });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">
            Action key
          </label>
          <select
            value={actionKey}
            onChange={(event) => setActionKey(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            {actionKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">
            Address (optional)
          </label>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="123 Main St, Boynton Beach, FL"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Only applied when the action has a per-address limit. Hashed
            before insertion — never stored raw.
          </p>
        </div>

        <button
          type="submit"
          disabled={state.kind === "loading"}
          className="rounded bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {state.kind === "loading"
            ? "Checking…"
            : "Check and record (if allowed)"}
        </button>
      </form>

      {state.kind === "result" && <ResultView result={state.result} />}
    </div>
  );
}

function ResultView({ result }: { result: RateLimitTestResult }) {
  if (!result.ok) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
          Error · {result.error.code}
        </div>
        <p className="mt-1 text-red-900">{result.error.message}</p>
      </div>
    );
  }

  const { data } = result;
  const { check } = data;

  return (
    <div className="space-y-3">
      <div
        className={`rounded border p-4 text-sm ${
          check.allowed
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-700">
              {data.actionKey}
            </div>
            <div className="font-medium mt-1">
              {check.allowed
                ? `Allowed · ${check.remaining} remaining`
                : `Blocked · ${check.reason.replace("_", " ")}`}
            </div>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${
              check.allowed
                ? "bg-green-200 text-green-900"
                : "bg-amber-200 text-amber-900"
            }`}
          >
            {check.allowed ? "allowed" : "blocked"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
          <Field label="limit" value={String(check.limit)} />
          <Field
            label="window (s)"
            value={String(check.windowSeconds)}
          />
          {check.allowed ? (
            <Field label="remaining" value={String(check.remaining)} />
          ) : (
            <Field
              label="retry (s)"
              value={String(check.retryAfterSeconds)}
            />
          )}
          <Field label="reset at" value={check.resetAt} />
        </dl>
      </div>

      <div className="rounded border bg-white p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Inputs (hashed before insert)
        </div>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Field label="client IP (header)" value={data.ipDisplay} />
          <Field label="ip_hash (prefix)" value={data.ipHashPrefix} mono />
          <Field
            label="address used"
            value={data.addressUsed ?? "—"}
          />
          <Field
            label="address_hash (prefix)"
            value={data.addressHashPrefix ?? "—"}
            mono
          />
        </dl>
      </div>

      <div
        className={`rounded border p-4 text-sm ${
          data.recorded
            ? "border-gray-200 bg-gray-50"
            : data.recordError
              ? "border-red-200 bg-red-50"
              : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="text-xs uppercase tracking-wide text-gray-700 font-semibold">
          {data.recorded
            ? "Recorded"
            : data.recordError
              ? `Record error · ${data.recordError.code}`
              : "Not recorded (blocked)"}
        </div>
        <p className="mt-1 text-gray-700">
          {data.recorded &&
            "A row was inserted into rate_limit_events. Click again to walk the bucket down to zero."}
          {data.recordError && data.recordError.message}
          {!data.recorded &&
            !data.recordError &&
            "Blocked requests are not counted toward the bucket. retry in retryAfterSeconds."}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium break-all ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
