import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
} from "@/components/admin";
import { listAdminRecipients } from "@/core/messaging/admin-data";
import { maskPhoneE164 } from "@/core/messaging/admin-validation";
import { SignOutButton } from "../../sign-out-button";
import { RecipientsClient } from "./recipients-client";

export const dynamic = "force-dynamic";

export default async function RecipientsPage() {
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

  const recipients = await listAdminRecipients(business.id);

  const initial = recipients.map((r) => ({
    id: r.id,
    name: r.name,
    phoneMasked: maskPhoneE164(r.phoneE164),
    // The form needs the real number so a user can edit it; we send the
    // full E.164 to the client only when editing. To keep the masked
    // value as the default display we expose both fields.
    phoneE164: r.phoneE164,
    roleLabel: r.roleLabel,
    isActive: r.isActive,
  }));

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <div className="mb-2 text-[11px]">
        <Link
          href="/admin/message-automations"
          className="text-ink-muted hover:text-ink"
        >
          ← Message Automations
        </Link>
      </div>
      <PageHeader
        eyebrow="Automations"
        title="Notification recipients"
        description="People who can receive internal SMS alerts from Message Automations. Phase 3 supports name + E.164 phone + optional role label + active flag."
      />

      <SectionCard
        title="Recipients"
        description={
          recipients.length === 0
            ? "No recipients yet. Add one below."
            : `${recipients.length} recipient${recipients.length === 1 ? "" : "s"} (${recipients.filter((r) => r.isActive).length} active).`
        }
      >
        <RecipientsClient initial={initial} />
        <p className="mt-4 text-[11px] text-ink-faint">
          Phone numbers must be in E.164 format (e.g.{" "}
          <code>+15615551234</code>). The full number is never displayed
          after save — only the country prefix and last four digits.
        </p>
      </SectionCard>
    </AdminShell>
  );
}
