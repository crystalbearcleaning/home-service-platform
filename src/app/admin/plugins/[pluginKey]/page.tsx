import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { getInstalledPluginRecord } from "@/core/plugin-registry/registry";
import type {
  PluginActionRegistration,
  PluginLoadStatus,
  PluginUiRegistration,
} from "@/core/plugin-registry/types";
import {
  AdminShell,
  DetailGrid,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
  type StatusTone,
} from "@/components/admin";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

type Params = Promise<{ pluginKey: string }>;

export default async function PluginDetailPage({
  params,
}: {
  params: Params;
}) {
  const { pluginKey } = await params;

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

  const record = await getInstalledPluginRecord(business.id, pluginKey);

  if (!record) {
    return (
      <AdminShell
        workspaceName={shell.workspaceName}
        userEmail={shell.userEmail}
        signOutSlot={<SignOutButton />}
        stagingToolsEnabled={shell.stagingToolsEnabled}
      >
        <PageHeader eyebrow="Plugins" title="Plugin not found" />
        <SectionCard>
          <p className="text-sm text-ink">
            No installed plugin with key{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5">
              {pluginKey}
            </code>{" "}
            for this business.
          </p>
        </SectionCard>
      </AdminShell>
    );
  }

  const {
    installed,
    definition,
    loadStatus,
    permissions,
    actionRegistrations,
    uiRegistrations,
    loadError,
  } = record;

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Plugins"
        title={definition?.name ?? installed.pluginKey}
        description={definition?.description ?? undefined}
        actions={
          <StatusBadge tone={loadStatusTone(loadStatus)}>
            {loadStatus.replace(/_/g, " ")}
          </StatusBadge>
        }
      />

      <SectionCard>
        <DetailGrid
          columns={4}
          items={[
            { label: "Plugin key", value: installed.pluginKey },
            { label: "Installed version", value: installed.installedVersion },
            {
              label: "Manifest version",
              value: definition?.manifest.version ?? "—",
            },
            { label: "Status", value: installed.status },
            { label: "Internal", value: definition?.isInternal ? "yes" : "no" },
          ]}
        />
      </SectionCard>

      {loadError && (
        <div className="mt-6 rounded-card border border-warning bg-warning-soft p-4 text-sm text-warning-strong">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
            {loadError.reason.replace(/_/g, " ")}
          </div>
          {loadError.message}
        </div>
      )}

      <div className="mt-6">
        <SectionCard title={`Permissions (${permissions.length})`}>
          {permissions.length === 0 ? (
            <p className="text-sm text-ink-muted">No permissions declared.</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {permissions.map((perm) => (
                <li
                  key={perm}
                  className="rounded-control bg-surface-muted px-2 py-1"
                >
                  {perm}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`Actions (${actionRegistrations.length})`}>
          {actionRegistrations.length === 0 ? (
            <p className="text-sm text-ink-muted">No action declarations.</p>
          ) : (
            <ul className="space-y-2">
              {actionRegistrations.map((action) => (
                <ActionRow key={action.actionKey} action={action} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title={`UI registrations (${uiRegistrations.length})`}>
          {uiRegistrations.length === 0 ? (
            <p className="text-sm text-ink-muted">No UI registrations.</p>
          ) : (
            <ul className="space-y-2">
              {uiRegistrations.map((ui) => (
                <UiRow key={ui.id} ui={ui} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Analytics widgets">
          <EmptyState
            title="No analytics yet"
            description="Plugin-supplied analytics widgets will render here in a later phase."
          />
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Issues">
          <EmptyState
            title="No issues"
            description="Plugin-flagged issues will appear here when the issues system lands."
          />
        </SectionCard>
      </div>
    </AdminShell>
  );
}

function loadStatusTone(status: PluginLoadStatus): StatusTone {
  switch (status) {
    case "ok":
      return "success";
    case "disabled":
      return "default";
    case "error":
      return "danger";
    case "malformed_manifest":
    case "missing_definition":
      return "warning";
  }
}

function riskTone(risk: string): StatusTone {
  switch (risk) {
    case "low":
      return "success";
    case "medium":
      return "warning";
    case "high":
      return "danger";
    default:
      return "default";
  }
}

function ActionRow({ action }: { action: PluginActionRegistration }) {
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{action.name}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-faint">
            {action.actionKey}
          </div>
          {action.description && (
            <p className="mt-2 text-sm text-ink-muted">{action.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <StatusBadge tone={riskTone(action.riskLevel)}>
            {action.riskLevel}
          </StatusBadge>
          {action.requiresApproval && (
            <StatusBadge tone="default">requires approval</StatusBadge>
          )}
        </div>
      </div>
    </li>
  );
}

function UiRow({ ui }: { ui: PluginUiRegistration }) {
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{ui.uiKey}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-faint">
            {ui.surfaceType} · {ui.slot}
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            component:{" "}
            <span className="font-mono text-ink">{ui.componentKey}</span>
          </div>
        </div>
        <StatusBadge tone={ui.isEnabled ? "success" : "default"}>
          {ui.isEnabled ? "enabled" : "disabled"}
        </StatusBadge>
      </div>
    </li>
  );
}
