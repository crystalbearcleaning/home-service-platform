import "server-only";

import { readGhlConfigStatus } from "./config";
import {
  createPendingNotificationLog,
  createSkippedNotificationLog,
  markNotificationLogFailed,
  markNotificationLogSent,
} from "./notification-logs";
import { getSmsProviderAdapter } from "./provider";
import type {
  NotificationLogRelations,
  NotificationStatus,
  ProviderKey,
  SafeProviderResponse,
} from "./types";

// =========================================================================
// sendInternalSmsNotification — Phase 3C orchestrator
//
// Render → write pending log → call adapter → write sent/failed log →
// return discriminated result. Never throws. Customer submission and
// other callers must be wrapped so any failure here is non-fatal upstream
// (Phase 3E will rely on this).
// =========================================================================

export type SendInternalSmsInput = {
  businessId: string;
  automationId: string | null;
  recipientId: string | null;
  providerKey: ProviderKey;
  recipientPhoneE164: string;
  renderedMessage: string;
  retriedFromLogId?: string | null;
} & NotificationLogRelations;

export type SendInternalSmsResult =
  | {
      ok: true;
      logId: string;
      status: Extract<NotificationStatus, "sent">;
      providerMessageId: string | null;
      providerResponse: SafeProviderResponse;
    }
  | {
      ok: false;
      logId: string | null;
      status: Extract<NotificationStatus, "failed" | "skipped">;
      error: { code: string; message: string; details?: unknown };
    };

export async function sendInternalSmsNotification(
  input: SendInternalSmsInput,
): Promise<SendInternalSmsResult> {
  // 1. Validate basic input early (cheap).
  if (!input.businessId) {
    return failPreflight({
      input,
      code: "INVALID_INPUT",
      message: "businessId is required.",
    });
  }
  if (!input.recipientPhoneE164) {
    return failPreflight({
      input,
      code: "INVALID_INPUT",
      message: "recipientPhoneE164 is required.",
    });
  }
  if (!input.renderedMessage || input.renderedMessage.trim().length === 0) {
    return failPreflight({
      input,
      code: "INVALID_INPUT",
      message: "renderedMessage must be non-empty.",
    });
  }

  // 2. Check provider config BEFORE inserting a pending row. When config
  //    is missing, write a single skipped log row with MISSING_CONFIG so
  //    the admin can see what happened without polluting the pending
  //    state.
  const status = readGhlConfigStatus(process.env);
  if (!status.configured) {
    const skipped = await createSkippedNotificationLog({
      businessId: input.businessId,
      automationId: input.automationId,
      recipientId: input.recipientId,
      providerKey: input.providerKey,
      channel: "sms",
      recipientPhoneE164: input.recipientPhoneE164,
      renderedMessage: input.renderedMessage,
      reasonCode: "MISSING_CONFIG",
      reasonMessage: `GoHighLevel is not configured. Missing: ${status.missingKeys.join(", ")}.`,
      relatedTaskId: input.relatedTaskId ?? null,
      relatedLeadId: input.relatedLeadId ?? null,
      relatedQuoteId: input.relatedQuoteId ?? null,
      relatedContactId: input.relatedContactId ?? null,
      relatedPropertyId: input.relatedPropertyId ?? null,
    });

    return {
      ok: false,
      logId: skipped.ok ? skipped.data.logId : null,
      status: "skipped",
      error: {
        code: "MISSING_CONFIG",
        message: `GoHighLevel is not configured. Missing: ${status.missingKeys.join(", ")}.`,
        details: { missingKeys: status.missingKeys },
      },
    };
  }

  // 3. Insert pending log.
  const pending = await createPendingNotificationLog({
    businessId: input.businessId,
    automationId: input.automationId,
    recipientId: input.recipientId,
    providerKey: input.providerKey,
    channel: "sms",
    recipientPhoneE164: input.recipientPhoneE164,
    renderedMessage: input.renderedMessage,
    retriedFromLogId: input.retriedFromLogId ?? null,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedLeadId: input.relatedLeadId ?? null,
    relatedQuoteId: input.relatedQuoteId ?? null,
    relatedContactId: input.relatedContactId ?? null,
    relatedPropertyId: input.relatedPropertyId ?? null,
  });
  if (!pending.ok) {
    return {
      ok: false,
      logId: null,
      status: "failed",
      error: pending.error,
    };
  }
  const logId = pending.data.logId;

  // 4. Call the provider adapter. Never throws on its own.
  const adapter = getSmsProviderAdapter(input.providerKey);
  const sendResult = await adapter.sendSms({
    to: input.recipientPhoneE164,
    body: input.renderedMessage,
  });

  // 5. Persist final status.
  if (sendResult.ok) {
    await markNotificationLogSent({
      logId,
      providerMessageId: sendResult.providerMessageId,
      providerResponse: sendResult.raw,
    });
    return {
      ok: true,
      logId,
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      providerResponse: sendResult.raw,
    };
  }

  await markNotificationLogFailed({
    logId,
    errorCode: sendResult.error.code,
    errorMessage: sendResult.error.message,
    providerResponse: sendResult.error.raw ?? null,
  });
  return {
    ok: false,
    logId,
    status: "failed",
    error: {
      code: sendResult.error.code,
      message: sendResult.error.message,
      details: {
        // Carry the adapter's safe diagnostics through to the caller so
        // the admin UI can render step + http status without re-reading
        // the notification_logs row. No secrets here — these come from
        // the sanitized SafeProviderResponse.
        step: sendResult.error.step ?? sendResult.error.raw?.step ?? null,
        httpStatus:
          sendResult.error.httpStatus ?? sendResult.error.raw?.httpStatus ?? null,
        snippet: sendResult.error.raw?.snippet ?? null,
        original: sendResult.error.details ?? null,
      },
    },
  };
}

// Used when the pre-flight validation itself fails. Writes a skipped log
// so the admin can still see why nothing was sent.
async function failPreflight(args: {
  input: SendInternalSmsInput;
  code: string;
  message: string;
}): Promise<SendInternalSmsResult> {
  const { input, code, message } = args;
  if (!input.businessId || !input.recipientPhoneE164) {
    // Can't write a row without these; just return the error.
    return {
      ok: false,
      logId: null,
      status: "skipped",
      error: { code, message },
    };
  }
  const skipped = await createSkippedNotificationLog({
    businessId: input.businessId,
    automationId: input.automationId,
    recipientId: input.recipientId,
    providerKey: input.providerKey,
    channel: "sms",
    recipientPhoneE164: input.recipientPhoneE164,
    renderedMessage: input.renderedMessage ?? null,
    reasonCode: code,
    reasonMessage: message,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedLeadId: input.relatedLeadId ?? null,
    relatedQuoteId: input.relatedQuoteId ?? null,
    relatedContactId: input.relatedContactId ?? null,
    relatedPropertyId: input.relatedPropertyId ?? null,
  });
  return {
    ok: false,
    logId: skipped.ok ? skipped.data.logId : null,
    status: "skipped",
    error: { code, message },
  };
}
