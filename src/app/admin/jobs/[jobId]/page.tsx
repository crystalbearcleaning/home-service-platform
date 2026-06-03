import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AdminShell,
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
  formatSchedulingRange,
  formatSchedulingTimestamp,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";
import { getJob, getJobLineItems } from "@/core/jobs/admin-data";
import { listServicesForJobForm } from "@/core/jobs/admin-form-data";
import type { JobStatus } from "@/core/jobs/constants";
import { listInvoicesForJob } from "@/core/invoices/admin-data";
import {
  invoiceSourceLabel,
  invoiceStatusLabel,
  invoiceStatusTone,
  receiptDisplayLabel,
} from "@/core/invoices/display";

import { SignOutButton } from "../../sign-out-button";
import { LineItemsEditor } from "./line-items-editor";
import { SchedulingForm } from "./scheduling-form";
import { StatusControl } from "./status-control";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function JobDetailPage({ params }: PageProps) {
  const { jobId } = await params;

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

  const job = await getJob({ businessId: business.id, jobId });
  if (!job) notFound();

  const [lineItems, services, jobInvoices] = await Promise.all([
    getJobLineItems({ businessId: business.id, jobId: job.id }),
    listServicesForJobForm(business.id),
    listInvoicesForJob({ businessId: business.id, jobId: job.id }),
  ]);

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
        eyebrow="CRM · Jobs"
        title={job.title}
        description={job.summary ?? undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={jobStatusTone(job.status)}>
          {jobStatusLabel(job.status)}
        </StatusBadge>
        <StatusBadge tone="neutral">{jobSourceLabel(job.source)}</StatusBadge>
        <span className="text-xs text-ink-faint">
          Total: {formatCentsAsDollars(job.estimatedTotalCents)}
        </span>
        <Link
          href="/admin/jobs"
          className="text-xs text-ink-muted underline-offset-2 hover:underline"
        >
          ← All jobs
        </Link>
      </div>

      <div className="mb-6 rounded-control border border-line bg-surface px-3 py-2">
        <StatusControl
          jobId={job.id}
          initialStatus={job.status as JobStatus}
        />
      </div>

      <SectionCard
        title="Customer + property"
        description="Read-only in Phase 9C."
      >
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <KV
            label="Contact"
            value={
              job.contactFullName ? (
                <Link
                  href={`/admin/contacts/${job.contactId}`}
                  className="text-ink hover:underline"
                >
                  {job.contactFullName}
                </Link>
              ) : (
                <span className="text-ink-muted">—</span>
              )
            }
          />
          <KV
            label="Property"
            value={
              job.propertyAddressLine ? (
                <span className="text-ink">{job.propertyAddressLine}</span>
              ) : (
                <span className="text-ink-muted">—</span>
              )
            }
          />
          <KV
            label="Source quote"
            value={
              job.quoteId ? (
                <Link
                  href={`/admin/quotes/${job.quoteId}`}
                  className="text-ink hover:underline"
                >
                  View quote
                </Link>
              ) : (
                <span className="text-ink-muted">None</span>
              )
            }
          />
        </dl>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Scheduling"
          description="Three simple fields. The full scheduling calendar is a future phase."
        >
          <SchedulingForm
            jobId={job.id}
            initialStartAt={job.scheduledStartAt}
            initialEndAt={job.scheduledEndAt}
            initialArrivalWindowLabel={job.arrivalWindowLabel}
          />
          <p className="mt-3 text-[11px] text-ink-faint">
            Current window: {formatSchedulingRange({
              startAt: job.scheduledStartAt,
              endAt: job.scheduledEndAt,
              arrivalWindowLabel: job.arrivalWindowLabel,
            })}
          </p>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={`Line items (${lineItems.length})`}
          description="Add / edit / remove line items. Job total recalculates on every change."
        >
          <LineItemsEditor
            jobId={job.id}
            initialLineItems={lineItems}
            services={services}
            initialEstimatedTotalCents={job.estimatedTotalCents}
          />
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title={`Invoices (${jobInvoices.length})`}
          description="Read-only. Complete Job → Create Invoice ships in Phase 11D."
          padding="none"
        >
          {jobInvoices.length === 0 ? (
            <div className="p-5 text-xs text-ink-muted">
              No invoices created for this job yet.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {jobInvoices.map((inv) => {
                const shortId = inv.invoiceNumber ?? inv.id.slice(0, 8);
                return (
                  <li key={inv.id} className="px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/admin/invoices/${inv.id}`}
                            className="truncate text-sm font-medium text-ink hover:underline"
                          >
                            {shortId}
                          </Link>
                          <StatusBadge tone={invoiceStatusTone(inv.status)}>
                            {invoiceStatusLabel(inv.status)}
                          </StatusBadge>
                          <StatusBadge tone="neutral">
                            {invoiceSourceLabel(inv.source)}
                          </StatusBadge>
                        </div>
                        <div className="text-[11px] text-ink-faint">
                          Receipt:{" "}
                          {receiptDisplayLabel({
                            status: inv.status,
                            receiptSentAtIso: inv.receiptSentAt,
                          })}
                        </div>
                      </div>
                      <div className="shrink-0 space-y-0.5 text-right">
                        <div className="text-sm font-medium text-ink">
                          {formatCentsAsDollars(inv.totalCents)}
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          Balance{" "}
                          <span
                            className={
                              inv.balanceCents > 0
                                ? "text-ink"
                                : "text-ink-faint"
                            }
                          >
                            {formatCentsAsDollars(inv.balanceCents)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        Created {formatSchedulingTimestamp(job.createdAt)} · Updated{" "}
        {formatSchedulingTimestamp(job.updatedAt)}
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
