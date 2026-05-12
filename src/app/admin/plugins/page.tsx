import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { listInstalledPluginsForBusiness } from "@/core/plugin-registry/registry";
import type { AdminPluginRecord, PluginLoadStatus } from "@/core/plugin-registry/types";

export const dynamic = "force-dynamic";

export default async function AdminPluginsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const records = await listInstalledPluginsForBusiness(business.id);

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Plugins</h1>
        <p className="text-sm text-gray-600 mt-1">{business.name}</p>
      </header>

      {records.length === 0 ? (
        <p className="text-sm text-gray-700">
          No installed plugins for this business.
        </p>
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <li key={record.installed.id}>
              <PluginCard record={record} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
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

  const isFault =
    loadStatus === "error" ||
    loadStatus === "malformed_manifest" ||
    loadStatus === "missing_definition";

  const borderClass = isFault
    ? "border-amber-300"
    : loadStatus === "disabled"
      ? "border-gray-300 bg-gray-50"
      : "border-gray-200";

  const manifestSummary = definition
    ? `${definition.manifest.permissions.length} perm · ${definition.manifest.actions.length} action · ${definition.manifest.uiRegistrations.length} ui · ${definition.manifest.events.length} event`
    : "—";

  return (
    <Link
      href={`/admin/plugins/${installed.pluginKey}`}
      className={`block rounded-lg border bg-white p-4 hover:shadow-sm transition ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">
            {definition?.name ?? installed.pluginKey}
          </div>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {installed.pluginKey}
          </div>
        </div>
        <LoadStatusBadge status={loadStatus} />
      </div>

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <Stat label="Installed version" value={installed.installedVersion} />
        <Stat label="Status" value={installed.status} />
        <Stat label="Permissions" value={String(permissions.length)} />
        <Stat label="Actions" value={String(actionRegistrations.length)} />
        <Stat label="UI registrations" value={String(uiRegistrations.length)} />
        <Stat label="Manifest" value={manifestSummary} />
      </dl>

      {loadError && (
        <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <span className="font-medium">{loadError.reason}:</span>{" "}
          {loadError.message}
        </div>
      )}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
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
