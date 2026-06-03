"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCentsAsDollars, formatJobQuantity } from "@/core/jobs/display";

import { completeJobAndCreateInvoiceAction } from "../actions";

type LineItemPreview = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

type Props = {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  contactName: string | null;
  propertyAddressLine: string | null;
  lineItems: ReadonlyArray<LineItemPreview>;
  estimatedTotalCents: number;
  variant: "primary" | "deemphasized";
};

export function CompleteJobButton({
  jobId,
  jobTitle,
  jobStatus,
  contactName,
  propertyAddressLine,
  lineItems,
  estimatedTotalCents,
  variant,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    setOpen(true);
  }

  function onConfirm() {
    setError(null);
    start(async () => {
      const r = await completeJobAndCreateInvoiceAction({ jobId });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setOpen(false);
      router.push(`/admin/invoices/${r.data.invoiceId}`);
    });
  }

  const triggerClasses =
    variant === "primary"
      ? "rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
      : "rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink";

  const triggerLabel =
    variant === "primary"
      ? "Complete job and create invoice"
      : "Complete job and create another invoice";

  return (
    <>
      <button type="button" onClick={onClick} className={triggerClasses}>
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Complete job and create invoice"
            className="w-full max-w-lg rounded-control border border-line bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3">
              <h2 className="text-base font-semibold text-ink">
                Complete job and create invoice
              </h2>
              <p className="mt-1 text-xs text-ink-muted">{jobTitle}</p>
              <p className="text-[11px] text-ink-faint">
                Status: {jobStatus}
                {contactName ? ` · ${contactName}` : ""}
                {propertyAddressLine ? ` · ${propertyAddressLine}` : ""}
              </p>
            </header>

            <div className="rounded-control border border-line">
              <table className="min-w-full divide-y divide-line text-xs">
                <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-center text-ink-muted"
                      >
                        No line items. The invoice will be created with zero
                        total.
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink">{li.name}</div>
                          {li.description && (
                            <div className="text-[11px] text-ink-muted">
                              {li.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-ink">
                          {formatJobQuantity(li.quantity)}
                        </td>
                        <td className="px-3 py-2 text-right text-ink">
                          {formatCentsAsDollars(li.unitPriceCents)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-ink">
                          {formatCentsAsDollars(li.totalCents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-surface-muted text-xs">
                  <tr>
                    <td
                      className="px-3 py-2 text-right font-medium text-ink"
                      colSpan={3}
                    >
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-ink">
                      {formatCentsAsDollars(estimatedTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-ink-faint">
              This will mark the job <strong>completed</strong> and create an{" "}
              <strong>unpaid</strong> invoice. Payment is recorded separately.
              No customer notification is sent.
            </p>

            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="rounded-control bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Complete job and create invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
