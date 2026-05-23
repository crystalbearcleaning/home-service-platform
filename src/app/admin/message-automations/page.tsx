import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
} from "@/components/admin";
import {
  GHL_DEFAULT_BASE_URL,
  GHL_ENV_KEYS,
  listRecentNotificationLogs,
  readGhlConfigStatus,
  type NotificationLogSummary,
} from "@/core/messaging";
import {
  listAdminAutomations,
  listAdminRecipients,
} from "@/core/messaging/admin-data";
import { filterAutomations } from "@/core/messaging/admin-search";
import { maskPhoneE164 } from "@/core/messaging/admin-validation";
import { SignOutButton } from "../sign-out-button";
import { AutomationsListClient } from "./automations-list-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

// =========================================================================
// /admin/message-automations — Phase 3D main page
//
// Read-mostly: lists the three seeded automations with search, surfaces
// the GoHighLevel provider status (presence-only), and shows recent
// notification logs across the workspace. Editing happens on the detail
// page (toggle enabled + assign recipients) and on /recipients.
// =========================================================================

export default async function MessageAutomationsPage({ searchParams }: PageProps) {
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

  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim();

  const [automations, recipients, recentLogs] = await Promise.all([
    listAdminAutomations(business.id),
    listAdminRecipients(business.id),
    listRecentNotificationLogs({ businessId: business.id, limit: 15 }),
  ]);

  const filtered = filterAutomations(automations, query);
  const recipientCountActive = recipients.filter((r) => r.isActive).length;
  const providerStatus = readGhlConfigStatus(process.env);
  const effectiveBaseUrl =
    (process.env[GHL_ENV_KEYS.baseUrl] ?? "").trim().replace(/\/+$/, "") ||
    GHL_DEFAULT_BASE_URL;

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Automations"
        title="Message Automations"
        description="Internal SMS alerts sent when key Crystal Bear events fire. Toggle enabled, manage recipients, view recent sends. Customer-facing messages are not built in Phase 3."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={providerStatus.configured ? "success" : "warning"} dot>
              GHL {providerStatus.configured ? "configured" : "missing config"}
            </StatusBadge>
            <Link
              href="/admin/message-automations/recipients"
              className="rounded-control border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Manage recipients · {recipientCountActive} active
            </Link>
          </div>
        }
      />

      <SectionCard
        title="Provider"
        description="GoHighLevel SMS provider. Key presence shown; values are never displayed."
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-ink-muted">provider_key</dt>
          <dd className="font-mono text-ink">gohighlevel</dd>
          <dt className="text-ink-muted">base URL</dt>
          <dd className="break-all font-mono text-ink">{effectiveBaseUrl}</dd>
          <dt className="text-ink-muted">GHL_API_KEY</dt>
          <dd className="font-mono text-ink">
            {hasValue(process.env[GHL_ENV_KEYS.apiKey]) ? "present" : "missing"}
          </dd>
          <dt className="text-ink-muted">GHL_LOCATION_ID</dt>
          <dd className="font-mono text-ink">
            {hasValue(process.env[GHL_ENV_KEYS.locationId]) ? "present" : "missing"}
          </dd>
          <dt className="text-ink-muted">GHL_FROM_PHONE_NUMBER</dt>
          <dd className="font-mono text-ink">
            {hasValue(process.env[GHL_ENV_KEYS.fromPhoneNumber]) ? "present" : "missing"}
          </dd>
        </dl>
        {!providerStatus.configured && (
          <p className="mt-3 rounded-control border border-warning bg-warning-soft p-3 text-xs text-warning-strong">
            One or more <code>GHL_*</code> env vars are missing.{" "}
            <code>task.created</code> events will write a{" "}
            <code>skipped</code> notification log with{" "}
            <code>MISSING_CONFIG</code> instead of attempting a send.
          </p>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Automations"
          description={
            automations.length === 0
              ? "No automations seeded yet."
              : `${automations.length} automation${automations.length === 1 ? "" : "s"} for this workspace.`
          }
        >
          {automations.length === 0 ? (
            <EmptyState
              title="No automations"
              description="Phase 3 seeds three automations (Schedule Request, Manual Quote Needed, Service Area Review). Re-run supabase/seed/run_seed.sh to create them."
            />
          ) : (
            <AutomationsListClient
              initialQuery={query}
              automations={filtered.map((a) => ({
                id: a.id,
                automationKey: a.automationKey,
                name: a.name,
                description: a.description,
                triggerType: a.triggerType,
                triggerFilters: a.triggerFilters,
                channel: a.channel,
                providerKey: a.providerKey,
                isEnabled: a.isEnabled,
                recipientCount: a.recipientCount,
                lastLog: a.lastLog,
              }))}
              totalCount={automations.length}
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent notification logs"
          description="Latest 15 notification logs across all automations for this workspace."
        >
          {recentLogs.ok && recentLogs.data.logs.length > 0 ? (
            <RecentLogsList logs={recentLogs.data.logs} automations={automations} />
          ) : (
            <p className="text-xs text-ink-muted">
              No notification logs yet.
            </p>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        Quote-flow <code>task.created</code> events are{" "}
        <strong>not yet wired</strong> to the automation engine — that
        happens in Phase 3E. Use{" "}
        <Link
          href="/admin/testing/message-sms"
          className="underline hover:text-ink"
        >
          /admin/testing/message-sms
        </Link>{" "}
        to fire a one-off internal SMS today.
      </p>
    </AdminShell>
  );
}

function RecentLogsList({
  logs,
  automations,
}: {
  logs: NotificationLogSummary[];
  automations: Awaited<ReturnType<typeof listAdminAutomations>>;
}) {
  const automationNameById = new Map(
    automations.map((a) => [a.id, a.name] as const),
  );
  return (
    <ul className="divide-y divide-line">
      {logs.map((log) => {
        const automationName =
          (log.automationId && automationNameById.get(log.automationId)) ||
          (log.automationId ? "(deleted automation)" : "ad-hoc test");
        return (
          <li key={log.id} className="py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-ink">
                {new Date(log.createdAt).toLocaleString()}
              </span>
              <StatusBadge tone={toneForStatus(log.status)}>
                {log.status}
              </StatusBadge>
            </div>
            <div className="mt-1 text-ink-muted">
              {automationName} · {log.providerKey}/{log.channel} ·{" "}
              {maskPhoneE164(log.recipientPhoneE164)}
              {log.providerStep ? ` · step ${log.providerStep}` : ""}
              {log.providerHttpStatus !== null
                ? ` · HTTP ${log.providerHttpStatus}`
                : ""}
            </div>
            {log.renderedMessage && (
              <div className="mt-1 break-words text-ink">
                “{log.renderedMessage}”
              </div>
            )}
            {log.status !== "sent" && (log.errorCode || log.errorMessage) && (
              <div className="mt-1 text-danger-strong">
                {log.errorCode}
                {log.errorMessage ? ` — ${log.errorMessage}` : ""}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function toneForStatus(
  status: NotificationLogSummary["status"],
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "sent":
      return "success";
    case "failed":
      return "danger";
    case "skipped":
      return "warning";
    case "pending":
    default:
      return "info";
  }
}

function hasValue(raw: string | undefined): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}
