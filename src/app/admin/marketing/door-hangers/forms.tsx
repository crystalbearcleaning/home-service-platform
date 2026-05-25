"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createCampaignAction,
  createDesignAction,
  createDistributionSessionAction,
  createManualRouteAction,
} from "./actions";

type FieldErrors = Record<string, string | undefined>;

function useToggle(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, setOpen };
}

// =========================================================================
// Campaign
// =========================================================================
export function CampaignCreateForm() {
  const { open, setOpen } = useToggle(false);
  const [name, setName] = useState("");
  const [offerSummary, setOffer] = useState("");
  const [targetArea, setTargetArea] = useState("");
  const [status, setStatus] = useState("draft");
  const [responseRate, setResponseRate] = useState("");
  const [bookingRate, setBookingRate] = useState("");
  const [avgJob, setAvgJob] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setName(""); setOffer(""); setTargetArea(""); setStatus("draft");
    setResponseRate(""); setBookingRate(""); setAvgJob(""); setNotes("");
    setErrors({});
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setSuccess(null); setOpen(true); }}
        className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        + New campaign
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({}); setSuccess(null);
        start(async () => {
          const r = await createCampaignAction({
            name,
            offerSummary: offerSummary || null,
            targetArea: targetArea || null,
            status,
            responseRateAssumption: responseRate ? Number(responseRate) : null,
            quoteToBookingAssumption: bookingRate ? Number(bookingRate) : null,
            averageJobValueDollars: avgJob || null,
            notes: notes || null,
          });
          if (r.ok) {
            setSuccess("Campaign created.");
            reset();
            setOpen(false);
          } else {
            setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
          }
        });
      }}
      className="space-y-3 rounded-control border border-line bg-surface p-3"
    >
      <div className="text-sm font-medium text-ink">New campaign</div>
      <Field label="Name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200}
               className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <Field label="Offer / message" error={errors.offerSummary}>
        <textarea value={offerSummary} onChange={(e) => setOffer(e.target.value)} rows={2} maxLength={500}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Target area" error={errors.targetArea}>
          <input value={targetArea} onChange={(e) => setTargetArea(e.target.value)} maxLength={200}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Status" error={errors.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="complete">complete</option>
          </select>
        </Field>
        <Field label="Response rate (0–1)" error={errors.responseRateAssumption}>
          <input type="number" step="0.0001" min="0" max="1" value={responseRate}
                 onChange={(e) => setResponseRate(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Quote → booking rate (0–1)" error={errors.quoteToBookingAssumption}>
          <input type="number" step="0.0001" min="0" max="1" value={bookingRate}
                 onChange={(e) => setBookingRate(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Average job value ($)" error={errors.averageJobValueDollars}>
          <input type="text" inputMode="decimal" value={avgJob}
                 onChange={(e) => setAvgJob(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <FormFooter
        isPending={isPending}
        formError={errors._form}
        successMessage={success}
        onCancel={() => { reset(); setOpen(false); }}
      />
    </form>
  );
}

// =========================================================================
// Inventory / design
// =========================================================================
export function DesignCreateForm() {
  const { open, setOpen } = useToggle(false);
  const [name, setName] = useState("");
  const [versionOrOffer, setVersion] = useState("");
  const [qty, setQty] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setName(""); setVersion(""); setQty(""); setTotalCost(""); setReceivedAt(""); setNotes("");
    setErrors({});
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setSuccess(null); setOpen(true); }}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink">
        + New inventory / design
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({}); setSuccess(null);
        const qtyNum = Number(qty);
        start(async () => {
          const r = await createDesignAction({
            name,
            versionOrOffer: versionOrOffer || null,
            quantityReceived: qtyNum,
            totalPrintCostDollars: totalCost || null,
            receivedAt: receivedAt || null,
            notes: notes || null,
          });
          if (r.ok) {
            setSuccess("Inventory / design created.");
            reset();
            setOpen(false);
          } else {
            setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
          }
        });
      }}
      className="space-y-3 rounded-control border border-line bg-surface p-3"
    >
      <div className="text-sm font-medium text-ink">New inventory / design</div>
      <Field label="Name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200}
               className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Version / offer" error={errors.versionOrOffer}>
          <input value={versionOrOffer} onChange={(e) => setVersion(e.target.value)} maxLength={120}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Quantity received" error={errors.quantityReceived}>
          <input type="number" min="1" step="1" value={qty}
                 onChange={(e) => setQty(e.target.value)} required
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Total print cost ($)" error={errors.totalPrintCostDollars}>
          <input type="text" inputMode="decimal" value={totalCost}
                 onChange={(e) => setTotalCost(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Received date" error={errors.receivedAt}>
          <input type="date" value={receivedAt}
                 onChange={(e) => setReceivedAt(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <FormFooter isPending={isPending} formError={errors._form} successMessage={success}
                  onCancel={() => { reset(); setOpen(false); }} />
    </form>
  );
}

// =========================================================================
// Manual route shell
// =========================================================================
type CampaignOption = { id: string; name: string };
export function RouteCreateForm({ campaigns }: { campaigns: CampaignOption[] }) {
  const { open, setOpen } = useToggle(false);
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [centerAddress, setCenter] = useState("");
  const [radius, setRadius] = useState("");
  const [target, setTarget] = useState("");
  const [estTime, setEstTime] = useState("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setName(""); setCampaignId(""); setCenter(""); setRadius(""); setTarget("");
    setEstTime(""); setStatus("draft"); setNotes(""); setErrors({});
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setSuccess(null); setOpen(true); }}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink">
        + New manual route
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({}); setSuccess(null);
        start(async () => {
          const r = await createManualRouteAction({
            name,
            campaignId: campaignId || null,
            centerAddress: centerAddress || null,
            radiusMiles: radius ? Number(radius) : null,
            targetHomeCount: target ? Number(target) : null,
            estimatedTimeMinutes: estTime || null,
            status,
            notes: notes || null,
          });
          if (r.ok) {
            setSuccess("Route created.");
            reset();
            setOpen(false);
          } else {
            setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
          }
        });
      }}
      className="space-y-3 rounded-control border border-line bg-surface p-3"
    >
      <div className="text-sm font-medium text-ink">New manual route</div>
      <Field label="Route name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200}
               className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Campaign (optional)" error={errors.campaignId}>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            <option value="">— none —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status" error={errors.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="in_progress">in_progress</option>
            <option value="completed">completed</option>
            <option value="paused">paused</option>
          </select>
        </Field>
        <Field label="Center address (optional)" error={errors.centerAddress}>
          <input value={centerAddress} onChange={(e) => setCenter(e.target.value)} maxLength={300}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Radius (miles)" error={errors.radiusMiles}>
          <input type="number" step="0.1" min="0" value={radius}
                 onChange={(e) => setRadius(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Target home count" error={errors.targetHomeCount}>
          <input type="number" min="1" step="1" value={target}
                 onChange={(e) => setTarget(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Estimated time (minutes)" error={errors.estimatedTimeMinutes}>
          <input type="number" min="0" step="1" value={estTime}
                 onChange={(e) => setEstTime(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <FormFooter isPending={isPending} formError={errors._form} successMessage={success}
                  onCancel={() => { reset(); setOpen(false); }} />
    </form>
  );
}

// =========================================================================
// Distribution session
// =========================================================================
type Picker = { id: string; label: string };
export function SessionCreateForm({
  campaigns,
  routes,
  designs,
}: {
  campaigns: Picker[];
  routes: Picker[];
  designs: Picker[];
}) {
  const { open, setOpen } = useToggle(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "");
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [distributedAt, setDistributedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );

  // FK pickers need to re-sync whenever the parent's lists change.
  // `useState`'s initial value is only used on first mount — but the
  // parent re-renders these arrays after every revalidatePath. Without
  // this effect a select can visually show the first option (browser
  // default for `value=""`) while the controlled state is still empty,
  // causing a confusing "Route is required" on submit.
  useEffect(() => {
    if (campaigns.length > 0 && !campaigns.some((c) => c.id === campaignId)) {
      setCampaignId(campaigns[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);
  useEffect(() => {
    if (routes.length > 0 && !routes.some((r) => r.id === routeId)) {
      setRouteId(routes[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes]);
  useEffect(() => {
    if (designs.length > 0 && !designs.some((d) => d.id === designId)) {
      setDesignId(designs[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs]);
  const [hangers, setHangers] = useState("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, start] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setHangers(""); setMinutes(""); setNotes(""); setErrors({});
  }

  const canSubmit =
    campaigns.length > 0 && routes.length > 0 && designs.length > 0;

  if (!open) {
    return (
      <button type="button"
              onClick={() => { setSuccess(null); setOpen(true); }}
              disabled={!canSubmit}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
              title={
                canSubmit
                  ? undefined
                  : "Create a campaign, route, and design first."
              }
      >
        + Log distribution session
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({}); setSuccess(null);
        const n = Number(hangers);
        start(async () => {
          const r = await createDistributionSessionAction({
            campaignId,
            routeId,
            designId,
            distributedAt: distributedAt,
            hangersDistributed: n,
            timeSpentMinutes: minutes || null,
            notes: notes || null,
          });
          if (r.ok) {
            setSuccess(
              `Session logged. ${r.data.newQuantityRemaining} hangers remaining for that design.`,
            );
            reset();
            setOpen(false);
          } else {
            setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
          }
        });
      }}
      className="space-y-3 rounded-control border border-line bg-surface p-3"
    >
      <div className="text-sm font-medium text-ink">Log distribution session</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Campaign" error={errors.campaignId}>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} required
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Route" error={errors.routeId}>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            {routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Inventory / design" error={errors.designId}>
          <select value={designId} onChange={(e) => setDesignId(e.target.value)} required
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm">
            {designs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Date / time" error={errors.distributedAt}>
          <input type="datetime-local" value={distributedAt}
                 onChange={(e) => setDistributedAt(e.target.value)} required
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Hangers distributed" error={errors.hangersDistributed}>
          <input type="number" min="1" step="1" value={hangers}
                 onChange={(e) => setHangers(e.target.value)} required
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
        <Field label="Time spent (minutes)" error={errors.timeSpentMinutes}>
          <input type="number" min="0" step="1" value={minutes}
                 onChange={(e) => setMinutes(e.target.value)}
                 className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000}
                  className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" />
      </Field>
      <FormFooter isPending={isPending} formError={errors._form} successMessage={success}
                  onCancel={() => { reset(); setOpen(false); }} />
    </form>
  );
}

// =========================================================================
// Shared form bits
// =========================================================================

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

function FormFooter({
  isPending,
  formError,
  successMessage,
  onCancel,
}: {
  isPending: boolean;
  formError: string | undefined;
  successMessage: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {formError && <span className="text-xs text-danger-strong">{formError}</span>}
      {successMessage && <span className="text-xs text-success-strong">{successMessage}</span>}
    </div>
  );
}
