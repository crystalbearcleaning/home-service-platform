import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { sendInternalSmsNotification, type SendInternalSmsResult } from "./send-internal-sms";
import type { ProviderKey } from "./types";

// =========================================================================
// Retry a previously-failed notification log.
//
// Contract:
//   - Only logs with status='failed' may be retried.
//   - The original failed row is NEVER mutated.
//   - A NEW notification_logs row is created via the Phase 3C engine with
//     retried_from_log_id set to the original id.
//   - The new row repeats the SAME rendered_message — retrying does not
//     re-render templates because the original may have captured a
//     snapshot the operator wants to resend verbatim.
// =========================================================================

export type RetryNotificationLogResult =
  | {
      ok: true;
      newLogId: string;
      status: SendInternalSmsResult["status"];
      providerMessageId: string | null;
    }
  | {
      ok: false;
      error: {
        code:
          | "LOG_NOT_FOUND"
          | "LOG_NOT_FAILED"
          | "FOREIGN_BUSINESS"
          | "INVALID_ROW"
          | "DB_ERROR"
          | string;
        message: string;
      };
    };

export async function retryFailedNotificationLog(input: {
  businessId: string;
  logId: string;
}): Promise<RetryNotificationLogResult> {
  if (!input.businessId || !input.logId) {
    return {
      ok: false,
      error: { code: "INVALID_ROW", message: "businessId and logId are required." },
    };
  }

  const sb = createServiceRoleClient();
  const { data: row, error } = await sb
    .from("notification_logs")
    .select(
      "id,business_id,status,automation_id,recipient_id,provider_key,recipient_phone_e164,rendered_message,related_task_id,related_lead_id,related_quote_id,related_contact_id,related_property_id",
    )
    .eq("id", input.logId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { code: "DB_ERROR", message: error.message } };
  }
  if (!row) {
    return {
      ok: false,
      error: { code: "LOG_NOT_FOUND", message: "Notification log not found." },
    };
  }
  if (row.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Notification log belongs to a different business.",
      },
    };
  }
  if (row.status !== "failed") {
    return {
      ok: false,
      error: {
        code: "LOG_NOT_FAILED",
        message: `Only failed logs may be retried (current status: ${row.status}).`,
      },
    };
  }
  if (!row.rendered_message || !row.recipient_phone_e164) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROW",
        message: "Original log is missing the rendered message or phone.",
      },
    };
  }

  const send = await sendInternalSmsNotification({
    businessId: row.business_id,
    automationId: row.automation_id,
    recipientId: row.recipient_id,
    providerKey: row.provider_key as ProviderKey,
    recipientPhoneE164: row.recipient_phone_e164,
    renderedMessage: row.rendered_message,
    retriedFromLogId: row.id,
    relatedTaskId: row.related_task_id,
    relatedLeadId: row.related_lead_id,
    relatedQuoteId: row.related_quote_id,
    relatedContactId: row.related_contact_id,
    relatedPropertyId: row.related_property_id,
  });

  if (send.ok) {
    return {
      ok: true,
      newLogId: send.logId,
      status: send.status,
      providerMessageId: send.providerMessageId,
    };
  }
  return {
    ok: false,
    error: {
      code: send.error.code,
      message: send.error.message,
    },
  };
}
