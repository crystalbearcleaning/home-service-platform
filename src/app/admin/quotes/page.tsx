import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  DetailGrid,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  expires_at: string;
  status: string;
  selected_option_key: string | null;
  selected_total: number | null;
  source_plugin_version: string;
  lead_id: string;
  contact_id: string;
  property_id: string;
  contacts: { full_name: string; email: string } | null;
  properties: { formatted_address: string } | null;
};

export default async function QuotesPage() {
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

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, created_at, expires_at, status, selected_option_key, selected_total, source_plugin_version, lead_id, contact_id, property_id, contacts(full_name, email), properties(formatted_address)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="CRM"
        title="Quotes"
        description={`Immutable price snapshots. Each row preserves options, line items, and calculation as they existed at submission. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load quotes: {error.message}
          </p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Quotes appear once a /q visitor with an instant quote submits the scheduling request."
        />
      ) : (
        <SectionCard padding="none">
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const expired = new Date(row.expires_at).getTime() < now;
              return (
                <li key={row.id} className="p-4">
                  <QuoteRow row={row} expired={expired} />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </AdminShell>
  );
}

function QuoteRow({ row, expired }: { row: Row; expired: boolean }) {
  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-3">
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
            {row.contacts?.email ?? "—"}
          </div>
          <div className="mt-1 break-all text-xs text-ink-muted">
            {row.properties?.formatted_address ?? "—"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-xs">
          <StatusBadge tone="info">{row.status}</StatusBadge>
          {expired && <StatusBadge tone="danger">expired</StatusBadge>}
          <span className="text-ink-faint">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <DetailGrid
          columns={3}
          items={[
            { label: "Option", value: row.selected_option_key ?? "—" },
            {
              label: "Total",
              value:
                row.selected_total !== null ? `$${row.selected_total}` : "—",
            },
            {
              label: "Expires",
              value: new Date(row.expires_at).toLocaleDateString(),
            },
            { label: "Plugin version", value: row.source_plugin_version },
          ]}
        />
      </div>

      <div className="mt-2 font-mono text-[11px] text-ink-faint">
        quote {row.id.slice(0, 8)}… · lead {row.lead_id.slice(0, 8)}…
      </div>
    </div>
  );
}
