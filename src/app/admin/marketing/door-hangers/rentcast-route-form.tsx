"use client";

import { useState, useTransition } from "react";
import { GoogleAutocomplete } from "@/components/google-autocomplete";
import {
  DEFAULT_RADIUS_MILES,
  DEFAULT_TARGET_HOME_COUNT,
  RENTCAST_MAX_LIMIT,
  RENTCAST_PREVIEW_REQUEST_COUNT,
  type CandidatePreview,
} from "@/core/door-hanger/rentcast-candidates";
import { formatCentsAsDollars } from "@/core/door-hanger/calculations";
import {
  previewRentcastRouteAction,
  saveRentcastRouteAction,
} from "./actions";

type CampaignOption = { id: string; name: string };
type FieldErrors = Record<string, string | undefined>;

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      data: {
        centerAddress: string;
        centerLatitude: number;
        centerLongitude: number;
        radiusMiles: number;
        targetHomeCount: number;
        propertyType: string | null;
        candidates: CandidatePreview[];
        estimatedRentcastRequests: number;
      };
      selected: Set<string>; // dedup key per candidate
      saveError: string | null;
      saveSuccess: string | null;
    };

function candidateKey(c: CandidatePreview, idx: number): string {
  return c.externalId ?? `${c.address}|${c.city ?? ""}|${idx}`;
}

export function RentcastRouteGenerator({ campaigns }: { campaigns: CampaignOption[] }) {
  const [open, setOpen] = useState(false);
  // form fields
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [centerPlaceId, setCenterPlaceId] = useState<string | null>(null);
  const [centerLabel, setCenterLabel] = useState("");
  const [radiusMiles, setRadiusMiles] = useState<string>(String(DEFAULT_RADIUS_MILES));
  const [targetHomeCount, setTargetHomeCount] = useState<string>(
    String(DEFAULT_TARGET_HOME_COUNT),
  );
  const [propertyType, setPropertyType] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setName(""); setCampaignId(""); setCenterPlaceId(null); setCenterLabel("");
    setRadiusMiles(String(DEFAULT_RADIUS_MILES));
    setTargetHomeCount(String(DEFAULT_TARGET_HOME_COUNT));
    setPropertyType(""); setNotes(""); setStatus("draft");
    setErrors({});
    setPreview({ kind: "idle" });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); }}
        className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        + Generate route from address (RentCast)
      </button>
    );
  }

  function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    if (!centerPlaceId) {
      setErrors({ centerPlaceId: "Pick a center address from the dropdown." });
      return;
    }
    setPreview({ kind: "loading" });
    startTransition(async () => {
      const r = await previewRentcastRouteAction({
        centerPlaceId,
        radiusMiles: Number(radiusMiles),
        targetHomeCount: Number(targetHomeCount),
        propertyType: propertyType || null,
      });
      if (!r.ok) {
        setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
        setPreview({ kind: "idle" });
        return;
      }
      const selected = new Set<string>();
      r.data.candidates.forEach((c, i) => selected.add(candidateKey(c, i)));
      setPreview({
        kind: "ready",
        data: r.data,
        selected,
        saveError: null,
        saveSuccess: null,
      });
    });
  }

  function toggleCandidate(key: string) {
    setPreview((prev) => {
      if (prev.kind !== "ready") return prev;
      const next = new Set(prev.selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, selected: next };
    });
  }

  function handleSave() {
    if (preview.kind !== "ready") return;
    const chosen = preview.data.candidates.filter((c, i) =>
      preview.selected.has(candidateKey(c, i)),
    );
    if (chosen.length === 0) {
      setPreview({
        ...preview,
        saveError: "Select at least one candidate to save.",
      });
      return;
    }
    if (!name.trim()) {
      setErrors({ ...errors, name: "Route name is required." });
      return;
    }
    setPreview({ ...preview, saveError: null, saveSuccess: null });
    startTransition(async () => {
      const r = await saveRentcastRouteAction({
        name,
        campaignId: campaignId || null,
        notes: notes || null,
        status,
        centerAddress: preview.data.centerAddress,
        centerLatitude: preview.data.centerLatitude,
        centerLongitude: preview.data.centerLongitude,
        radiusMiles: preview.data.radiusMiles,
        targetHomeCount: preview.data.targetHomeCount,
        candidates: chosen,
      });
      if (r.ok) {
        setPreview({
          ...preview,
          saveError: null,
          saveSuccess: `Route saved with ${r.data.totalRouteStops} stops.`,
        });
        // Reset after a beat so the user sees the confirmation.
        setTimeout(() => {
          resetForm();
          setOpen(false);
        }, 1200);
      } else {
        if (preview.kind === "ready") {
          setPreview({ ...preview, saveError: `${r.error.code} — ${r.error.message}` });
        }
        if (r.error.fieldErrors) {
          setErrors({ ...errors, ...r.error.fieldErrors });
        }
      }
    });
  }

  return (
    <form
      onSubmit={handleGenerate}
      className="space-y-4 rounded-control border border-line bg-surface p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-ink">
          Generate route from address (RentCast)
        </div>
        <span className="rounded-pill bg-info-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-info-strong">
          Estimated RentCast requests: {RENTCAST_PREVIEW_REQUEST_COUNT}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Route name" error={errors.name}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Campaign (optional)" error={errors.campaignId}>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Center / start address" error={errors.centerPlaceId}>
        <GoogleAutocomplete
          onSelect={(p) => {
            setCenterPlaceId(p.placeId);
            setCenterLabel(p.formattedAddress);
            setErrors((prev) => ({ ...prev, centerPlaceId: undefined }));
          }}
          onSelectError={(msg) => setErrors((prev) => ({ ...prev, centerPlaceId: msg }))}
          placeholder="Type to search, then pick from the dropdown"
        />
        {centerLabel && (
          <p className="mt-1 text-[11px] text-ink-faint">
            Center: <span className="font-mono">{centerLabel}</span>
          </p>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Radius (miles)" error={errors.radiusMiles}>
          <input
            type="number"
            step="0.05"
            min="0.05"
            max="10"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(e.target.value)}
            required
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
        </Field>
        <Field
          label={`Target homes (≤ ${RENTCAST_MAX_LIMIT})`}
          error={errors.targetHomeCount}
        >
          <input
            type="number"
            min="1"
            max={RENTCAST_MAX_LIMIT}
            step="1"
            value={targetHomeCount}
            onChange={(e) => setTargetHomeCount(e.target.value)}
            required
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Property type (optional)" error={errors.propertyType}>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">— any —</option>
            <option value="Single Family">Single Family</option>
            <option value="Condo">Condo</option>
            <option value="Townhouse">Townhouse</option>
            <option value="Multi-Family">Multi-Family</option>
          </select>
        </Field>
      </div>

      <Field label="Notes" error={errors.notes}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isPending || preview.kind === "loading"}
          className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {preview.kind === "loading"
            ? "Searching RentCast…"
            : preview.kind === "ready"
              ? "Re-run preview"
              : "Generate preview (1 RentCast request)"}
        </button>
        <button
          type="button"
          onClick={() => { resetForm(); setOpen(false); }}
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        {errors._form && (
          <span className="text-xs text-danger-strong">{errors._form}</span>
        )}
      </div>

      {preview.kind === "ready" && (
        <PreviewPanel
          preview={preview}
          status={status}
          onStatusChange={setStatus}
          onToggle={toggleCandidate}
          onSave={handleSave}
          isPending={isPending}
        />
      )}
    </form>
  );
}

function PreviewPanel({
  preview,
  status,
  onStatusChange,
  onToggle,
  onSave,
  isPending,
}: {
  preview: Extract<PreviewState, { kind: "ready" }>;
  status: string;
  onStatusChange: (s: string) => void;
  onToggle: (key: string) => void;
  onSave: () => void;
  isPending: boolean;
}) {
  const total = preview.data.candidates.length;
  const selected = preview.selected.size;
  return (
    <div className="rounded-control border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-ink">
          <strong>{selected}</strong> selected of {total} returned ·{" "}
          {preview.data.targetHomeCount} requested · radius{" "}
          {preview.data.radiusMiles}mi · center{" "}
          <span className="font-mono text-ink-muted">{preview.data.centerAddress}</span>
        </div>
        <span className="rounded-pill bg-info-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-info-strong">
          RentCast requests used: {preview.data.estimatedRentcastRequests}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-2 text-xs text-warning-strong">
          RentCast returned 0 candidates for this address + radius. Try a wider radius or different property type.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 divide-y divide-line overflow-auto rounded-control border border-line bg-surface">
          {preview.data.candidates.map((c, idx) => {
            const key = candidateKey(c, idx);
            const checked = preview.selected.has(key);
            return (
              <li key={key} className="flex items-start gap-3 p-2 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(key)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-ink">
                    {c.address}
                    {c.city ? `, ${c.city}` : ""}
                    {c.state ? `, ${c.state}` : ""}
                    {c.postalCode ? ` ${c.postalCode}` : ""}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-faint">
                    {c.propertyType && <span>{c.propertyType}</span>}
                    {c.squareFootage !== null && <span>{c.squareFootage} sqft</span>}
                    {c.estimatedValueCents !== null && (
                      <span>est {formatCentsAsDollars(c.estimatedValueCents)}</span>
                    )}
                    {c.distanceMiles !== null && (
                      <span>{c.distanceMiles.toFixed(2)}mi away</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-muted">
          Save with status:
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="ml-2 rounded-control border border-line bg-surface px-2 py-1 text-xs"
          >
            <option value="draft">draft</option>
            <option value="ready">ready</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || selected === 0}
          className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {isPending ? "Saving…" : `Save route (${selected} stops, 0 RentCast requests)`}
        </button>
        {preview.saveError && (
          <span className="text-xs text-danger-strong">{preview.saveError}</span>
        )}
        {preview.saveSuccess && (
          <span className="text-xs text-success-strong">{preview.saveSuccess}</span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-danger-strong">{error}</p>}
    </div>
  );
}
