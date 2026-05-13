import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { listInstalledPluginsForBusiness } from "@/core/plugin-registry/registry";
import type {
  AdminPluginRecord,
  PluginLoadStatus,
} from "@/core/plugin-registry/types";
import {
  AdminShell,
  DetailGrid,
  EmptyState,
  PageHeader,
  StatusBadge,
  resolveAdminShellContext,
  type StatusTone,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminPluginsPage() {
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

  const records = await listInstalledPluginsForBusiness(business.id);

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Plugins"
        title="Installed plugins"
        description="Plugin status, version, declared permissions, and a link to the detail page."
      />

      {records.length === 0 ? (
        <EmptyState
          title="No plugins yet"
          description="Run the seed script to install the Phase 1 plugins for this workspace."
        />
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li key={record.installed.id}>
              <PluginCard record={record} />
            </li>
          ))}
        </ul>
      )}
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

function PluginCard({ record }: { record: AdminPluginRecord }) {
  const {
    installed,
    definition,
    loadStatus,
    permissions,
    actionRegistrations,
    uiRegistrations,
    loadError,
  } = record;

  const manifestSummary = definition
    ? `${definition.manifest.permissions.length} perm · ${definition.manifest.actions.length} action · ${definition.manifest.uiRegistrations.length} ui · ${definition.manifest.events.length} event`
    : "—";

  return (
    <Link
      href={`/admin/plugins/${installed.pluginKey}`}
      className="block rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-line-strong hover:shadow-floating"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-ink">
            {definition?.name ?? installed.pluginKey}
          </div>
          <div className="mt-0.5 font-mono text-xs text-ink-faint">
            {installed.pluginKey}
          </div>
        </div>
        <StatusBadge tone={loadStatusTone(loadStatus)}>
          {loadStatus.replace(/_/g, " ")}
        </StatusBadge>
      </div>

      <div className="mt-3">
        <DetailGrid
          columns={3}
          items={[
            { label: "Installed version", value: installed.installedVersion },
            { label: "Status", value: installed.status },
            { label: "Permissions", value: String(permissions.length) },
            { label: "Actions", value: String(actionRegistrations.length) },
            {
              label: "UI registrations",
              value: String(uiRegistrations.length),
            },
            { label: "Manifest", value: manifestSummary },
          ]}
        />
      </div>

      {loadError && (
        <div className="mt-3 rounded-control border border-warning bg-warning-soft px-3 py-2 text-xs text-warning-strong">
          <span className="font-medium">{loadError.reason}:</span>{" "}
          {loadError.message}
        </div>
      )}
    </Link>
  );
}
