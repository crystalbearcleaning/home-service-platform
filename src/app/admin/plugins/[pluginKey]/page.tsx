import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { getInstalledPluginRecord } from "@/core/plugin-registry/registry";
import type {
  PluginActionRegistration,
  PluginLoadStatus,
  PluginUiRegistration,
} from "@/core/plugin-registry/types";

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

  const record = await getInstalledPluginRecord(business.id, pluginKey);

  if (!record) {
    return (
      <main className="min-h-screen p-8 max-w-3xl mx-auto">
        <Link
          href="/admin/plugins"
          className="text-sm text-gray-600 underline"
        >
          ← Plugins
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Plugin not found</h1>
        <p className="text-sm text-gray-700 mt-2">
          No installed plugin with key{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">{pluginKey}</code>{" "}
          for this business.
        </p>
      </main>
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
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href="/admin/plugins" className="text-sm text-gray-600 underline">
        ← Plugins
      </Link>

      <header className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {definition?.name ?? installed.pluginKey}
          </h1>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {installed.pluginKey}
          </div>
          {definition?.description && (
            <p className="text-sm text-gray-700 mt-2">
              {definition.description}
            </p>
          )}
        </div>
        <LoadStatusBadge status={loadStatus} />
      </header>

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Installed version" value={installed.installedVersion} />
        <Stat
          label="Manifest version"
          value={definition?.manifest.version ?? "—"}
        />
        <Stat label="Status" value={installed.status} />
        <Stat label="Internal" value={definition?.isInternal ? "yes" : "no"} />
      </section>

      {loadError && (
        <section className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold uppercase tracking-wide text-xs mb-1">
            {loadError.reason.replace(/_/g, " ")}
          </div>
          {loadError.message}
        </section>
      )}

      <Section title={`Permissions (${permissions.length})`}>
        {permissions.length === 0 ? (
          <p className="text-sm text-gray-600">No permissions declared.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {permissions.map((perm) => (
              <li key={perm} className="rounded bg-gray-50 px-2 py-1">
                {perm}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Actions (${actionRegistrations.length})`}>
        {actionRegistrations.length === 0 ? (
          <p className="text-sm text-gray-600">No action declarations.</p>
        ) : (
          <ul className="space-y-2">
            {actionRegistrations.map((action) => (
              <ActionRow key={action.actionKey} action={action} />
            ))}
          </ul>
        )}
      </Section>

      <Section title={`UI registrations (${uiRegistrations.length})`}>
        {uiRegistrations.length === 0 ? (
          <p className="text-sm text-gray-600">No UI registrations.</p>
        ) : (
          <ul className="space-y-2">
            {uiRegistrations.map((ui) => (
              <UiRow key={ui.id} ui={ui} />
            ))}
          </ul>
        )}
      </Section>

      <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold">Analytics widgets</h2>
        <p className="text-sm text-gray-600 mt-1">
          Analytics widgets will be added later.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold">Issues</h2>
        <p className="text-sm text-gray-600 mt-1">
          Issues will be added later.
        </p>
      </section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-sm font-medium mt-1 break-all">{value}</div>
    </div>
  );
}

function ActionRow({ action }: { action: PluginActionRegistration }) {
  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{action.name}</div>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {action.actionKey}
          </div>
          {action.description && (
            <p className="text-sm text-gray-700 mt-2">{action.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span
            className={`px-2 py-0.5 rounded ${
              action.riskLevel === "low"
                ? "bg-green-50 text-green-800"
                : action.riskLevel === "medium"
                  ? "bg-yellow-50 text-yellow-800"
                  : "bg-red-50 text-red-800"
            }`}
          >
            {action.riskLevel}
          </span>
          {action.requiresApproval && (
            <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-800">
              requires approval
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function UiRow({ ui }: { ui: PluginUiRegistration }) {
  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{ui.uiKey}</div>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {ui.surfaceType} · {ui.slot}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            component: <span className="font-mono">{ui.componentKey}</span>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            ui.isEnabled
              ? "bg-green-50 text-green-800"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {ui.isEnabled ? "enabled" : "disabled"}
        </span>
      </div>
    </li>
  );
}

function LoadStatusBadge({ status }: { status: PluginLoadStatus }) {
  const classes: Record<PluginLoadStatus, string> = {
    ok: "bg-green-100 text-green-800",
    disabled: "bg-gray-200 text-gray-800",
    error: "bg-red-100 text-red-800",
    malformed_manifest: "bg-amber-100 text-amber-900",
    missing_definition: "bg-amber-100 text-amber-900",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${classes[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
