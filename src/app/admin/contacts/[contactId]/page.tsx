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
} from "@/components/admin";
import { getAdminContactDetail } from "@/core/contacts/admin-data";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ contactId: string }> };

export default async function ContactDetailPage({ params }: Props) {
  const { contactId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = resolveAdminShellContext({
    workspaceName: business.name,
    userEmail: user.email ?? "—",
  });

  const detail = await getAdminContactDetail({
    businessId: business.id,
    contactId,
  });
  if (!detail) notFound();

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <div className="mb-2 text-[11px]">
        <Link href="/admin/contacts" className="text-ink-muted hover:text-ink">
          ← Contacts
        </Link>
      </div>
      <PageHeader
        eyebrow="CRM"
        title={detail.contact.fullName}
        description={`Customer hub · Created ${new Date(detail.contact.createdAt).toLocaleString()}`}
        actions={
          <StatusBadge tone={detail.contact.status === "active" ? "success" : "default"}>
            {detail.contact.status}
          </StatusBadge>
        }
      />

      <SectionCard
        title="Customer info"
        description="Editing comes in Phase 4C. Read-only for now."
      >
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-ink-muted">name</dt>
          <dd className="text-ink">{detail.contact.fullName}</dd>
          <dt className="text-ink-muted">phone</dt>
          <dd className="font-mono text-ink">{detail.contact.phone}</dd>
          <dt className="text-ink-muted">email</dt>
          <dd className="font-mono text-ink">{detail.contact.email}</dd>
          {detail.contact.source && (
            <>
              <dt className="text-ink-muted">source</dt>
              <dd className="text-ink">{detail.contact.source}</dd>
            </>
          )}
        </dl>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Properties"
          description={
            detail.properties.length === 0
              ? "No properties attached yet."
              : `${detail.properties.length} attached. Source-derived from Google + RentCast — read-only.`
          }
        >
          {detail.properties.length === 0 ? (
            <p className="text-xs text-ink-muted">No properties.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.properties.map((p) => (
                <li key={p.id} className="py-3 text-xs">
                  <div className="break-all text-sm text-ink">
                    {p.formattedAddress}
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-ink-muted sm:grid-cols-3">
                    <div>
                      <dt className="text-ink-faint">city / state</dt>
                      <dd>
                        {p.city}
                        {p.state ? `, ${p.state}` : ""}
                        {p.postalCode ? ` ${p.postalCode}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">service area</dt>
                      <dd>{p.serviceAreaStatus}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">property data</dt>
                      <dd>{p.propertyDataStatus}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">sq ft</dt>
                      <dd>{p.squareFootage ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">type</dt>
                      <dd>{p.propertyType ?? "—"}</dd>
                    </div>
                    {p.lastEnrichedAt && (
                      <div>
                        <dt className="text-ink-faint">enriched</dt>
                        <dd>{new Date(p.lastEnrichedAt).toLocaleDateString()}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Requests (leads)">
          {detail.leads.length === 0 ? (
            <p className="text-xs text-ink-muted">No request records.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.leads.map((l) => (
                <li key={l.id} className="py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/leads/${l.id}`}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      Lead {l.id.slice(0, 8)}…
                    </Link>
                    <StatusBadge tone={leadStatusTone(l.status)}>
                      {l.status.replace(/_/g, " ")}
                    </StatusBadge>
                  </div>
                  <div className="mt-0.5 text-ink-muted">
                    {new Date(l.createdAt).toLocaleString()} ·{" "}
                    {l.customerIntent}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Quotes">
          {detail.quotes.length === 0 ? (
            <p className="text-xs text-ink-muted">No quotes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.quotes.map((q) => {
                const expired = new Date(q.expiresAt).getTime() < Date.now();
                return (
                  <li key={q.id} className="py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href="/admin/quotes"
                        className="text-ink underline-offset-2 hover:underline"
                      >
                        Quote {q.id.slice(0, 8)}…
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone="info">{q.status}</StatusBadge>
                        {expired && (
                          <StatusBadge tone="danger">expired</StatusBadge>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 text-ink-muted">
                      {q.selectedOptionKey ?? "—"} ·{" "}
                      {q.selectedTotal !== null ? `$${q.selectedTotal}` : "—"} ·
                      expires{" "}
                      {new Date(q.expiresAt).toLocaleDateString()}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Tasks">
          {detail.tasks.length === 0 ? (
            <p className="text-xs text-ink-muted">No tasks.</p>
          ) : (
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
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Notes"
          description="Read-only in Phase 4B. Editing arrives in Phase 4C."
        >
          {detail.notes.length === 0 ? (
            <p className="text-xs text-ink-muted">No notes on this contact yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {detail.notes.map((n) => (
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
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent activity"
          description={`Last ${detail.activity.length} entries across this contact and related records.`}
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
