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
import { JOB_STATUSES } from "@/core/jobs/constants";
import {
  formatCentsAsDollars,
  formatSchedulingRange,
  jobSourceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";
import { listJobs } from "@/core/jobs/admin-data";

import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const STATUS_FILTER_OPTIONS = ["all", ...JOB_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

type PageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function JobsPage({ searchParams }: PageProps) {
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

  const jobs = await listJobs({
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
        title="Jobs"
        description="Work orders for approved or planned work. Read-only in Phase 9C — manual creation lands in 9D, quote-to-job conversion in 9E."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <StatusFilterControl current={statusFilter} />
        <span className="text-ink-faint">
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
          {statusFilter !== "all" ? ` · ${jobStatusLabel(statusFilter)}` : ""}
        </span>
      </div>

      <SectionCard padding="none">
        {jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                statusFilter === "all"
                  ? "No jobs yet"
                  : `No ${jobStatusLabel(statusFilter).toLowerCase()} jobs`
              }
              description={
                statusFilter === "all"
                  ? "Manual job creation arrives in the next step (Phase 9D). Quote-to-job conversion follows in Phase 9E."
                  : "Try a different status filter."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <li key={job.id} className="px-4 py-3">
                <JobRow job={job} />
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
          opt === "all" ? "/admin/jobs" : `/admin/jobs?status=${opt}`;
        const label = opt === "all" ? "All" : jobStatusLabel(opt);
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

function JobRow({
  job,
}: {
  job: Awaited<ReturnType<typeof listJobs>>[number];
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/admin/jobs/${job.id}`}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            {job.title}
          </Link>
          <StatusBadge tone={jobStatusTone(job.status)}>
            {jobStatusLabel(job.status)}
          </StatusBadge>
          <StatusBadge tone="neutral">{jobSourceLabel(job.source)}</StatusBadge>
        </div>

        <div className="text-[11px] text-ink-muted">
          {job.contactFullName ?? "—"}
          {job.propertyAddressLine ? ` · ${job.propertyAddressLine}` : ""}
        </div>

        <div className="text-[11px] text-ink-faint">
          {formatSchedulingRange({
            startAt: job.scheduledStartAt,
            endAt: job.scheduledEndAt,
            arrivalWindowLabel: job.arrivalWindowLabel,
          })}
        </div>
      </div>

      <div className="shrink-0 space-y-1 text-right">
        <div className="text-sm font-medium text-ink">
          {formatCentsAsDollars(job.estimatedTotalCents)}
        </div>
        <div className="text-[11px] text-ink-faint">
          Created {formatIsoShort(job.createdAt)}
        </div>
        {job.quoteId && (
          <Link
            href={`/admin/quotes/${job.quoteId}`}
            className="inline-block text-[11px] text-ink-muted underline-offset-2 hover:underline"
          >
            from quote
          </Link>
        )}
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
