"use client";

import { useState, useTransition } from "react";

import type {
  StartFormDesignOption,
  StartFormRouteOption,
} from "@/core/simulation/play-page-data";
import {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  DOOR_HANGER_SECONDS_PER_HANGER_MAX,
  DOOR_HANGER_SECONDS_PER_HANGER_MIN,
  validateStartSessionForm,
} from "@/plugins/door-hanger/simulation";

import { startDoorHangerSimulationSessionAction } from "./actions";

type FieldErrors = Record<string, string | undefined>;

type Props = {
  routes: StartFormRouteOption[];
  designs: StartFormDesignOption[];
};

export function StartSimulatedRouteForm({ routes, designs }: Props) {
  const hasRoutes = routes.length > 0;
  const hasDesigns = designs.length > 0;

  const [routeId, setRouteId] = useState<string>(routes[0]?.id ?? "");
  const [designId, setDesignId] = useState<string>(designs[0]?.id ?? "");
  const [secondsPerHanger, setSecondsPerHanger] = useState<string>(
    String(DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const disabled = !hasRoutes || !hasDesigns;

  if (disabled) {
    return (
      <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
        {!hasRoutes && !hasDesigns ? (
          <>
            Create a Door Hanger route and at least one inventory design in{" "}
            <a
              href="/admin/marketing/door-hangers"
              className="underline hover:text-ink"
            >
              Marketing → Door Hangers
            </a>{" "}
            before starting a simulated route.
          </>
        ) : !hasRoutes ? (
          <>
            Create or generate a Door Hanger route in{" "}
            <a
              href="/admin/marketing/door-hangers"
              className="underline hover:text-ink"
            >
              Marketing → Door Hangers
            </a>{" "}
            before starting one here. Routes must be in draft, ready, or
            paused status.
          </>
        ) : (
          <>
            Create an inventory design with remaining hangers in{" "}
            <a
              href="/admin/marketing/door-hangers"
              className="underline hover:text-ink"
            >
              Marketing → Door Hangers
            </a>{" "}
            before starting a simulated route.
          </>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        const v = validateStartSessionForm({
          routeId,
          designId,
          secondsPerHanger,
        });
        if (!v.ok) {
          const fe: FieldErrors = {};
          for (const err of v.errors) fe[err.field] = err.message;
          setErrors(fe);
          return;
        }
        start(async () => {
          const r = await startDoorHangerSimulationSessionAction({
            routeId: v.data.routeId,
            designId: v.data.designId,
            secondsPerHanger: v.data.secondsPerHanger,
          });
          if (!r.ok) {
            setErrors({
              ...(r.error.fieldErrors ?? {}),
              _form: r.error.message,
            });
          }
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Route" error={errors.routeId}>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {routeLabel(r)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Inventory / design" error={errors.designId}>
          <select
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.quantityRemaining} remaining)
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={`Seconds per hanger (${DOOR_HANGER_SECONDS_PER_HANGER_MIN}–${DOOR_HANGER_SECONDS_PER_HANGER_MAX})`}
          error={errors.secondsPerHanger}
        >
          <input
            type="number"
            inputMode="numeric"
            min={DOOR_HANGER_SECONDS_PER_HANGER_MIN}
            max={DOOR_HANGER_SECONDS_PER_HANGER_MAX}
            step={1}
            value={secondsPerHanger}
            onChange={(e) => setSecondsPerHanger(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
      </div>

      {errors._form && (
        <p className="text-xs text-danger">{errors._form}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-control bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Start simulated route"}
        </button>
        <span className="text-[11px] text-ink-faint">
          Starts an active session. Hang actions wire up in the next step.
        </span>
      </div>
    </form>
  );
}

function routeLabel(r: StartFormRouteOption): string {
  const source = r.generatedFromSource === "rentcast" ? "RentCast" : "manual";
  const sizeBits: string[] = [];
  if (r.totalRouteStops > 0) sizeBits.push(`${r.totalRouteStops} stops`);
  else if (r.targetHomeCount !== null && r.targetHomeCount > 0)
    sizeBits.push(`target ${r.targetHomeCount}`);
  const size = sizeBits.length > 0 ? ` · ${sizeBits.join(" · ")}` : "";
  return `${r.name} (${source} · ${r.status}${size})`;
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
