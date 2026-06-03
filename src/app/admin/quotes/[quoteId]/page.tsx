import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
  type StatusTone,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { getAdminQuoteDetail } from "@/core/quotes/admin-data";
import { listJobsForQuote } from "@/core/jobs/admin-data";
import {
  formatCentsAsDollars,
  jobStatusLabel,
  jobStatusTone,
} from "@/core/jobs/display";
import { CreateJobButton } from "./create-job-button";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ quoteId: string }> };

export default async function QuoteDetailPage({ params }: Props) {
  const { quoteId } = await params;
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

  const detail = await getAdminQuoteDetail({
    businessId: business.id,
    quoteId,
  });
  if (!detail) notFound();

  const jobsFromQuote = await listJobsForQuote({
    businessId: business.id,
    quoteId,
  });

  const expiredByDate = new Date(detail.quote.expiresAt).getTime() < Date.now();

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <div className="mb-2 text-[11px]">
        <Link href="/admin/quotes" className="text-ink-muted hover:text-ink">
          ← Quotes
        </Link>
      </div>
      <PageHeader
        eyebrow="CRM"
        title={
          detail.contact?.fullName
            ? `Quote · ${detail.contact.fullName}`
            : "Quote"
        }
        description={`Created ${new Date(detail.quote.createdAt).toLocaleString()} · Immutable price snapshot.`}
        actions={
          <div className="flex items-center gap-1.5">
            <StatusBadge tone={quoteStatusTone(detail.quote.status)}>
              {detail.quote.status}
            </StatusBadge>
            {expiredByDate && detail.quote.status !== "expired" && (
              <StatusBadge tone="danger">past expires_at</StatusBadge>
            )}
          </div>
        }
      />

      <SectionCard title="Convert to job">
        <CreateJobButton
          quoteId={quoteId}
          hasExistingJobs={jobsFromQuote.length > 0}
        />
        <p className="mt-2 text-[11px] text-ink-faint">
          Creates a Job (work order) and snapshots this quote into its
          line items. The job is a snapshot, not a live mirror — later
          edits to this quote do not change the job. No customer
          notifications fire.
        </p>

        {jobsFromQuote.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint">
              Jobs created from this quote
            </div>
            <ul className="mt-2 divide-y divide-line">
              {jobsFromQuote.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/jobs/${j.id}`}
                      className="truncate text-sm font-medium text-ink hover:underline"
                    >
                      {j.title}
                    </Link>
                    <span className="ml-2">
                      <StatusBadge tone={jobStatusTone(j.status)}>
                        {jobStatusLabel(j.status)}
                      </StatusBadge>
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium text-ink">
                      {formatCentsAsDollars(j.estimatedTotalCents)}
                    </div>
                    <div className="text-[10px] text-ink-faint">
                      Created {new Date(j.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
      <SectionCard
        title="Customer"
        actions={
          detail.contact ? (
            <Link
              href={`/admin/contacts/${detail.contact.id}`}
              className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Open customer hub →
            </Link>
          ) : null
        }
      >
        {detail.contact ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <dt className="text-ink-muted">name</dt>
            <dd className="text-ink">{detail.contact.fullName}</dd>
            <dt className="text-ink-muted">phone</dt>
            <dd className="font-mono text-ink">{detail.contact.phone}</dd>
            <dt className="text-ink-muted">email</dt>
            <dd className="font-mono text-ink">{detail.contact.email}</dd>
          </dl>
        ) : (
          <p className="text-xs text-ink-muted">Contact not found.</p>
        )}
      </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Property">
          {detail.property ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <dt className="text-ink-muted">address</dt>
              <dd className="break-all text-ink">
                {detail.property.formattedAddress}
              </dd>
              <dt className="text-ink-muted">city / state</dt>
              <dd className="text-ink">
                {detail.property.city}
                {detail.property.state ? `, ${detail.property.state}` : ""}
                {detail.property.postalCode ? ` ${detail.property.postalCode}` : ""}
              </dd>
              <dt className="text-ink-muted">service area</dt>
              <dd className="text-ink">{detail.property.serviceAreaStatus}</dd>
              <dt className="text-ink-muted">property data</dt>
              <dd className="text-ink">{detail.property.propertyDataStatus}</dd>
              <dt className="text-ink-muted">sq ft</dt>
              <dd className="text-ink">{detail.property.squareFootage ?? "—"}</dd>
              <dt className="text-ink-muted">type</dt>
              <dd className="text-ink">{detail.property.propertyType ?? "—"}</dd>
            </dl>
          ) : (
            <p className="text-xs text-ink-muted">Property not found.</p>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Selection">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <dt className="text-ink-muted">selected option</dt>
            <dd className="text-ink">
              {detail.quote.selectedOptionKey ?? "—"}
            </dd>
            <dt className="text-ink-muted">selected total</dt>
            <dd className="text-ink">
              {detail.quote.selectedTotal !== null
                ? `$${detail.quote.selectedTotal}`
                : "—"}
            </dd>
            <dt className="text-ink-muted">customer intent</dt>
            <dd className="text-ink">{detail.quote.customerIntent}</dd>
            <dt className="text-ink-muted">expires</dt>
            <dd className="text-ink">
              {new Date(detail.quote.expiresAt).toLocaleString()}
            </dd>
            <dt className="text-ink-muted">source plugin</dt>
            <dd className="font-mono text-ink">
              {detail.quote.sourcePluginKey} @ {detail.quote.sourcePluginVersion}
            </dd>
            {detail.quote.trackingCode && (
              <>
                <dt className="text-ink-muted">tracking</dt>
                <dd className="font-mono text-ink">{detail.quote.trackingCode}</dd>
              </>
            )}
          </dl>
          {Array.isArray(detail.quote.selectedAddOns) &&
            detail.quote.selectedAddOns.length > 0 && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-ink-muted">
                  selected add-ons
                </div>
                <SnapshotBlock value={detail.quote.selectedAddOns} />
              </div>
            )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Related lead">
          {detail.lead ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link
                href={`/admin/leads/${detail.lead.id}`}
                className="text-ink underline-offset-2 hover:underline"
              >
                Lead {detail.lead.id.slice(0, 8)}…
              </Link>
              <div className="flex items-center gap-1.5">
                <StatusBadge tone={leadStatusTone(detail.lead.status)}>
                  {detail.lead.status.replace(/_/g, " ")}
                </StatusBadge>
                <span className="text-ink-faint">
                  {new Date(detail.lead.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No lead linked.</p>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Snapshots"
          description="Immutable JSON captured at submission time. Read-only by design."
        >
          <div className="space-y-2">
            <Snapshot label="line_items_snapshot" value={detail.quote.lineItemsSnapshot} />
            <Snapshot label="price_snapshot" value={detail.quote.priceSnapshot} />
            <Snapshot label="calculation_snapshot" value={detail.quote.calculationSnapshot} />
            {detail.quote.optionsSnapshot !== null &&
              detail.quote.optionsSnapshot !== undefined && (
                <Snapshot label="options_snapshot" value={detail.quote.optionsSnapshot} />
              )}
            {detail.quote.propertySnapshot !== null &&
              detail.quote.propertySnapshot !== undefined && (
                <Snapshot label="property_snapshot" value={detail.quote.propertySnapshot} />
              )}
          </div>
        </SectionCard>
      </div>

      {detail.tasks.length > 0 && (
        <div className="mt-6">
          <SectionCard title="Related tasks">
            <ul className="divide-y divide-line">
              {detail.tasks.map((t) => (
                <li key={t.id} className="py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {t.relatedObjectId ? (
                      <Link
                        href={`/admin/leads/${t.relatedObjectId}`}
                        className="text-ink underline-offset-2 hover:underline"
                      >
                        {t.title}
                      </Link>
                    ) : (
                      <span className="text-ink">{t.title}</span>
                    )}
                    <StatusBadge
                      tone={t.status === "completed" ? "success" : "default"}
                    >
                      {t.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-0.5 text-ink-muted">
                    {t.taskCategory.replace(/_/g, " ")} ·{" "}
                    {new Date(t.createdAt).toLocaleString()}
                    {t.completedAt
                      ? ` · completed ${new Date(t.completedAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}

      <div className="mt-6">
        <SectionCard
          title="Recent activity"
          description={`Last ${detail.activity.length} entries across this quote, its lead, and its contact.`}
        >
          {detail.activity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Activity from the quote-flow submission, task completion, and notes will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {detail.activity.map((a) => (
                <li key={a.id} className="py-2 text-xs">
                  <div className="font-mono text-ink">
                    {new Date(a.createdAt).toLocaleString()}
                    <span className="ml-2 text-ink-faint">
                      {a.activityType}
                    </span>
                  </div>
                  <div className="mt-0.5 text-ink-muted">{a.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded-control border border-line bg-surface">
      <summary className="cursor-pointer p-2 text-[11px] uppercase tracking-wide text-ink-muted">
        {label}
      </summary>
      <SnapshotBlock value={value} />
    </details>
  );
}

function SnapshotBlock({ value }: { value: unknown }) {
  let pretty: string;
  try {
    pretty = JSON.stringify(value, null, 2);
  } catch {
    pretty = String(value);
  }
  return (
    <pre className="max-h-96 overflow-auto rounded-control border-t border-line bg-surface-muted p-3 text-[11px] text-ink">
      {pretty}
    </pre>
  );
}

function quoteStatusTone(status: string): StatusTone {
  switch (status) {
    case "submitted":
      return "info";
    case "expired":
      return "warning";
    case "void":
      return "danger";
    case "draft":
    default:
      return "default";
  }
}

function leadStatusTone(status: string): StatusTone {
  switch (status) {
    case "scheduling_requested":
      return "success";
    case "needs_manual_quote":
    case "service_area_review_needed":
      return "warning";
    default:
      return "default";
  }
}
