import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import type {
  NotificationLogRelations,
  NotificationLogSummary,
  SafeProviderResponse,
} from "./types";

// =========================================================================
// Server-only helpers for the notification_logs table.
//
// Engine flow (Phase 3C + Phase 3E):
//   1. createPendingNotificationLog → INSERT (status = pending)
//   2. attempt send via the provider adapter
//   3. markNotificationLogSent / markNotificationLogFailed → UPDATE same row
//
// Skipped sends use createSkippedNotificationLog directly (no pending step).
// Manual retry uses createPendingNotificationLog with retriedFromLogId set
// to the original failed row's id; the original row is never mutated.
//
// All functions never throw and return discriminated results.
// =========================================================================

export type LogResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export type CreatePendingInput = {
  businessId: string;
  automationId: string | null;
  recipientId: string | null;
  providerKey: "gohighlevel";
  channel: "sms";
  recipientPhoneE164: string;
  renderedMessage: string;
  retriedFromLogId?: string | null;
} & NotificationLogRelations;

export async function createPendingNotificationLog(
  input: CreatePendingInput,
): Promise<LogResult<{ logId: string }>> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }

  const { data, error } = await supabase
    .from("notification_logs")
    .insert({
      business_id: input.businessId,
      automation_id: input.automationId,
      recipient_id: input.recipientId,
      provider_key: input.providerKey,
      channel: input.channel,
      status: "pending",
      recipient_phone_e164: input.recipientPhoneE164,
      rendered_message: input.renderedMessage,
      related_task_id: input.relatedTaskId ?? null,
      related_lead_id: input.relatedLeadId ?? null,
      related_quote_id: input.relatedQuoteId ?? null,
      related_contact_id: input.relatedContactId ?? null,
      related_property_id: input.relatedPropertyId ?? null,
      retried_from_log_id: input.retriedFromLogId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert notification_logs row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, data: { logId: data.id } };
}

export type MarkSentInput = {
  logId: string;
  providerMessageId: string | null;
  providerResponse: SafeProviderResponse | null;
};

export async function markNotificationLogSent(
  input: MarkSentInput,
): Promise<LogResult> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }
  const { error } = await supabase
    .from("notification_logs")
    .update({
      status: "sent",
      provider_message_id: input.providerMessageId,
      provider_response: input.providerResponse,
      sent_at: new Date().toISOString(),
    })
    .eq("id", input.logId);

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }
  return { ok: true };
}

export type MarkFailedInput = {
  logId: string;
  errorCode: string;
  errorMessage: string;
  providerResponse: SafeProviderResponse | null;
};

export async function markNotificationLogFailed(
  input: MarkFailedInput,
): Promise<LogResult> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }
  const { error } = await supabase
    .from("notification_logs")
    .update({
      status: "failed",
      error_code: input.errorCode,
      error_message: truncate(input.errorMessage, 500),
      provider_response: input.providerResponse,
      failed_at: new Date().toISOString(),
    })
    .eq("id", input.logId);

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }
  return { ok: true };
}

export type CreateSkippedInput = {
  businessId: string;
  automationId: string | null;
  recipientId: string | null;
  providerKey: "gohighlevel";
  channel: "sms";
  recipientPhoneE164: string;
  renderedMessage: string | null;
  reasonCode: string;
  reasonMessage: string;
} & NotificationLogRelations;

export async function createSkippedNotificationLog(
  input: CreateSkippedInput,
): Promise<LogResult<{ logId: string }>> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }

  const { data, error } = await supabase
    .from("notification_logs")
    .insert({
      business_id: input.businessId,
      automation_id: input.automationId,
      recipient_id: input.recipientId,
      provider_key: input.providerKey,
      channel: input.channel,
      status: "skipped",
      recipient_phone_e164: input.recipientPhoneE164,
      rendered_message: input.renderedMessage,
      error_code: input.reasonCode,
      error_message: truncate(input.reasonMessage, 500),
      related_task_id: input.relatedTaskId ?? null,
      related_lead_id: input.relatedLeadId ?? null,
      related_quote_id: input.relatedQuoteId ?? null,
      related_contact_id: input.relatedContactId ?? null,
      related_property_id: input.relatedPropertyId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Failed to insert skipped notification_logs row.",
        details: error ? { hint: error.hint, code: error.code } : undefined,
      },
    };
  }

  return { ok: true, data: { logId: data.id } };
}

// -------------------------------------------------------------------------
// Listing recent logs for a business (admin test page + future UI). Pure
// SELECT — RLS would also allow the user-context client to read these,
// but using the service-role client here keeps the engine ↔ UI seam
// consistent.
// -------------------------------------------------------------------------
export async function listRecentNotificationLogs(input: {
  businessId: string;
  limit?: number;
}): Promise<LogResult<{ logs: NotificationLogSummary[] }>> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const { data, error } = await supabase
    .from("notification_logs")
    .select(
      "id,status,provider_key,channel,recipient_phone_e164,rendered_message,provider_message_id,error_code,error_message,created_at,sent_at,failed_at,retried_from_log_id,automation_id,recipient_id,provider_response",
    )
    .eq("business_id", input.businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }
  const logs: NotificationLogSummary[] = (data ?? []).map((row) => {
    const pr = (row as { provider_response?: unknown }).provider_response;
    const providerStep = readPrField(pr, "step", "string") as string | null;
    const providerHttpStatus = readPrField(
      pr,
      "httpStatus",
      "number",
    ) as number | null;
    return {
      id: row.id,
      status: row.status,
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
      providerStep,
      providerHttpStatus,
    };
  });
  return { ok: true, data: { logs } };
}

// Defensive jsonb projection — provider_response is jsonb and may be
// null, missing the key, or shaped differently across providers.
function readPrField(
  raw: unknown,
  key: string,
  kind: "string" | "number",
): string | number | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)[key];
  if (kind === "string" && typeof v === "string") return v;
  if (kind === "number" && typeof v === "number" && Number.isFinite(v))
    return v;
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
