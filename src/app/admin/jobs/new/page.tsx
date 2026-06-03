import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  renderSimulationBanner,
  renderWorkspaceSwitcher,
  resolveAdminShellContext,
} from "@/components/admin";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  listContactsForJobForm,
  listPropertiesForJobForm,
  listServicesForJobForm,
} from "@/core/jobs/admin-form-data";

import { SignOutButton } from "../../sign-out-button";
import { CreateJobForm } from "./create-job-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ contactId?: string }>;
};

export default async function NewJobPage({ searchParams }: PageProps) {
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
  const initialContactId = (params.contactId ?? "").trim() || null;

  const [contacts, properties, services] = await Promise.all([
    listContactsForJobForm(business.id),
    listPropertiesForJobForm(business.id),
    listServicesForJobForm(business.id),
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
        title="Create job"
        description="Manual work order. Pick a contact + optional property, add line items, optionally fill scheduling fields. No customer notifications fire."
      />

      <div className="mb-4 text-xs">
        <Link
          href="/admin/jobs"
          className="text-ink-muted underline-offset-2 hover:underline"
        >
          ← All jobs
        </Link>
      </div>

      {contacts.length === 0 ? (
        <SectionCard title="No contacts yet">
          <EmptyState
            title="Add a contact first"
            description="A job needs a contact. Create one from the Contacts page, then come back here."
          />
        </SectionCard>
      ) : (
        <CreateJobForm
          contacts={contacts}
          properties={properties}
          services={services}
          initialContactId={initialContactId}
        />
      )}
    </AdminShell>
  );
}
