import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { listAdminContacts } from "@/core/contacts/admin-data";
import { filterContacts } from "@/core/contacts/admin-search";
import { SignOutButton } from "../sign-out-button";
import { ContactsListClient } from "./contacts-list-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function ContactsPage({ searchParams }: PageProps) {
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
  const query = (params.q ?? "").trim();

  const all = await listAdminContacts(business.id);
  const filtered = filterContacts(all, query);

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
        title="Contacts"
        description="Every customer who has submitted a quote request. Search by name, phone, email, or address."
      />

      {all.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Contacts land here automatically when a /q visitor submits the contact form."
        />
      ) : (
        <SectionCard
          title="Customers"
          description={
            query.length > 0
              ? `${filtered.length} of ${all.length} match “${query}”.`
              : `${all.length} contact${all.length === 1 ? "" : "s"}.`
          }
        >
          <ContactsListClient
            initialQuery={query}
            contacts={filtered.map((c) => ({
              id: c.id,
              fullName: c.fullName,
              phone: c.phone,
              email: c.email,
              primaryProperty: c.primaryProperty,
              latestLeadStatus: c.latestLeadStatus,
              latestQuoteStatus: c.latestQuoteStatus,
              openTaskCount: c.openTaskCount,
              lastActivityAt: c.lastActivityAt,
            }))}
            totalCount={all.length}
          />
        </SectionCard>
      )}
    </AdminShell>
  );
}
