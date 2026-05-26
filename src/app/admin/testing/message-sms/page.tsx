import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import {
  GHL_DEFAULT_BASE_URL,
  GHL_ENV_KEYS,
  listRecentNotificationLogs,
  readGhlConfigStatus,
  TEMPLATE_KEYS,
  type NotificationLogSummary,
  type TemplateKey,
} from "@/core/messaging";
import { SignOutButton } from "../../sign-out-button";
import { MessageSmsTestClient } from "./message-sms-test-client";
import { UNAUTHORIZED_TROUBLESHOOTING_TIPS } from "./troubleshooting";

export const dynamic = "force-dynamic";

// =========================================================================
// /admin/testing/message-sms — Phase 3C internal SMS test
//
// Sends ONE test SMS to an active notification_recipient via the
// GoHighLevel adapter and surfaces the resulting notification_logs row.
// Never creates contacts, properties, leads, quotes, tasks, events,
// activities, or quote_page_interactions. Never sends to customers.
// =========================================================================

type RecipientOption = {
  id: string;
  name: string;
  roleLabel: string | null;
  phoneMasked: string;
};

function maskPhone(phone: string): string {
  // Show country prefix + last 4 only. Phase 3 admin UI should not echo
  // the full E.164 number in case the screen is screen-shared.
  if (phone.length <= 6) return "•••";
  return `${phone.slice(0, 2)}••••••${phone.slice(-4)}`;
}

export default async function MessageSmsTestPage() {
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

  const providerStatus = readGhlConfigStatus(process.env);
  const ghlEnv = process.env;
  const baseUrlConfigured = (ghlEnv[GHL_ENV_KEYS.baseUrl] ?? "").trim();
  const effectiveBaseUrl =
    baseUrlConfigured.length > 0
      ? baseUrlConfigured.replace(/\/+$/, "")
      : GHL_DEFAULT_BASE_URL;
  const keyPresence = {
    apiKey: hasValue(ghlEnv[GHL_ENV_KEYS.apiKey]),
    locationId: hasValue(ghlEnv[GHL_ENV_KEYS.locationId]),
    fromPhoneNumber: hasValue(ghlEnv[GHL_ENV_KEYS.fromPhoneNumber]),
  };

  // Active recipients (service-role to keep the seam consistent with the
  // engine — RLS would also allow the user-context client here).
  const sb = createServiceRoleClient();
  const { data: recipientRows } = await sb
    .from("notification_recipients")
    .select("id,name,role_label,phone_e164,is_active")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const recipients: RecipientOption[] = (recipientRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    roleLabel: row.role_label,
    phoneMasked: maskPhone(row.phone_e164),
  }));

  const recentLogsResult = await listRecentNotificationLogs({
    businessId: business.id,
    limit: 10,
  });
  const recentLogs: NotificationLogSummary[] = recentLogsResult.ok
    ? recentLogsResult.data.logs
    : [];

  const templateKeys: TemplateKey[] = [...TEMPLATE_KEYS];

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
        title="Message SMS test"
        description="Send one internal test SMS through the GoHighLevel adapter. Writes a notification_logs row only — no customer records are touched."
        actions={
          <StatusBadge tone={providerStatus.configured ? "success" : "warning"} dot>
            GoHighLevel: {providerStatus.configured ? "configured" : "missing config"}
          </StatusBadge>
        }
      />

      <SectionCard
        title="Provider"
        description="Reads only the presence of GHL env keys. Key values are never displayed."
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-ink-muted">provider_key</dt>
          <dd className="font-mono text-ink">gohighlevel</dd>
          <dt className="text-ink-muted">base URL</dt>
          <dd className="break-all font-mono text-ink">{effectiveBaseUrl}</dd>
          <dt className="text-ink-muted">GHL_API_KEY</dt>
          <dd className="font-mono text-ink">
            {keyPresence.apiKey ? "present" : "missing"}
          </dd>
          <dt className="text-ink-muted">GHL_LOCATION_ID</dt>
          <dd className="font-mono text-ink">
            {keyPresence.locationId ? "present" : "missing"}
          </dd>
          <dt className="text-ink-muted">GHL_FROM_PHONE_NUMBER</dt>
          <dd className="font-mono text-ink">
            {keyPresence.fromPhoneNumber ? "present" : "missing"}
          </dd>
          <dt className="text-ink-muted">configured</dt>
          <dd className="font-mono text-ink">
            {providerStatus.configured ? "true" : "false"}
          </dd>
          <dt className="text-ink-muted">missing keys</dt>
          <dd className="font-mono text-ink">
            {providerStatus.missingKeys.length === 0
              ? "—"
              : providerStatus.missingKeys.join(", ")}
          </dd>
        </dl>
        {!providerStatus.configured && (
          <p className="mt-3 rounded-control border border-warning bg-warning-soft p-3 text-xs text-warning-strong">
            One or more <code>GHL_*</code> env vars are missing. The page
            will still let you submit a test send — the engine will write
            a <code>skipped</code> notification log with{" "}
            <code>MISSING_CONFIG</code> and skip the network call.
          </p>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Send a test SMS"
          description="Pick one active recipient + one seeded template. Sample template data is used — no real customer is contacted."
        >
          {recipients.length === 0 ? (
            <div className="rounded-control border border-warning bg-warning-soft p-3 text-xs text-warning-strong">
              No active notification recipients found for this business.
              Set <code>SEED_NOTIFICATION_PHONE_E164</code> in{" "}
              <code>.env.local</code> and re-run{" "}
              <code>supabase/seed/run_seed.sh</code> to seed Sam, or add
              a row to <code>notification_recipients</code> directly.
            </div>
          ) : (
            <MessageSmsTestClient
              recipients={recipients}
              templateKeys={templateKeys}
              providerConfigured={providerStatus.configured}
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent notification logs"
          description="Most recent rows from notification_logs for this workspace."
        >
          {recentLogs.length === 0 ? (
            <p className="text-xs text-ink-muted">
              No notification logs yet. Send a test above to create the first row.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recentLogs.map((log) => (
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
                    {log.providerKey}/{log.channel} · {maskPhone(log.recipientPhoneE164)}
                    {log.providerMessageId
                      ? ` · msg ${log.providerMessageId.slice(0, 12)}…`
                      : ""}
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
                  {log.errorCode === "UPSTREAM_UNAUTHORIZED" && (
                    <UnauthorizedTips />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        This page is the only Phase 3C UI. The full Message Automations
        admin lives in Phase 3D. Quote-flow{" "}
        <code>task.created</code> events are not wired to the engine
        yet — that happens in Phase 3E.
      </p>
    </AdminShell>
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

function UnauthorizedTips() {
  return (
    <div className="mt-2 rounded-control border border-warning bg-warning-soft p-3 text-[11px] text-warning-strong">
      <div className="font-semibold uppercase tracking-wide">
        401 / 403 troubleshooting
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {UNAUTHORIZED_TROUBLESHOOTING_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <p className="mt-2 opacity-80">
        Secrets are never displayed. Fix the env value in{" "}
        <code>.env.local</code> and restart the dev server before retrying.
      </p>
    </div>
  );
}
