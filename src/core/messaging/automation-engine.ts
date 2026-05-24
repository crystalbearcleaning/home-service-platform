import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  decideAutomationOutcome,
  pickActiveRecipientsForAutomation,
  pickAutomationsForTaskCategory,
  type EngineAutomation,
  type EngineRecipientAssignment,
} from "./automation-matching";
import { createSkippedNotificationLog } from "./notification-logs";
import { renderByTemplateKey } from "./render";
import { sendInternalSmsNotification } from "./send-internal-sms";
import {
  buildTemplateContextForTask,
  type QuoteFlowTaskContext,
} from "./template-context";
import type {
  NotificationLogRelations,
  NotificationStatus,
  ProviderKey,
} from "./types";

// =========================================================================
// Phase 3E Message Automation Engine
//
// One entry point: evaluateAutomationsForTaskCreated(input).
//
//   - Loads enabled+disabled automations for the business
//   - Filters by trigger_type='task.created' + trigger_filters.category
//   - For each matching automation:
//       - if DISABLED          → write one skipped log (AUTOMATION_DISABLED)
//       - if NO active recipients → write one skipped log (NO_ACTIVE_RECIPIENTS)
//       - else                 → per active recipient:
//                                 render → sendInternalSmsNotification
//
// sendInternalSmsNotification already handles MISSING_CONFIG by writing
// a skipped log without making a network call, so the engine does not
// need to re-implement that branch.
//
// Never throws. Callers (the quote-flow orchestrator) still wrap calls
// in try/catch as defense-in-depth so messaging can never block the
// customer confirmation.
// =========================================================================

export type EvaluateAutomationsInput = {
  businessId: string;
  taskId: string;
  taskContext: QuoteFlowTaskContext;
  related: NotificationLogRelations;
};

export type AutomationOutcome = {
  automationId: string;
  automationKey: string;
  status: "sent" | "failed" | "skipped";
  errorCode?: string;
  errorMessage?: string;
  recipientCount: number;
  logIds: string[];
};

export type EvaluateAutomationsResult = {
  ok: true;
  matched: number;
  outcomes: AutomationOutcome[];
};

export async function evaluateAutomationsForTaskCreated(
  input: EvaluateAutomationsInput,
): Promise<EvaluateAutomationsResult> {
  try {
    return await evaluateInner(input);
  } catch (err) {
    // Defence in depth — any unexpected failure becomes a no-op for
    // the caller. The caller has already returned success to the
    // customer; messaging is purely a side effect.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[automation-engine] unhandled error:", message);
    return { ok: true, matched: 0, outcomes: [] };
  }
}

async function evaluateInner(
  input: EvaluateAutomationsInput,
): Promise<EvaluateAutomationsResult> {
  if (!input.businessId || !input.taskId) {
    return { ok: true, matched: 0, outcomes: [] };
  }
  const category = input.taskContext.taskCategory;
  if (!category) {
    return { ok: true, matched: 0, outcomes: [] };
  }

  const sb = createServiceRoleClient();

  // 1. Load all automations for the business + matching trigger type.
  const { data: automationRows, error: autErr } = await sb
    .from("message_automations")
    .select(
      "id,automation_key,trigger_type,trigger_filters,channel,provider_key,template_key,is_enabled",
    )
    .eq("business_id", input.businessId)
    .eq("trigger_type", "task.created");
  if (autErr) {
    console.error(
      "[automation-engine] failed to load automations:",
      autErr.message,
    );
    return { ok: true, matched: 0, outcomes: [] };
  }

  const allAutomations: EngineAutomation[] = (automationRows ?? []).map(
    (r) => ({
      id: r.id,
      automationKey: r.automation_key,
      triggerType: r.trigger_type,
      triggerFilters: (r.trigger_filters ?? null) as Record<
        string,
        unknown
      > | null,
      channel: r.channel,
      providerKey: r.provider_key,
      templateKey: r.template_key,
      isEnabled: r.is_enabled,
    }),
  );

  const matched = pickAutomationsForTaskCategory(allAutomations, category);
  if (matched.length === 0) {
    return { ok: true, matched: 0, outcomes: [] };
  }

  // 2. Load every recipient + assignment for the matched automation ids
  //    in one round-trip.
  const matchedIds = matched.map((a) => a.id);
  const assignmentsByAutomation = new Map<
    string,
    EngineRecipientAssignment[]
  >();
  for (const id of matchedIds) assignmentsByAutomation.set(id, []);

  const { data: assignmentRows, error: arErr } = await sb
    .from("automation_recipients")
    .select(
      "id,automation_id,recipient_id,is_enabled,notification_recipients!inner(id,name,phone_e164,role_label,is_active)",
    )
    .in("automation_id", matchedIds)
    .eq("business_id", input.businessId);

  if (arErr) {
    console.error(
      "[automation-engine] failed to load assignments:",
      arErr.message,
    );
    // Treat as "no recipients for any matched automation" — still write
    // skipped logs so the failure is visible.
  } else {
    for (const r of assignmentRows ?? []) {
      const rec = (r as { notification_recipients?: unknown })
        .notification_recipients;
      // Supabase's inferred type for !inner sometimes models this as an
      // array even though one row is returned. Normalize.
      const recipient = Array.isArray(rec) ? rec[0] : rec;
      if (!recipient || typeof recipient !== "object") continue;
      const recObj = recipient as Record<string, unknown>;
      const automationId = r.automation_id;
      const existing = assignmentsByAutomation.get(automationId) ?? [];
      existing.push({
        assignmentId: r.id,
        recipientId: r.recipient_id,
        assignmentEnabled: !!r.is_enabled,
        recipientName: String(recObj.name ?? ""),
        recipientPhoneE164: String(recObj.phone_e164 ?? ""),
        recipientRoleLabel:
          typeof recObj.role_label === "string" ? recObj.role_label : null,
        recipientIsActive: !!recObj.is_active,
      });
      assignmentsByAutomation.set(automationId, existing);
    }
  }

  // 3. Render template once per matched automation — the body is the
  //    same for every recipient on a single automation. If rendering
  //    fails (unknown template key), we record a skipped log per
  //    matched automation.
  const outcomes: AutomationOutcome[] = [];

  for (const automation of matched) {
    const renderResult = renderByTemplateKey(
      automation.templateKey,
      buildTemplateContextForTask(input.taskContext),
    );

    const activeRecipients = pickActiveRecipientsForAutomation(
      assignmentsByAutomation.get(automation.id) ?? [],
    );
    const decision = decideAutomationOutcome(automation, activeRecipients);

    // Template render error → one skipped log.
    if (!renderResult.ok) {
      const log = await createSkippedNotificationLog({
        businessId: input.businessId,
        automationId: automation.id,
        recipientId: null,
        providerKey: automation.providerKey as ProviderKey,
        channel: "sms",
        recipientPhoneE164: "",
        renderedMessage: null,
        reasonCode: renderResult.error.code,
        reasonMessage: renderResult.error.message,
        ...input.related,
      });
      outcomes.push({
        automationId: automation.id,
        automationKey: automation.automationKey,
        status: "skipped",
        errorCode: renderResult.error.code,
        errorMessage: renderResult.error.message,
        recipientCount: 0,
        logIds: log.ok ? [log.data.logId] : [],
      });
      continue;
    }

    const renderedBody = renderResult.rendered.body;

    if (decision.kind === "skip") {
      // Disabled OR no active recipients → one skipped log, no network.
      const log = await createSkippedNotificationLog({
        businessId: input.businessId,
        automationId: automation.id,
        recipientId: null,
        providerKey: automation.providerKey as ProviderKey,
        channel: "sms",
        recipientPhoneE164: "",
        renderedMessage: renderedBody,
        reasonCode: decision.code,
        reasonMessage: decision.message,
        ...input.related,
      });
      outcomes.push({
        automationId: automation.id,
        automationKey: automation.automationKey,
        status: "skipped",
        errorCode: decision.code,
        errorMessage: decision.message,
        recipientCount: 0,
        logIds: log.ok ? [log.data.logId] : [],
      });
      continue;
    }

    // Send path: one engine call per active recipient. sendInternalSms
    // handles MISSING_CONFIG, pending/sent/failed transitions, and
    // sanitization. We aggregate the result statuses below.
    const logIds: string[] = [];
    const failureCodes: string[] = [];
    const failureMessages: string[] = [];
    let lastStatus: NotificationStatus = "skipped";

    for (const recipient of decision.recipients) {
      const send = await sendInternalSmsNotification({
        businessId: input.businessId,
        automationId: automation.id,
        recipientId: recipient.recipientId,
        providerKey: automation.providerKey as ProviderKey,
        recipientPhoneE164: recipient.recipientPhoneE164,
        renderedMessage: renderedBody,
        ...input.related,
      });
      if (send.logId) logIds.push(send.logId);
      lastStatus = send.status;
      if (!send.ok) {
        failureCodes.push(send.error.code);
        failureMessages.push(send.error.message);
      }
    }

    const allSent = failureCodes.length === 0;
    const allSkipped = failureCodes.every(
      (c) => c === "MISSING_CONFIG" || c.startsWith("SKIP"),
    );
    outcomes.push({
      automationId: automation.id,
      automationKey: automation.automationKey,
      status: allSent
        ? "sent"
        : lastStatus === "skipped" && allSkipped
          ? "skipped"
          : "failed",
      errorCode: failureCodes[0],
      errorMessage: failureMessages[0],
      recipientCount: decision.recipients.length,
      logIds,
    });
  }

  return { ok: true, matched: matched.length, outcomes };
}
