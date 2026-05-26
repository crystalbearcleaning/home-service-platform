"use client";

import { useState, useTransition } from "react";

import {
  formatDurationSeconds,
  formatHangActivitySummary,
} from "@/plugins/door-hanger/simulation";

import {
  hangCustomAction,
  hangOneAction,
  hangRouteAction,
  type HangActionPayload,
} from "./actions";

// =========================================================================
// Phase 7D-2 — Hang 1 / Hang custom / Hang route client controls.
//
// Each action calls a server action that delegates to the atomic
// `door_hanger_simulation_hang` Postgres function. The result includes
// `effectiveCount`, `cappedBy`, `timeAdvancedSeconds`, and
// `routeCompleted` so the operator gets immediate feedback even before
// the server-rendered card refreshes.
// =========================================================================

type Props = {
  secondsPerHanger: number;
  remainingInventory: number;
  // Best-effort remaining target for the time-cost preview. Equals
  // pending stops when route_stops exist, otherwise target -
  // distributed. May be null when neither is set.
  remainingTarget: number | null;
};

type ActionResultBanner =
  | { kind: "success"; payload: HangActionPayload }
  | { kind: "error"; message: string }
  | null;

type FieldErrors = Record<string, string | undefined>;

export function HangActionsCard({
  secondsPerHanger,
  remainingInventory,
  remainingTarget,
}: Props) {
  const [customAmount, setCustomAmount] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<ActionResultBanner>(null);
  const [isPending, start] = useTransition();

  function runOne() {
    setErrors({});
    setBanner(null);
    start(async () => {
      const r = await hangOneAction();
      if (r.ok) setBanner({ kind: "success", payload: r.data });
      else setBanner({ kind: "error", message: r.error.message });
    });
  }

  function runCustom() {
    setErrors({});
    setBanner(null);
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) {
      setErrors({ amount: "Enter 1 or more." });
      return;
    }
    start(async () => {
      const r = await hangCustomAction({ amount });
      if (r.ok) {
        setBanner({ kind: "success", payload: r.data });
        setCustomAmount("");
      } else {
        setErrors(r.error.fieldErrors ?? {});
        setBanner({ kind: "error", message: r.error.message });
      }
    });
  }

  function runRoute() {
    setErrors({});
    setBanner(null);
    start(async () => {
      const r = await hangRouteAction();
      if (r.ok) setBanner({ kind: "success", payload: r.data });
      else setBanner({ kind: "error", message: r.error.message });
    });
  }

  const customNumeric = Number(customAmount);
  const customPreview =
    Number.isFinite(customNumeric) &&
    Number.isInteger(customNumeric) &&
    customNumeric >= 1
      ? customNumeric * secondsPerHanger
      : null;

  const routePreviewCount = computeRoutePreviewCount(
    remainingInventory,
    remainingTarget,
  );
  const routePreviewTime =
    routePreviewCount > 0 ? routePreviewCount * secondsPerHanger : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={runOne}
            disabled={isPending || remainingInventory <= 0}
            className="w-full rounded-control bg-accent px-3 py-2 text-sm text-on-accent hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Working…" : "Hang 1"}
          </button>
          <p className="text-[11px] text-ink-faint">
            +{formatDurationSeconds(secondsPerHanger)}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="25"
              disabled={isPending || remainingInventory <= 0}
              className="w-20 rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={runCustom}
              disabled={isPending || remainingInventory <= 0}
              className="flex-1 rounded-control border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
            >
              {isPending ? "Working…" : "Hang custom"}
            </button>
          </div>
          {errors.amount && (
            <p className="text-[11px] text-danger">{errors.amount}</p>
          )}
          <p className="text-[11px] text-ink-faint">
            {customPreview !== null
              ? `+${formatDurationSeconds(customPreview)} (${customNumeric} × ${secondsPerHanger}s)`
              : `Enter an amount.`}
          </p>
        </div>

        <div className="space-y-1">
          <button
            type="button"
            onClick={runRoute}
            disabled={isPending || routePreviewCount <= 0}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
          >
            {isPending ? "Working…" : "Hang route"}
          </button>
          <p className="text-[11px] text-ink-faint">
            {routePreviewTime !== null
              ? `+${formatDurationSeconds(routePreviewTime)} (${routePreviewCount} remaining)`
              : "Nothing left to hang."}
          </p>
        </div>
      </div>

      {banner?.kind === "success" && (
        <ResultBanner payload={banner.payload} />
      )}
      {banner?.kind === "error" && (
        <p className="rounded-control border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {banner.message}
        </p>
      )}
    </div>
  );
}

function ResultBanner({ payload }: { payload: HangActionPayload }) {
  const summary =
    payload.summary ||
    formatHangActivitySummary({
      action:
        payload.requestedCount === null
          ? "hang_route"
          : payload.requestedCount === 1
            ? "hang_one"
            : "hang_custom",
      count: payload.effectiveCount,
    });
  const cappedNotice =
    payload.cappedBy === "INVENTORY"
      ? " · capped by remaining inventory"
      : payload.cappedBy === "STOPS"
        ? " · capped by remaining route stops"
        : "";
  return (
    <div className="space-y-1 rounded-control border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
      <div className="font-medium">{summary}</div>
      <div className="text-[11px]">
        Time advanced: {formatDurationSeconds(payload.timeAdvancedSeconds)}
        {cappedNotice}
      </div>
      {payload.routeCompleted && (
        <div className="mt-1 text-[11px] text-ink-muted">
          Route complete. Response / outcome generation will be handled in a
          future phase.
        </div>
      )}
    </div>
  );
}

function computeRoutePreviewCount(
  remainingInventory: number,
  remainingTarget: number | null,
): number {
  const inv = clamp(remainingInventory);
  if (remainingTarget === null) return inv; // count-only fallback
  return Math.min(inv, clamp(remainingTarget));
}

function clamp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
