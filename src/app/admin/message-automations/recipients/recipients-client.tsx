"use client";

import { useState, useTransition } from "react";
import { upsertNotificationRecipientAction } from "../actions";

type Row = {
  id: string;
  name: string;
  phoneMasked: string;
  phoneE164: string;
  roleLabel: string | null;
  isActive: boolean;
};

type EditState =
  | { kind: "view" }
  | { kind: "create" }
  | { kind: "edit"; id: string };

type FormErrors = Partial<Record<"name" | "phoneE164" | "roleLabel" | "form", string>>;

export function RecipientsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [editing, setEditing] = useState<EditState>({ kind: "view" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setErrors({});
    setEditing({ kind: "create" });
  }
  function openEdit(id: string) {
    setErrors({});
    setEditing({ kind: "edit", id });
  }
  function closeEditor() {
    setErrors({});
    setEditing({ kind: "view" });
  }

  async function submit(form: {
    name: string;
    phoneE164: string;
    roleLabel: string;
    isActive: boolean;
    recipientId?: string;
  }) {
    setErrors({});
    startTransition(async () => {
      const r = await upsertNotificationRecipientAction({
        recipientId: form.recipientId,
        name: form.name,
        phoneE164: form.phoneE164,
        roleLabel: form.roleLabel.length > 0 ? form.roleLabel : null,
        isActive: form.isActive,
      });
      if (!r.ok) {
        const fieldErrors = r.error.fieldErrors ?? {};
        setErrors({
          name: fieldErrors.name,
          phoneE164: fieldErrors.phoneE164,
          roleLabel: fieldErrors.roleLabel,
          form: r.error.message,
        });
        return;
      }
      // Reflect locally — phone masked from the canonical value.
      const newRow: Row = {
        id: r.data.recipientId,
        name: form.name.trim(),
        phoneE164: form.phoneE164.trim(),
        phoneMasked: maskClient(form.phoneE164.trim()),
        roleLabel: form.roleLabel.trim().length > 0 ? form.roleLabel.trim() : null,
        isActive: form.isActive,
      };
      setRows((prev) => {
        const idx = prev.findIndex((p) => p.id === newRow.id);
        if (idx >= 0) {
          const copy = prev.slice();
          copy[idx] = newRow;
          return copy;
        }
        return [...prev, newRow];
      });
      closeEditor();
    });
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && editing.kind === "view" && (
        <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
          No recipients yet.
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-line rounded-control border border-line">
          {rows.map((r) =>
            editing.kind === "edit" && editing.id === r.id ? (
              <li key={r.id} className="p-3">
                <RecipientForm
                  initial={r}
                  isPending={isPending}
                  errors={errors}
                  onCancel={closeEditor}
                  onSubmit={(f) => submit({ ...f, recipientId: r.id })}
                />
              </li>
            ) : (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink">
                    {r.name}
                    {!r.isActive && (
                      <span className="ml-2 rounded-pill bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-ink-faint">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {r.roleLabel ? `${r.roleLabel} · ` : ""}
                    {r.phoneMasked}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(r.id)}
                  className="shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {editing.kind === "create" ? (
        <div className="rounded-control border border-line bg-surface p-3">
          <div className="mb-2 text-sm font-medium text-ink">
            New recipient
          </div>
          <RecipientForm
            isPending={isPending}
            errors={errors}
            onCancel={closeEditor}
            onSubmit={(f) => submit(f)}
          />
        </div>
      ) : editing.kind === "view" ? (
        <button
          type="button"
          onClick={openCreate}
          className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-muted hover:text-ink"
        >
          + Add recipient
        </button>
      ) : null}
    </div>
  );
}

function RecipientForm({
  initial,
  isPending,
  errors,
  onCancel,
  onSubmit,
}: {
  initial?: Row;
  isPending: boolean;
  errors: FormErrors;
  onCancel: () => void;
  onSubmit: (f: {
    name: string;
    phoneE164: string;
    roleLabel: string;
    isActive: boolean;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phoneE164 ?? "");
  const [role, setRole] = useState(initial?.roleLabel ?? "");
  const [active, setActive] = useState(initial?.isActive ?? true);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({ name, phoneE164: phone, roleLabel: role, isActive: active });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Name" error={errors.name}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field
        label="Phone (E.164, e.g. +15615551234)"
        error={errors.phoneE164}
      >
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          inputMode="tel"
          placeholder="+15615551234"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field
        label="Role label (optional, e.g. Owner, Dispatcher)"
        error={errors.roleLabel}
      >
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={80}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Active
      </label>
      {errors.form && (
        <p className="text-xs text-danger-strong">{errors.form}</p>
      )}
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
    </form>
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

// Mirror of admin-validation.maskPhoneE164. Inlined to keep the bundle
// independent of server-only modules.
function maskClient(phone: string): string {
  if (!phone || phone.length <= 6) return "•••";
  return `${phone.slice(0, 2)}••••••${phone.slice(-4)}`;
}
