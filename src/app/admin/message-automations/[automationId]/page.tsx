import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  type NotificationLogSummary,
  type NotificationStatus,
} from "@/core/messaging";
import { getAdminAutomationDetail } from "@/core/messaging/admin-data";
import { maskPhoneE164 } from "@/core/messaging/admin-validation";
import { SignOutButton } from "../../sign-out-button";
import { AutomationDetailClient } from "./automation-detail-client";
import { RetryLogButtonClient } from "./retry-log-button-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ automationId: string }>;
};

export default async function AutomationDetailPage({ params }: Props) {
  const { automationId } = await params;
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

  const detail = await getAdminAutomationDetail({
    businessId: business.id,
    automationId,
  });
  if (!detail) notFound();

  // Recent logs for this automation. Read directly here so we can scope
  // by automation_id (the shared listRecentNotificationLogs helper does
  // not yet accept a filter — Phase 3D keeps the helper general).
  const sb = createServiceRoleClient();
  const { data: logRows } = await sb
    .from("notification_logs")
    .select(
      "id,status,provider_key,channel,recipient_phone_e164,rendered_message,provider_message_id,error_code,error_message,created_at,sent_at,failed_at,retried_from_log_id,automation_id,recipient_id,provider_response",
    )
    .eq("business_id", business.id)
    .eq("automation_id", automationId)
    .order("created_at", { ascending: false })
    .limit(25);

  const logs: NotificationLogSummary[] = (logRows ?? []).map((row) => {
    const pr = (row.provider_response ?? null) as Record<string, unknown> | null;
    return {
      id: row.id,
      status: row.status as NotificationStatus,
      providerKey: row.provider_key,
      channel: row.channel,
      recipientPhoneE164: row.recipient_phone_e164,
      renderedMessage: row.rendered_message,
      providerMessageId: row.provider_message_id,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      failedAt: row.failed_at,
      retriedFromLogId: row.retried_from_log_id,
      automationId: row.automation_id,
      recipientId: row.recipient_id,
      providerStep: typeof pr?.step === "string" ? pr.step : null,
      providerHttpStatus:
        typeof pr?.httpStatus === "number" ? (pr.httpStatus as number) : null,
    };
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
      <div className="mb-2 text-[11px]">
        <Link
          href="/admin/message-automations"
          className="text-ink-muted hover:text-ink"
        >
          ← Message Automations
        </Link>
      </div>
      <PageHeader
        eyebrow="Automation"
        title={detail.name}
        description={detail.description ?? "No description."}
        actions={
          <StatusBadge tone={detail.isEnabled ? "success" : "neutral"} dot>
            {detail.isEnabled ? "enabled" : "disabled"}
          </StatusBadge>
        }
      />

      <SectionCard title="Automation">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-ink-muted">automation_key</dt>
          <dd className="font-mono text-ink">{detail.automationKey}</dd>
          <dt className="text-ink-muted">trigger</dt>
          <dd className="font-mono text-ink">
            {detail.triggerType}
            {detail.triggerFilters && Object.keys(detail.triggerFilters).length > 0
              ? ` ${JSON.stringify(detail.triggerFilters)}`
              : ""}
          </dd>
          <dt className="text-ink-muted">channel</dt>
          <dd className="font-mono text-ink">{detail.channel}</dd>
          <dt className="text-ink-muted">provider</dt>
          <dd className="font-mono text-ink">{detail.providerKey}</dd>
          <dt className="text-ink-muted">template_key</dt>
          <dd className="font-mono text-ink">{detail.templateKey}</dd>
        </dl>
        {detail.templatePreview && (
          <div className="mt-3 rounded-control border border-line bg-surface-muted p-3 text-xs">
            <div className="mb-1 uppercase tracking-wide text-ink-muted">
              template preview
            </div>
            <div className="font-mono text-ink">{detail.templatePreview}</div>
          </div>
        )}
        <p className="mt-3 text-[11px] text-ink-faint">
          Editing the trigger, template, or provider is not part of Phase 3.
          Toggle enabled and manage recipients below.
        </p>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Status & recipients"
          description="Toggle this automation on/off and choose which recipients receive its SMS."
        >
          <AutomationDetailClient
            automationId={detail.id}
            initialEnabled={detail.isEnabled}
            assignments={detail.assignments.map((a) => ({
              recipientId: a.recipient.id,
              name: a.recipient.name,
              phoneMasked: maskPhoneE164(a.recipient.phoneE164),
              roleLabel: a.recipient.roleLabel,
              recipientIsActive: a.recipient.isActive,
              assigned: a.assigned,
              assignmentEnabled: a.assignmentEnabled,
            }))}
          />
          <p className="mt-3 text-[11px] text-ink-faint">
            Need to add or edit a recipient?{" "}
            <Link
              href="/admin/message-automations/recipients"
              className="underline hover:text-ink"
            >
              Manage recipients
            </Link>
            .
          </p>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent notification logs"
          description={`Last ${logs.length} log${logs.length === 1 ? "" : "s"} for this automation.`}
        >
          {logs.length === 0 ? (
            <p className="text-xs text-ink-muted">
              No notification logs yet for this automation.
            </p>
          ) : (
            <LogList logs={logs} />
          )}
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        Quote-flow <code>task.created</code> events are{" "}
        <strong>not yet wired</strong> to this automation — that happens
        in Phase 3E.
      </p>
    </AdminShell>
  );
}

function LogList({ logs }: { logs: NotificationLogSummary[] }) {
  return (
    <ul className="divide-y divide-line">
      {logs.map((log) => (
        <li key={log.id} className="py-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-ink">
              {new Date(log.createdAt).toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <StatusBadge tone={toneForStatus(log.status)}>
                {log.status}
              </StatusBadge>
              {log.status === "failed" && (
                <RetryLogButton logId={log.id} />
              )}
            </div>
          </div>
          <div className="mt-1 text-ink-muted">
            {log.providerKey}/{log.channel} ·{" "}
            {maskPhoneE164(log.recipientPhoneE164)}
            {log.providerStep ? ` · step ${log.providerStep}` : ""}
            {log.providerHttpStatus !== null
              ? ` · HTTP ${log.providerHttpStatus}`
              : ""}
            {log.retriedFromLogId ? " · retry" : ""}
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
      ))}
    </ul>
  );
}

function RetryLogButton({ logId }: { logId: string }) {
  return <RetryLogButtonClient logId={logId} />;
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
