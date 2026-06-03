import Link from "next/link";
import { redirect } from "next/navigation";

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
import { INVOICE_STATUSES } from "@/core/invoices/constants";
import {
  formatCentsAsDollars,
  invoiceSourceLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  receiptDisplayLabel,
} from "@/core/invoices/display";
import {
  listInvoices,
  type InvoiceRow,
} from "@/core/invoices/admin-data";

import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const STATUS_FILTER_OPTIONS = ["all", ...INVOICE_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function InvoicesPage({ searchParams }: PageProps) {
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

  const params = (await searchParams) ?? {};
  const requested = (params.status ?? "all").trim() as StatusFilter;
  const statusFilter: StatusFilter = STATUS_FILTER_OPTIONS.includes(requested)
    ? requested
    : "all";

  const invoices = await listInvoices({
    businessId: business.id,
    filters: { status: statusFilter === "all" ? "all" : statusFilter },
  });

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader
        eyebrow="CRM"
        title="Invoices"
        description="Billing snapshots created from completed jobs. Complete Job → Create Invoice ships in Phase 11D; Mark Paid + Mark Receipt Sent ship in Phase 11E."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <StatusFilterControl current={statusFilter} />
        <span className="text-ink-faint">
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          {statusFilter !== "all"
            ? ` · ${invoiceStatusLabel(statusFilter)}`
            : ""}
        </span>
      </div>

      <SectionCard padding="none">
        {invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                statusFilter === "all"
                  ? "No invoices yet"
                  : `No ${invoiceStatusLabel(statusFilter).toLowerCase()} invoices`
              }
              description={
                statusFilter === "all"
                  ? "Invoices are created from a job when you complete it. The Complete Job → Create Invoice flow ships in Phase 11D."
                  : "Try a different status filter."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="px-4 py-3">
                <InvoiceRowView invoice={invoice} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AdminShell>
  );
}

function StatusFilterControl({ current }: { current: StatusFilter }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STATUS_FILTER_OPTIONS.map((opt) => {
        const href =
          opt === "all" ? "/admin/invoices" : `/admin/invoices?status=${opt}`;
        const label = opt === "all" ? "All" : invoiceStatusLabel(opt);
        const active = opt === current;
        return (
          <Link
            key={opt}
            href={href}
            className={
              "rounded-pill border px-2.5 py-1 text-xs " +
              (active
                ? "border-ink bg-surface text-ink"
                : "border-line bg-surface text-ink-muted hover:text-ink")
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function InvoiceRowView({ invoice }: { invoice: InvoiceRow }) {
  const shortId = invoice.invoiceNumber ?? invoice.id.slice(0, 8);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/admin/invoices/${invoice.id}`}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            {shortId}
          </Link>
          <StatusBadge tone={invoiceStatusTone(invoice.status)}>
            {invoiceStatusLabel(invoice.status)}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {invoiceSourceLabel(invoice.source)}
          </StatusBadge>
        </div>
        <div className="text-[11px] text-ink-muted">
          {invoice.contactFullName ?? "—"}
          {invoice.propertyAddressLine
            ? ` · ${invoice.propertyAddressLine}`
            : ""}
        </div>
        <div className="text-[11px] text-ink-faint">
          {invoice.jobTitle ? (
            <Link
              href={`/admin/jobs/${invoice.jobId}`}
              className="underline-offset-2 hover:underline"
            >
              from job: {invoice.jobTitle}
            </Link>
          ) : (
            <Link
              href={`/admin/jobs/${invoice.jobId}`}
              className="underline-offset-2 hover:underline"
            >
              from job
            </Link>
          )}
          {" · Created "}
          {formatIsoShort(invoice.createdAt)}
        </div>
      </div>

      <div className="shrink-0 space-y-0.5 text-right">
        <div className="text-sm font-medium text-ink">
          {formatCentsAsDollars(invoice.totalCents)}
        </div>
        <div className="text-[11px] text-ink-muted">
          Paid {formatCentsAsDollars(invoice.amountPaidCents)} ·{" "}
          <span
            className={
              invoice.balanceCents > 0 ? "text-ink" : "text-ink-faint"
            }
          >
            Balance {formatCentsAsDollars(invoice.balanceCents)}
          </span>
        </div>
        <div className="text-[10px] text-ink-faint">
          {invoice.paidAt ? `Paid ${formatIsoShort(invoice.paidAt)} · ` : ""}
          Receipt:{" "}
          {receiptDisplayLabel({
            status: invoice.status,
            receiptSentAtIso: invoice.receiptSentAt,
          })}
        </div>
      </div>
    </div>
  );
}

function formatIsoShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}
