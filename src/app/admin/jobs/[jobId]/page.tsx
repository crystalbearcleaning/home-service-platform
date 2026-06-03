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
  formatJobQuantity,
  formatSchedulingRange,
  formatSchedulingTimestamp,
  jobLineItemSourceLabel,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";
import { getJob, getJobLineItems } from "@/core/jobs/admin-data";

import { SignOutButton } from "../../sign-out-button";

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

  const lineItems = await getJobLineItems({
    businessId: business.id,
    jobId: job.id,
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
          description="Read-only in Phase 9C — editing arrives in 9D. The full scheduling calendar is a future phase."
        >
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <KV
              label="Scheduled start"
              value={formatSchedulingTimestamp(job.scheduledStartAt)}
            />
            <KV
              label="Scheduled end"
              value={formatSchedulingTimestamp(job.scheduledEndAt)}
            />
            <KV
              label="Arrival window"
              value={job.arrivalWindowLabel ?? "—"}
            />
          </dl>
          <p className="mt-3 text-[11px] text-ink-faint">
            Window: {formatSchedulingRange({
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
          description={
            lineItems.length === 0
              ? "No line items yet."
              : "Read-only in Phase 9C — add / edit / remove arrives in 9D."
          }
          padding={lineItems.length === 0 ? "default" : "none"}
        >
          {lineItems.length === 0 ? (
            <EmptyState
              title="No line items"
              description="This job has no line items. Manual editing arrives in Phase 9D."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-muted text-[10px] uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Item</th>
                    <th className="px-4 py-2 text-left font-medium">Source</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Unit price
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-4 py-2 align-top">
                        <div className="font-medium text-ink">{li.name}</div>
                        {li.description && (
                          <div className="text-[11px] text-ink-muted">
                            {li.description}
                          </div>
                        )}
                        {li.serviceName && (
                          <div className="text-[10px] text-ink-faint">
                            Service: {li.serviceName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top text-[11px] text-ink-muted">
                        {jobLineItemSourceLabel(li.source)}
                      </td>
                      <td className="px-4 py-2 text-right align-top text-ink">
                        {formatJobQuantity(li.quantity)}
                      </td>
                      <td className="px-4 py-2 text-right align-top text-ink">
                        {formatCentsAsDollars(li.unitPriceCents)}
                      </td>
                      <td className="px-4 py-2 text-right align-top font-medium text-ink">
                        {formatCentsAsDollars(li.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-surface-muted">
                    <td className="px-4 py-2 text-right font-medium text-ink" colSpan={4}>
                      Estimated total
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-ink">
                      {formatCentsAsDollars(job.estimatedTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
