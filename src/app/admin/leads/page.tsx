import Link from "next/link";
import { redirect } from "next/navigation";
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
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  status: string;
  customer_intent: string;
  source: string | null;
  contact_id: string;
  property_id: string;
  quote_page_interaction_id: string | null;
  contacts: { full_name: string; phone: string; email: string } | null;
  properties: { formatted_address: string; city: string } | null;
};

export default async function LeadsPage() {
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

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, status, customer_intent, source, contact_id, property_id, quote_page_interaction_id, contacts(full_name, phone, email), properties(formatted_address, city)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as Row[];

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
        title="Leads"
        description={`Request / opportunity records. The primary CRM view is Contacts — leads are accessible here and from each contact's customer hub. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load leads: {error.message}
          </p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Leads land here when a customer submits the contact form on /q."
        />
      ) : (
        <SectionCard padding="none">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="p-4">
                <LeadRow row={row} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </AdminShell>
  );
}

function statusTone(status: string): StatusTone {
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

function LeadRow({ row }: { row: Row }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">
          <Link
            href={`/admin/contacts/${row.contact_id}`}
            className="underline-offset-2 hover:underline"
          >
            {row.contacts?.full_name ?? "—"}
          </Link>
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">
          {row.contacts?.email ?? "—"} · {row.contacts?.phone ?? "—"}
        </div>
        <div className="mt-1 break-all text-xs text-ink-muted">
          {row.properties?.formatted_address ?? "—"}
        </div>
        <div className="mt-2 font-mono text-[11px] text-ink-faint">
          lead {row.id.slice(0, 8)}… · contact {row.contact_id.slice(0, 8)}…
          {row.quote_page_interaction_id
            ? ` · interaction ${row.quote_page_interaction_id.slice(0, 8)}…`
            : ""}
          {row.source ? ` · ${row.source}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-xs">
        <StatusBadge tone={statusTone(row.status)}>
          {row.status.replace(/_/g, " ")}
        </StatusBadge>
        <Link
          href={`/admin/leads/${row.id}`}
          className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Open lead →
        </Link>
        <span className="text-ink-faint">
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
