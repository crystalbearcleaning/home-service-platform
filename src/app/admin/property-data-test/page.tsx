import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";
import { PropertyDataTestClient } from "./property-data-test-client";

export const dynamic = "force-dynamic";

export default async function PropertyDataTestPage() {
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
        eyebrow="Testing tools"
        title="Property data test"
        description="Exercise core geo + RentCast property data lookup without touching the quote flow."
      />
      <p className="mb-4 text-xs text-ink-faint">
        Service areas seeded: Boynton Beach, Boca Raton, Delray Beach.
      </p>

      <SectionCard>
        <PropertyDataTestClient />
      </SectionCard>

      <p className="mt-6 text-xs text-ink-faint">
        This page does not create contacts, properties, leads, quotes,
        quote_page_interactions, tasks, events, activities, or issues.
        It only reads service_areas and hits Google + RentCast for the
        selected address.
      </p>
    </AdminShell>
  );
}
