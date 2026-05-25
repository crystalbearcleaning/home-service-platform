"use client";

import { useState, useTransition } from "react";
import { addContactNoteAction, updateContactAction } from "./actions";

type ContactCard = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
};

type NoteEntry = {
  id: string;
  body: string;
  createdAt: string;
};

type FieldErrors = Partial<Record<"fullName" | "phone" | "email" | "form", string>>;

// =========================================================================
// CustomerInfoEditor — inline edit form for contact name / phone / email.
// =========================================================================

export function CustomerInfoEditor({ initial }: { initial: ContactCard }) {
  const [contact, setContact] = useState<ContactCard>(initial);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    setFullName(contact.fullName);
    setPhone(contact.phone);
    setEmail(contact.email);
    setErrors({});
    setSuccess(null);
    setEditing(true);
  }

  function cancelEdit() {
    setErrors({});
    setEditing(false);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSuccess(null);
    startTransition(async () => {
      const r = await updateContactAction({
        contactId: contact.id,
        fullName,
        phone,
        email,
      });
      if (!r.ok) {
        const fe = r.error.fieldErrors ?? {};
        setErrors({
          fullName: fe.fullName,
          phone: fe.phone,
          email: fe.email,
          form: r.error.message,
        });
        return;
      }
      setContact({ id: contact.id, fullName: fullName.trim(), phone: phone.trim(), email: email.trim().toLowerCase() });
      setEditing(false);
      if (r.data.changedFields.length === 0) {
        setSuccess("No changes.");
      } else {
        setSuccess(`Updated: ${r.data.changedFields.join(", ")}.`);
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-ink-muted">name</dt>
          <dd className="text-ink">{contact.fullName}</dd>
          <dt className="text-ink-muted">phone</dt>
          <dd className="font-mono text-ink">{contact.phone}</dd>
          <dt className="text-ink-muted">email</dt>
          <dd className="font-mono text-ink">{contact.email}</dd>
        </dl>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={startEdit}
            className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
          >
            Edit customer info
          </button>
          {success && (
            <span className="text-xs text-success-strong">{success}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <Field label="Name" error={errors.fullName}>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Phone" error={errors.phone}>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          inputMode="tel"
          maxLength={32}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Email" error={errors.email}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>
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
          onClick={cancelEdit}
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

// =========================================================================
// ContactNotesPanel — add-internal-note form + list.
// =========================================================================

export function ContactNotesPanel({
  contactId,
  initial,
}: {
  contactId: string;
  initial: NoteEntry[];
}) {
  const [notes, setNotes] = useState<NoteEntry[]>(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const trimmed = body.trim();
      const r = await addContactNoteAction({ contactId, body: trimmed });
      if (r.ok) {
        setNotes((prev) => [
          { id: r.data.noteId, body: trimmed, createdAt: new Date().toISOString() },
          ...prev,
        ]);
        setBody("");
      } else {
        setError(`${r.error.code} — ${r.error.message}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-ink-muted">
          Add internal note
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Plain text. Visible to the team only."
          maxLength={2000}
          className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
          required
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="submit"
            disabled={isPending || body.trim().length === 0}
            className="rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Add note"}
          </button>
          {error && <span className="text-xs text-danger-strong">{error}</span>}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs text-ink-muted">No notes on this contact yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="py-2 text-xs">
              <div className="font-mono text-[11px] text-ink-faint">
                {new Date(n.createdAt).toLocaleString()}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-ink">
                {n.body}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
