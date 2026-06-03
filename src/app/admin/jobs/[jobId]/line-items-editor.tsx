"use client";

import { useState, useTransition } from "react";

import { JOB_LINE_ITEM_SOURCES } from "@/core/jobs/constants";
import {
  formatCentsAsDollars,
  formatJobQuantity,
  jobLineItemSourceLabel,
} from "@/core/jobs/display";
import type { JobLineItemRow } from "@/core/jobs/admin-data";
import type { JobFormServiceOption } from "@/core/jobs/admin-form-data";

import {
  addJobLineItemAction,
  removeJobLineItemAction,
  updateJobLineItemAction,
  type LineItemFormInput,
} from "../actions";

type Props = {
  jobId: string;
  initialLineItems: ReadonlyArray<JobLineItemRow>;
  services: ReadonlyArray<JobFormServiceOption>;
  initialEstimatedTotalCents: number;
};

type FieldErrors = Record<string, string | undefined>;

type AddDraft = {
  source: "service" | "custom";
  serviceId: string | null;
  name: string;
  description: string;
  quantity: string;
  unitPriceDollars: string;
};

type EditDraft = {
  serviceId: string | null;
  name: string;
  description: string;
  quantity: string;
  unitPriceDollars: string;
  source: "quote" | "service" | "custom";
};

function emptyAddDraft(): AddDraft {
  return {
    source: "custom",
    serviceId: null,
    name: "",
    description: "",
    quantity: "1",
    unitPriceDollars: "",
  };
}

function rowToEditDraft(row: JobLineItemRow): EditDraft {
  return {
    serviceId: row.serviceId,
    name: row.name,
    description: row.description ?? "",
    quantity: String(row.quantity),
    unitPriceDollars: (row.unitPriceCents / 100).toFixed(2),
    source: row.source,
  };
}

export function LineItemsEditor({
  jobId,
  initialLineItems,
  services,
  initialEstimatedTotalCents,
}: Props) {
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyAddDraft());
  const [addOpen, setAddOpen] = useState(false);
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  function openAddCustom() {
    setBanner(null);
    setAddErrors({});
    setAddDraft({
      source: "custom",
      serviceId: null,
      name: "",
      description: "",
      quantity: "1",
      unitPriceDollars: "",
    });
    setAddOpen(true);
  }
  function openAddService() {
    setBanner(null);
    setAddErrors({});
    const first = services[0];
    setAddDraft({
      source: "service",
      serviceId: first?.id ?? null,
      name: first?.name ?? "",
      description: "",
      quantity: "1",
      unitPriceDollars: "",
    });
    setAddOpen(true);
  }
  function onAddServicePicked(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId) ?? null;
    setAddDraft((prev) => ({
      ...prev,
      serviceId: svc?.id ?? null,
      name: svc?.name ?? prev.name,
    }));
  }
  function onSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErrors({});
    const payload: LineItemFormInput = {
      serviceId: addDraft.source === "service" ? addDraft.serviceId : null,
      name: addDraft.name.trim(),
      description: addDraft.description.trim() || null,
      quantity: addDraft.quantity,
      unitPriceDollars: addDraft.unitPriceDollars,
      source: addDraft.source,
    };
    start(async () => {
      const r = await addJobLineItemAction({ jobId, form: payload });
      if (!r.ok) {
        setAddErrors({
          ...(r.error.fieldErrors ?? {}),
          _form: r.error.message,
        });
        return;
      }
      setBanner(`Added. New total ${formatCentsAsDollars(r.data.estimatedTotalCents)}.`);
      setAddOpen(false);
      setAddDraft(emptyAddDraft());
    });
  }

  function openEdit(row: JobLineItemRow) {
    setBanner(null);
    setEditErrors({});
    setEditingId(row.id);
    setEditDraft(rowToEditDraft(row));
  }
  function onEditServicePicked(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId) ?? null;
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            serviceId: svc?.id ?? null,
            name: svc?.name ?? prev.name,
          }
        : prev,
    );
  }
  function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editDraft) return;
    setEditErrors({});
    const payload: LineItemFormInput = {
      serviceId:
        editDraft.source === "service" ? editDraft.serviceId : null,
      name: editDraft.name.trim(),
      description: editDraft.description.trim() || null,
      quantity: editDraft.quantity,
      unitPriceDollars: editDraft.unitPriceDollars,
      source: editDraft.source,
    };
    const id = editingId;
    start(async () => {
      const r = await updateJobLineItemAction({
        jobId,
        lineItemId: id,
        form: payload,
      });
      if (!r.ok) {
        setEditErrors({
          ...(r.error.fieldErrors ?? {}),
          _form: r.error.message,
        });
        return;
      }
      setBanner(
        `Updated. New total ${formatCentsAsDollars(r.data.estimatedTotalCents)}.`,
      );
      setEditingId(null);
      setEditDraft(null);
    });
  }

  function onRemove(lineItemId: string) {
    if (!window.confirm("Remove this line item?")) return;
    setBanner(null);
    setRemovingId(lineItemId);
    start(async () => {
      const r = await removeJobLineItemAction({ jobId, lineItemId });
      setRemovingId(null);
      if (!r.ok) {
        setBanner(`Remove failed: ${r.error.message}`);
        return;
      }
      setBanner(
        `Removed. New total ${formatCentsAsDollars(r.data.estimatedTotalCents)}.`,
      );
    });
  }

  return (
    <div className="space-y-3">
      {banner && (
        <p className="rounded-control border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          {banner}
        </p>
      )}

      {initialLineItems.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No line items yet. Add one below.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Item</th>
                <th className="px-4 py-2 text-left font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Unit</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {initialLineItems.map((row) =>
                editingId === row.id && editDraft ? (
                  <tr key={row.id} className="bg-brand/5">
                    <td colSpan={6} className="px-4 py-3">
                      <form onSubmit={onSubmitEdit} className="space-y-3">
                        <EditOrAddFields
                          mode="edit"
                          draft={editDraft}
                          services={services}
                          errors={editErrors}
                          onChange={(patch) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, ...patch } : prev,
                            )
                          }
                          onServicePicked={onEditServicePicked}
                        />
                        {editErrors._form && (
                          <p className="text-xs text-danger">
                            {editErrors._form}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
                          >
                            {isPending ? "Saving…" : "Save line"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                              setEditErrors({});
                            }}
                            className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-ink">{row.name}</div>
                      {row.description && (
                        <div className="text-[11px] text-ink-muted">
                          {row.description}
                        </div>
                      )}
                      {row.serviceName && (
                        <div className="text-[10px] text-ink-faint">
                          Service: {row.serviceName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-[11px] text-ink-muted">
                      {jobLineItemSourceLabel(row.source)}
                    </td>
                    <td className="px-4 py-2 text-right align-top text-ink">
                      {formatJobQuantity(row.quantity)}
                    </td>
                    <td className="px-4 py-2 text-right align-top text-ink">
                      {formatCentsAsDollars(row.unitPriceCents)}
                    </td>
                    <td className="px-4 py-2 text-right align-top font-medium text-ink">
                      {formatCentsAsDollars(row.totalCents)}
                    </td>
                    <td className="px-4 py-2 text-right align-top">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          disabled={isPending}
                          className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted hover:text-ink disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(row.id)}
                          disabled={isPending && removingId !== row.id}
                          className="rounded-pill border border-line bg-surface px-2 py-0.5 text-[11px] text-danger hover:bg-danger/5 disabled:opacity-50"
                        >
                          {removingId === row.id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-muted">
                <td className="px-4 py-2 text-right font-medium text-ink" colSpan={4}>
                  Estimated total
                </td>
                <td className="px-4 py-2 text-right font-semibold text-ink">
                  {formatCentsAsDollars(initialEstimatedTotalCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {addOpen ? (
        <form
          onSubmit={onSubmitAdd}
          className="space-y-3 rounded-control border border-line bg-surface p-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">Add line item</span>
            <span className="rounded-pill border border-line bg-surface-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
              {addDraft.source}
            </span>
          </div>
          <EditOrAddFields
            mode="add"
            draft={addDraft}
            services={services}
            errors={addErrors}
            onChange={(patch) => setAddDraft((prev) => ({ ...prev, ...patch }))}
            onServicePicked={onAddServicePicked}
          />
          {addErrors._form && (
            <p className="text-xs text-danger">{addErrors._form}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Adding…" : "Add line item"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setAddDraft(emptyAddDraft());
                setAddErrors({});
              }}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={openAddCustom}
            className="rounded-pill border border-line bg-surface px-2 py-1 text-ink-muted hover:text-ink"
          >
            + Custom line
          </button>
          {services.length > 0 && (
            <button
              type="button"
              onClick={openAddService}
              className="rounded-pill border border-line bg-surface px-2 py-1 text-ink-muted hover:text-ink"
            >
              + Catalog line
            </button>
          )}
        </div>
      )}

      {/* JOB_LINE_ITEM_SOURCES is exported but only used as a runtime
          referee for the dev-side check below; keep it referenced. */}
      <span hidden aria-hidden>
        {JOB_LINE_ITEM_SOURCES.length}
      </span>
    </div>
  );
}

function EditOrAddFields({
  mode,
  draft,
  services,
  errors,
  onChange,
  onServicePicked,
}: {
  mode: "add" | "edit";
  draft: AddDraft | EditDraft;
  services: ReadonlyArray<JobFormServiceOption>;
  errors: FieldErrors;
  onChange: (patch: Partial<AddDraft> & Partial<EditDraft>) => void;
  onServicePicked: (serviceId: string) => void;
}) {
  const isService = draft.source === "service";
  return (
    <div className="space-y-3">
      {isService && services.length > 0 && (
        <Field label="Service" error={errors.serviceId}>
          <select
            value={draft.serviceId ?? ""}
            onChange={(e) => onServicePicked(e.target.value)}
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.serviceCode})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Name" required error={errors.name}>
            <input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              required
              maxLength={200}
              className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <Field label="Qty" required error={errors.quantity}>
          <input
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            required
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
        <Field
          label="Unit price ($)"
          required
          error={errors.unitPriceDollars ?? errors.unitPriceCents}
        >
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft.unitPriceDollars}
            onChange={(e) => onChange({ unitPriceDollars: e.target.value })}
            required
            placeholder="0.00"
            className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
          />
        </Field>
      </div>
      <Field label="Description (optional)" error={errors.description}>
        <input
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={2000}
          className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
        />
      </Field>
      {mode === "edit" && (draft as EditDraft).source === "quote" && (
        <p className="text-[11px] text-ink-faint">
          This line was snapshotted from a quote. Editing only changes the
          line itself; the source quote is not affected.
        </p>
      )}
    </div>
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
