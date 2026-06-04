"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PAYMENT_METHODS, type PaymentMethod } from "@/core/invoices/constants";
import {
  formatCentsAsDollars,
  paymentMethodLabel,
} from "@/core/invoices/display";

import { recordInvoicePaymentAction } from "../actions";

type Props = {
  invoiceId: string;
  balanceCents: number;
};

function localDateTimeNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function balanceAsDollarString(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return (cents / 100).toFixed(2);
}

export function MarkPaidButton({ invoiceId, balanceCents }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [amount, setAmount] = useState(balanceAsDollarString(balanceCents));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(localDateTimeNow());
  const [notes, setNotes] = useState("");

  function reset() {
    setAmount(balanceAsDollarString(balanceCents));
    setMethod("cash");
    setPaidAt(localDateTimeNow());
    setNotes("");
    setErrors({});
    setServerError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    start(async () => {
      const r = await recordInvoicePaymentAction({
        invoiceId,
        amountDollars: amount,
        paymentMethod: method,
        paidAt,
        notes: notes.trim() || null,
      });
      if (!r.ok) {
        if (r.error.fieldErrors) setErrors(r.error.fieldErrors);
        setServerError(r.error.message);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
      >
        Mark paid
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mark invoice paid"
            className="w-full max-w-md rounded-control border border-line bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3">
              <h2 className="text-base font-semibold text-ink">
                Mark invoice paid
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Current balance: {formatCentsAsDollars(balanceCents)}
              </p>
            </header>

            <form onSubmit={onSubmit} className="space-y-3">
              <Field label="Amount (USD)" error={errors.amountDollars}>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-ink-muted">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                  />
                </div>
              </Field>

              <Field label="Payment method" error={errors.paymentMethod}>
                <select
                  value={method}
                  onChange={(e) =>
                    setMethod(e.target.value as PaymentMethod)
                  }
                  className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {paymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Paid at" error={errors.paidAt}>
                <input
                  type="datetime-local"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                />
              </Field>

              <Field label="Notes (optional)" error={errors.notes}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Check #1234, Zelle confirmation, etc."
                  className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-sm"
                />
              </Field>

              {serverError && (
                <p className="text-xs text-danger">{serverError}</p>
              )}

              <p className="text-[11px] text-ink-faint">
                Payment is recorded only. No receipt is sent. No customer
                notification is triggered.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
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
