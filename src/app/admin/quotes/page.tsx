import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
} from "@/components/admin";
import {
  filterQuotes,
  QUOTE_STATUS_VALUES,
} from "@/core/quotes/admin-search";
import { SignOutButton } from "../sign-out-button";
import { QuotesListClient } from "./quotes-list-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type PageProps = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

type SupabaseRow = {
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
  contacts: { full_name: string; email: string; phone: string } | null;
  properties: { formatted_address: string } | null;
};

export default async function QuotesPage({ searchParams }: PageProps) {
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

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();
  const statusFilter = (params.status ?? "").trim();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, created_at, expires_at, status, selected_option_key, selected_total, source_plugin_version, lead_id, contact_id, property_id, contacts(full_name, email, phone), properties(formatted_address)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rawRows = (data ?? []) as unknown as SupabaseRow[];

  // Shape rows for the pure filter helper + the client component.
  const allRows = rawRows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: r.status,
    selectedOptionKey: r.selected_option_key,
    selectedTotal: r.selected_total,
    sourcePluginVersion: r.source_plugin_version,
    leadId: r.lead_id,
    contactId: r.contact_id,
    propertyId: r.property_id,
    contactName: r.contacts?.full_name ?? null,
    contactEmail: r.contacts?.email ?? null,
    contactPhone: r.contacts?.phone ?? null,
    propertyAddress: r.properties?.formatted_address ?? null,
  }));

  const filtered = filterQuotes(allRows, {
    query,
    status: statusFilter,
  });

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
        description={`Immutable price snapshots. Search by contact or address; filter by status. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load quotes: {error.message}
          </p>
        </SectionCard>
      ) : allRows.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Quotes appear once a /q visitor with an instant quote submits the scheduling request."
        />
      ) : (
        <SectionCard
          title="Quotes"
          description={
            query.length > 0 || statusFilter.length > 0
              ? `${filtered.length} of ${allRows.length} match the current filter.`
              : `${allRows.length} quote${allRows.length === 1 ? "" : "s"}.`
          }
        >
          <QuotesListClient
            initialQuery={query}
            initialStatus={statusFilter}
            quotes={filtered}
            totalCount={allRows.length}
            statusOptions={[...QUOTE_STATUS_VALUES]}
          />
        </SectionCard>
      )}
    </AdminShell>
  );
}
