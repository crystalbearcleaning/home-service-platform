"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { JOB_LINE_ITEM_SOURCES } from "@/core/jobs/constants";
import { formatCentsAsDollars } from "@/core/jobs/display";
import type {
  JobFormContactOption,
  JobFormPropertyOption,
  JobFormServiceOption,
} from "@/core/jobs/admin-form-data";

import {
  createManualJobAction,
  type CreateManualJobLineItemFormInput,
} from "../actions";

type Props = {
  contacts: ReadonlyArray<JobFormContactOption>;
  properties: ReadonlyArray<JobFormPropertyOption>;
  services: ReadonlyArray<JobFormServiceOption>;
  initialContactId?: string | null;
};

type FieldErrors = Record<string, string | undefined>;

// Local model for a draft line item; converted to the action's input
// shape on submit.
type DraftLine = {
  uid: string;
  source: "service" | "custom";
  serviceId: string | null;
  name: string;
  description: string;
  quantity: string;
  unitPriceDollars: string;
};

function emptyCustomLine(): DraftLine {
  return {
    uid: `line-${Math.random().toString(36).slice(2, 9)}`,
    source: "custom",
    serviceId: null,
    name: "",
    description: "",
    quantity: "1",
    unitPriceDollars: "",
  };
}

export function CreateJobForm({
  contacts,
  properties,
  services,
  initialContactId,
}: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [contactId, setContactId] = useState<string>(initialContactId ?? "");
  const [propertyId, setPropertyId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");
  const [arrivalLabel, setArrivalLabel] = useState<string>("");
  const [lines, setLines] = useState<DraftLine[]>([emptyCustomLine()]);

  // Property select is filtered to the selected contact's properties.
  const propertiesForContact = useMemo(
    () => properties.filter((p) => p.contactId === contactId),
    [properties, contactId],
  );

  // Reset propertyId when the contact changes if the previous choice
  // doesn't belong to the new contact.
  function onContactChange(next: string) {
    setContactId(next);
    if (!propertiesForContact.some((p) => p.id === propertyId)) {
      setPropertyId("");
    }
  }

  const livePreview = useMemo(() => {
    return lines.reduce((acc, ln) => {
      const q = Number(ln.quantity);
      const p = Number(ln.unitPriceDollars);
      if (
        !Number.isFinite(q) ||
        !Number.isFinite(p) ||
        q <= 0 ||
        p < 0
      ) {
        return acc;
      }
      return acc + Math.round(q * p * 100);
    }, 0);
  }, [lines]);

  function addCustomLine() {
    setLines((prev) => [...prev, emptyCustomLine()]);
  }

  function addServiceLine() {
    const first = services[0];
    setLines((prev) => [
      ...prev,
      {
        uid: `line-${Math.random().toString(36).slice(2, 9)}`,
        source: "service",
        serviceId: first?.id ?? null,
        name: first?.name ?? "",
        description: "",
        quantity: "1",
        unitPriceDollars: "",
      },
    ]);
  }

  function updateLine(uid: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  function removeLine(uid: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid)));
  }

  function onServicePicked(uid: string, serviceId: string) {
    const svc = services.find((s) => s.id === serviceId) ?? null;
    updateLine(uid, {
      serviceId: svc?.id ?? null,
      name: svc?.name ?? "",
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const payloadLines: CreateManualJobLineItemFormInput[] = lines.map((l) => ({
      serviceId: l.source === "service" ? l.serviceId : null,
      name: l.name.trim(),
      description: l.description.trim() || null,
      quantity: l.quantity,
      unitPriceDollars: l.unitPriceDollars,
      source: l.source,
    }));
    start(async () => {
      const r = await createManualJobAction({
        contactId: contactId.trim(),
        propertyId: propertyId.trim() || null,
        title: title.trim(),
        summary: summary.trim() || null,
        scheduledStartAt: startAt || null,
        scheduledEndAt: endAt || null,
        arrivalWindowLabel: arrivalLabel.trim() || null,
        lineItems: payloadLines,
      });
      if (!r.ok) {
        setErrors({ ...(r.error.fieldErrors ?? {}), _form: r.error.message });
        return;
      }
      router.push(`/admin/jobs/${r.data.jobId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Customer + property</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contact" error={errors.contactId} required>
            <select
              value={contactId}
              onChange={(e) => onContactChange(e.target.value)}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">— Choose a contact —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Property (optional)" error={errors.propertyId}>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={!contactId}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm disabled:bg-surface-muted disabled:text-ink-faint"
            >
              <option value="">
                {contactId
                  ? propertiesForContact.length === 0
                    ? "No properties on file"
                    : "— None —"
                  : "Pick a contact first"}
              </option>
              {propertiesForContact.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.formattedAddress}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Job details</h2>
        <div className="space-y-3">
          <Field label="Title" error={errors.title} required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="Window cleaning — Smith residence"
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Summary (optional)" error={errors.summary}>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Scheduling (optional)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Start" error={errors.scheduledStartAt}>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="End" error={errors.scheduledEndAt}>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Arrival window label" error={errors.arrivalWindowLabel}>
            <input
              value={arrivalLabel}
              onChange={(e) => setArrivalLabel(e.target.value)}
              maxLength={120}
              placeholder="8–10 AM"
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          The full scheduling calendar is a future phase. These three
          fields just record what you told the customer.
        </p>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Line items</h2>
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={addCustomLine}
              className="rounded-pill border border-line bg-surface px-2 py-1 text-ink-muted hover:text-ink"
            >
              + Custom line
            </button>
            {services.length > 0 && (
              <button
                type="button"
                onClick={addServiceLine}
                className="rounded-pill border border-line bg-surface px-2 py-1 text-ink-muted hover:text-ink"
              >
                + Catalog line
              </button>
            )}
          </div>
        </div>

        {errors.lineItems && (
          <p className="mb-2 text-xs text-danger">{errors.lineItems}</p>
        )}

        <ul className="space-y-3">
          {lines.map((ln, idx) => (
            <li
              key={ln.uid}
              className="rounded-control border border-line bg-surface-muted/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-ink">Line {idx + 1}</span>
                <div className="flex items-center gap-2">
                  {JOB_LINE_ITEM_SOURCES.includes(ln.source) && (
                    <span className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                      {ln.source}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(ln.uid)}
                    disabled={lines.length <= 1}
                    className="rounded-pill border border-line bg-surface px-2 py-0.5 text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {ln.source === "service" && services.length > 0 && (
                <div className="mb-2">
                  <Field
                    label="Service"
                    error={errors[`lineItems[${idx}].serviceId`]}
                  >
                    <select
                      value={ln.serviceId ?? ""}
                      onChange={(e) => onServicePicked(ln.uid, e.target.value)}
                      className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.serviceCode})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Field
                    label="Name"
                    required
                    error={errors[`lineItems[${idx}].name`]}
                  >
                    <input
                      value={ln.name}
                      onChange={(e) =>
                        updateLine(ln.uid, { name: e.target.value })
                      }
                      required
                      maxLength={200}
                      className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                    />
                  </Field>
                </div>
                <Field
                  label="Qty"
                  required
                  error={errors[`lineItems[${idx}].quantity`]}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    value={ln.quantity}
                    onChange={(e) =>
                      updateLine(ln.uid, { quantity: e.target.value })
                    }
                    required
                    className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
                <Field
                  label="Unit price ($)"
                  required
                  error={errors[`lineItems[${idx}].unitPriceDollars`]}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={ln.unitPriceDollars}
                    onChange={(e) =>
                      updateLine(ln.uid, { unitPriceDollars: e.target.value })
                    }
                    required
                    placeholder="0.00"
                    className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>

              <div className="mt-2">
                <Field
                  label="Description (optional)"
                  error={errors[`lineItems[${idx}].description`]}
                >
                  <input
                    value={ln.description}
                    onChange={(e) =>
                      updateLine(ln.uid, { description: e.target.value })
                    }
                    maxLength={2000}
                    className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-end gap-3 text-sm">
          <span className="text-ink-muted">Estimated total</span>
          <span className="font-semibold text-ink">
            {formatCentsAsDollars(livePreview)}
          </span>
        </div>
      </section>

      {errors._form && (
        <p className="text-xs text-danger">{errors._form}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-control bg-accent px-3 py-1.5 text-sm text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create job"}
        </button>
        <Link
          href="/admin/jobs"
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-muted">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}
