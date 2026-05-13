import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";
import { AutoQuoteTestClient } from "./auto-quote-test-client";

export const dynamic = "force-dynamic";

export default async function AutoQuoteTestPage() {
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

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Testing tools"
        title="Auto-Quote test"
        description="Exercise core geo + RentCast + Window Cleaning Auto-Quote plugin calculation. No quote / lead / contact records are created."
      />
      <p className="mb-4 text-xs text-ink-faint">
        Pricing rules pulled live from <code>price_rules</code>.
      </p>

      <SectionCard>
        <AutoQuoteTestClient />
      </SectionCard>

      <p className="mt-6 text-xs text-ink-faint">
        This page does not create contacts, properties, leads, quotes,
        quote_page_interactions, tasks, events, activities, or issues.
        It reads service_areas / services / service_plans / price_rules
        and hits Google + RentCast for the selected address.
      </p>
    </AdminShell>
  );
}
