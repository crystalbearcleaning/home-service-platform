import { notFound, redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { readStagingToolsGate } from "@/core/staging-tools/env";
import { PRESERVED_TABLES, buildResetPlan } from "@/core/staging-tools/plan";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";
import { ResetButtonClient } from "./reset-button-client";

export const dynamic = "force-dynamic";

export default async function StagingToolsPage() {
  // First gate: the public flag controls whether the page even renders.
  // The server action enforces ENABLE_STAGING_TOOLS independently, so
  // even if someone navigates directly here in prod the action refuses.
  const gate = readStagingToolsGate(process.env);
  if (!gate.publicEnabled) {
    notFound();
  }

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

  const plan = buildResetPlan({ businessId: business.id });

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Tools"
        title="Staging tools"
        description="Destructive utilities for clearing quote-flow test data. Never enable in production."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={gate.publicEnabled ? "warning" : "default"}>
              NEXT_PUBLIC_ENABLE_STAGING_TOOLS:{" "}
              {gate.publicEnabled ? "true" : "false"}
            </StatusBadge>
            <StatusBadge tone={gate.serverEnabled ? "warning" : "default"}>
              ENABLE_STAGING_TOOLS: {gate.serverEnabled ? "true" : "false"}
            </StatusBadge>
          </div>
        }
      />

      {!gate.serverEnabled && (
        <div className="mb-6 rounded-card border border-warning bg-warning-soft p-4 text-sm text-warning-strong">
          <p className="font-medium">Server gate is OFF.</p>
          <p className="mt-1">
            The page rendered because{" "}
            <code>NEXT_PUBLIC_ENABLE_STAGING_TOOLS</code> is true, but the
            action will refuse until <code>ENABLE_STAGING_TOOLS</code> is
            also true on the server. Restart the dev server after editing{" "}
            <code>.env.local</code>.
          </p>
        </div>
      )}

      <SectionCard
        title="What gets deleted"
        description={`Scoped to ${business.name} by business_id plus a plugin / source filter on every table.`}
      >
        <ul className="space-y-1 font-mono text-xs">
          {plan.steps.map((step) => (
            <li
              key={step.table}
              className="break-all rounded-control border border-line bg-surface p-2"
            >
              <span className="font-semibold text-ink">{step.table}</span>
              <span className="text-ink-muted"> — where {step.description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-ink-faint">
          {plan.notes.join(" · ")}
        </p>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="What is preserved"
          description="Every setup table the workspace depends on stays intact."
        >
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-ink-muted">
            {PRESERVED_TABLES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Run reset">
          <ResetButtonClient />
        </SectionCard>
      </div>

      <p className="mt-8 text-[11px] text-ink-faint">
        Never set <code>ENABLE_STAGING_TOOLS</code> or{" "}
        <code>NEXT_PUBLIC_ENABLE_STAGING_TOOLS</code> to <code>true</code>{" "}
        in production.
      </p>
    </AdminShell>
  );
}
