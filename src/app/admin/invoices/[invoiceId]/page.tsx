import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  renderSimulationBanner,
  renderWorkspaceSwitcher,
  resolveAdminShellContext,
} from "@/components/admin";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  formatCentsAsDollars,
  invoiceLineItemSourceLabel,
  invoiceSourceLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  paymentMethodLabel,
  receiptDisplayLabel,
} from "@/core/invoices/display";
import {
  getInvoice,
  getInvoiceLineItems,
  getInvoicePayments,
} from "@/core/invoices/admin-data";
import { formatJobQuantity } from "@/core/jobs/display";

import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { invoiceId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  const invoice = await getInvoice({ businessId: business.id, invoiceId });
  if (!invoice) notFound();

  const [lineItems, payments] = await Promise.all([
    getInvoiceLineItems({ businessId: business.id, invoiceId: invoice.id }),
    getInvoicePayments({ businessId: business.id, invoiceId: invoice.id }),
  ]);

  const shortId = invoice.invoiceNumber ?? invoice.id.slice(0, 8);

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader eyebrow="CRM · Invoices" title={`Invoice ${shortId}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={invoiceStatusTone(invoice.status)}>
          {invoiceStatusLabel(invoice.status)}
        </StatusBadge>
        <StatusBadge tone="neutral">
          {invoiceSourceLabel(invoice.source)}
        </StatusBadge>
        <Link
          href="/admin/invoices"
          className="text-xs text-ink-muted underline-offset-2 hover:underline"
        >
          ← All invoices
        </Link>
      </div>

      <SectionCard
        title="Summary"
        description="Read-only in Phase 11C. Mark Paid + Mark Receipt Sent ship in Phase 11E."
      >
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <KV
            label="Total"
            value={
              <span className="text-sm font-medium text-ink">
                {formatCentsAsDollars(invoice.totalCents)}
              </span>
            }
          />
          <KV
            label="Amount paid"
            value={
              <span className="text-sm text-ink">
                {formatCentsAsDollars(invoice.amountPaidCents)}
              </span>
            }
          />
          <KV
            label="Balance"
            value={
              <span
                className={
                  "text-sm font-medium " +
                  (invoice.balanceCents > 0 ? "text-ink" : "text-ink-faint")
                }
              >
                {formatCentsAsDollars(invoice.balanceCents)}
              </span>
            }
          />
          <KV
            label="Receipt"
            value={
              <span className="text-sm text-ink">
                {receiptDisplayLabel({
                  status: invoice.status,
                  receiptSentAtIso: invoice.receiptSentAt,
                })}
              </span>
            }
          />
        </dl>

        {(invoice.paidAt || invoice.receiptSentAt) && (
          <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-ink-faint sm:grid-cols-2">
            {invoice.paidAt && (
              <div>Paid at: {formatIsoLong(invoice.paidAt)}</div>
            )}
            {invoice.receiptSentAt && (
              <div>Receipt sent: {formatIsoLong(invoice.receiptSentAt)}</div>
            )}
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Customer + property">
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <KV
              label="Contact"
              value={
                invoice.contactFullName ? (
                  <Link
                    href={`/admin/contacts/${invoice.contactId}`}
                    className="text-ink hover:underline"
                  >
                    {invoice.contactFullName}
                  </Link>
                ) : (
                  <span className="text-ink-muted">—</span>
                )
              }
            />
            <KV
              label="Property"
              value={
                invoice.propertyAddressLine ? (
                  <span className="text-ink">{invoice.propertyAddressLine}</span>
                ) : (
                  <span className="text-ink-muted">—</span>
                )
              }
            />
            <KV
              label="Source job"
              value={
                <Link
                  href={`/admin/jobs/${invoice.jobId}`}
                  className="text-ink hover:underline"
                >
                  {invoice.jobTitle ?? "View job"}
                </Link>
              }
            />
          </dl>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={`Line items (${lineItems.length})`}
          padding="none"
        >
          {lineItems.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No line items"
                description="This invoice has no line items."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-xs">
                <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{li.name}</div>
                        {li.description && (
                          <div className="text-[11px] text-ink-muted">
                            {li.description}
                          </div>
                        )}
                        {li.serviceName && (
                          <div className="text-[10px] text-ink-faint">
                            {li.serviceName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {invoiceLineItemSourceLabel(li.source)}
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
                  ))}
                </tbody>
                <tfoot className="bg-surface-muted text-xs">
                  <tr>
                    <td className="px-3 py-2 text-right text-ink-muted" colSpan={4}>
                      Subtotal
                    </td>
                    <td className="px-3 py-2 text-right text-ink">
                      {formatCentsAsDollars(invoice.subtotalCents)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      className="px-3 py-2 text-right font-medium text-ink"
                      colSpan={4}
                    >
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-ink">
                      {formatCentsAsDollars(invoice.totalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={`Payments (${payments.length})`}
          padding="none"
        >
          {payments.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No payments recorded"
                description="Mark Paid ships in Phase 11E."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-xs">
                <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-3 py-2 text-left">Paid at</th>
                    <th className="px-3 py-2 text-left">Method</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-ink">
                        {formatIsoLong(p.paidAt)}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {paymentMethodLabel(p.paymentMethod)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-ink">
                        {formatCentsAsDollars(p.amountCents)}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {p.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        Created {formatIsoLong(invoice.createdAt)} · Updated{" "}
        {formatIsoLong(invoice.updatedAt)}
      </p>
    </AdminShell>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 truncate text-ink">{value}</div>
    </div>
  );
}

function formatIsoLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}
