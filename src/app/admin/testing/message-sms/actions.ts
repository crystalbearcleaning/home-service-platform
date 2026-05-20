"use server";

import { createClient } from "@/core/auth/server";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  renderByTemplateKey,
  SAMPLE_TEMPLATE_CONTEXT,
  sendInternalSmsNotification,
  TEMPLATE_KEYS,
  type NotificationStatus,
} from "@/core/messaging";

// =========================================================================
// Server action for /admin/testing/message-sms.
//
// Auth-gates, validates the recipient + template, renders the message
// with the seeded sample context, and calls the messaging engine. The
// engine handles the pending → sent / failed / skipped transitions and
// writes notification_logs rows.
//
// Never creates contacts / properties / leads / quotes / tasks / events
// / activities / quote_page_interactions.
// =========================================================================

export type SendTestSmsResult =
  | {
      ok: true;
      logId: string;
      status: NotificationStatus;
      providerMessageId: string | null;
      renderedMessage: string;
      providerStep: string | null;
      providerHttpStatus: number | null;
    }
  | {
      ok: false;
      logId: string | null;
      status: NotificationStatus | "unknown";
      error: { code: string; message: string };
      renderedMessage?: string;
      providerStep: string | null;
      providerHttpStatus: number | null;
    };

export async function sendTestSmsAction(input: {
  recipientId: string;
  templateKey: string;
}): Promise<SendTestSmsResult> {
  // 1. Auth gate.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errBeforeLog("UNAUTHORIZED", "You must be signed in to send a test SMS.");
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return errBeforeLog(
      "NO_ACTIVE_BUSINESS",
      "No active business membership for the current user.",
    );
  }

  // 2. Validate template.
  if (!TEMPLATE_KEYS.includes(input.templateKey as (typeof TEMPLATE_KEYS)[number])) {
    return errBeforeLog(
      "UNKNOWN_TEMPLATE",
      `Unknown template_key. Allowed: ${TEMPLATE_KEYS.join(", ")}.`,
    );
  }

  // 3. Validate recipient belongs to this business + is active. Use
  //    service-role so we don't depend on RLS for the existence check.
  const sb = createServiceRoleClient();
  const { data: recipient, error: recipientError } = await sb
    .from("notification_recipients")
    .select("id,business_id,phone_e164,is_active")
    .eq("id", input.recipientId)
    .single();

  if (recipientError || !recipient) {
    return errBeforeLog(
      "RECIPIENT_NOT_FOUND",
      "Could not find the selected notification recipient.",
    );
  }
  if (recipient.business_id !== business.id) {
    return errBeforeLog(
      "RECIPIENT_FOREIGN_BUSINESS",
      "Recipient belongs to a different business.",
    );
  }
  if (!recipient.is_active) {
    return errBeforeLog(
      "RECIPIENT_INACTIVE",
      "Recipient is not active.",
    );
  }

  // 4. Render the SMS body with the seeded sample context.
  const rendered = renderByTemplateKey(input.templateKey, SAMPLE_TEMPLATE_CONTEXT);
  if (!rendered.ok) {
    return errBeforeLog(rendered.error.code, rendered.error.message);
  }

  // 5. Hand off to the engine. The engine writes the notification_logs
  //    row(s) and transitions them through pending → sent / failed /
  //    skipped.
  const send = await sendInternalSmsNotification({
    businessId: business.id,
    automationId: null, // ad-hoc test send, not tied to an automation
    recipientId: recipient.id,
    providerKey: "gohighlevel",
    recipientPhoneE164: recipient.phone_e164,
    renderedMessage: rendered.rendered.body,
  });

  if (send.ok) {
    return {
      ok: true,
      logId: send.logId,
      status: send.status,
      providerMessageId: send.providerMessageId,
      renderedMessage: rendered.rendered.body,
      providerStep: readStr(send.providerResponse?.step),
      providerHttpStatus: readNum(send.providerResponse?.httpStatus),
    };
  }
  return {
    ok: false,
    logId: send.logId,
    status: send.status,
    error: { code: send.error.code, message: send.error.message },
    renderedMessage: rendered.rendered.body,
    providerStep: readStr((send.error.details as { step?: unknown })?.step),
    providerHttpStatus: readNum(
      (send.error.details as { httpStatus?: unknown })?.httpStatus,
    ),
  };
}

function readStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function readNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function errBeforeLog(code: string, message: string): SendTestSmsResult {
  return {
    ok: false,
    logId: null,
    status: "unknown",
    error: { code, message },
    providerStep: null,
    providerHttpStatus: null,
  };
}
