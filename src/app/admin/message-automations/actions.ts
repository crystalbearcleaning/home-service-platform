"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { validateRecipientInput } from "@/core/messaging/admin-validation";
import { retryFailedNotificationLog } from "@/core/messaging/retry";

// =========================================================================
// Phase 3D admin server actions. Every action:
//   - requires a signed-in user
//   - resolves the user's active business
//   - scopes all writes to that business
//   - uses the service-role client (Pattern B from Phase 1: members are
//     SELECT-only at the RLS layer; controlled writes go through these
//     server actions)
//   - returns a discriminated result
//   - never throws unhandled errors to the client
//   - never echoes secrets
//
// Allowed writes in Phase 3D:
//   - message_automations.is_enabled
//   - notification_recipients (insert / update)
//   - automation_recipients (insert / update / delete)
//   - notification_logs via the retry path (new row only — original is
//     never mutated)
// =========================================================================

type AdminResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string> } };

async function requireBusiness(): Promise<
  | { ok: true; userId: string; businessId: string }
  | AdminResult<never>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Sign-in required." } };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business for this user." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

// -------------------------------------------------------------------------
// Toggle the enabled flag on one automation.
// -------------------------------------------------------------------------
export async function setAutomationEnabledAction(input: {
  automationId: string;
  isEnabled: boolean;
}): Promise<AdminResult> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  if (!input.automationId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "automationId is required." },
    };
  }
  if (typeof input.isEnabled !== "boolean") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "isEnabled must be boolean." },
    };
  }

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("message_automations")
    .update({ is_enabled: input.isEnabled })
    .eq("id", input.automationId)
    .eq("business_id", auth.businessId);

  if (error) {
    return { ok: false, error: { code: "DB_ERROR", message: error.message } };
  }

  revalidatePath("/admin/message-automations");
  revalidatePath(`/admin/message-automations/${input.automationId}`);
  return { ok: true };
}

// -------------------------------------------------------------------------
// Add / remove / toggle a recipient assignment for an automation.
//   - assigned=true  + no existing row  → insert
//   - assigned=true  + existing row     → update is_enabled
//   - assigned=false + existing row     → delete the assignment
//   - assigned=false + no existing row  → noop (idempotent)
// -------------------------------------------------------------------------
export async function setAutomationRecipientAssignmentAction(input: {
  automationId: string;
  recipientId: string;
  assigned: boolean;
  isEnabled?: boolean;
}): Promise<AdminResult> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;
  if (!input.automationId || !input.recipientId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "automationId and recipientId are required.",
      },
    };
  }

  const sb = createServiceRoleClient();

  // Belt-and-suspenders: verify both rows belong to this business.
  const { data: aut } = await sb
    .from("message_automations")
    .select("id,business_id")
    .eq("id", input.automationId)
    .maybeSingle();
  if (!aut || aut.business_id !== auth.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Automation not found for this business.",
      },
    };
  }
  const { data: rec } = await sb
    .from("notification_recipients")
    .select("id,business_id")
    .eq("id", input.recipientId)
    .maybeSingle();
  if (!rec || rec.business_id !== auth.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Recipient not found for this business.",
      },
    };
  }

  if (!input.assigned) {
    const { error } = await sb
      .from("automation_recipients")
      .delete()
      .eq("business_id", auth.businessId)
      .eq("automation_id", input.automationId)
      .eq("recipient_id", input.recipientId);
    if (error) {
      return { ok: false, error: { code: "DB_ERROR", message: error.message } };
    }
  } else {
    // Upsert via (automation_id, recipient_id) unique constraint.
    const { error } = await sb
      .from("automation_recipients")
      .upsert(
        {
          business_id: auth.businessId,
          automation_id: input.automationId,
          recipient_id: input.recipientId,
          is_enabled: input.isEnabled ?? true,
        },
        { onConflict: "automation_id,recipient_id" },
      );
    if (error) {
      return { ok: false, error: { code: "DB_ERROR", message: error.message } };
    }
  }

  revalidatePath("/admin/message-automations");
  revalidatePath(`/admin/message-automations/${input.automationId}`);
  return { ok: true };
}

// -------------------------------------------------------------------------
// Create or update a notification recipient.
// -------------------------------------------------------------------------
export async function upsertNotificationRecipientAction(input: {
  recipientId?: string | null;
  name: string;
  phoneE164: string;
  roleLabel?: string | null;
  isActive: boolean;
}): Promise<AdminResult<{ recipientId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const validation = validateRecipientInput({
    name: input.name,
    phoneE164: input.phoneE164,
    roleLabel: input.roleLabel ?? null,
    isActive: input.isActive,
  });
  if (!validation.ok) {
    const fieldErrors: Record<string, string> = {};
    for (const e of validation.errors) fieldErrors[e.field] = e.message;
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        fieldErrors,
      },
    };
  }
  const safe = validation.data;
  const sb = createServiceRoleClient();

  if (input.recipientId) {
    // Update path — verify ownership first.
    const { data: existing } = await sb
      .from("notification_recipients")
      .select("id,business_id")
      .eq("id", input.recipientId)
      .maybeSingle();
    if (!existing || existing.business_id !== auth.businessId) {
      return {
        ok: false,
        error: { code: "FOREIGN_BUSINESS", message: "Recipient not found for this business." },
      };
    }
    const { error } = await sb
      .from("notification_recipients")
      .update({
        name: safe.name,
        phone_e164: safe.phoneE164,
        role_label: safe.roleLabel,
        is_active: safe.isActive,
      })
      .eq("id", input.recipientId)
      .eq("business_id", auth.businessId);
    if (error) {
      return { ok: false, error: mapRecipientDbError(error) };
    }
    revalidatePath("/admin/message-automations");
    revalidatePath("/admin/message-automations/recipients");
    return { ok: true, data: { recipientId: input.recipientId } };
  }

  // Insert path.
  const { data, error } = await sb
    .from("notification_recipients")
    .insert({
      business_id: auth.businessId,
      name: safe.name,
      phone_e164: safe.phoneE164,
      role_label: safe.roleLabel,
      is_active: safe.isActive,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: mapRecipientDbError(error),
    };
  }
  revalidatePath("/admin/message-automations");
  revalidatePath("/admin/message-automations/recipients");
  return { ok: true, data: { recipientId: data.id } };
}

function mapRecipientDbError(error: {
  message?: string;
  code?: string;
} | null): { code: string; message: string; fieldErrors?: Record<string, string> } {
  const message = error?.message ?? "Recipient write failed.";
  // Unique violation on (business_id, phone_e164).
  if (error?.code === "23505" || /duplicate key/i.test(message)) {
    return {
      code: "DUPLICATE_PHONE",
      message:
        "A recipient with that phone number already exists for this business.",
      fieldErrors: { phoneE164: "This phone number is already a recipient." },
    };
  }
  // CHECK constraint on phone format (defense-in-depth; the validator
  // catches this first).
  if (/notification_recipients_phone_e164_format/i.test(message)) {
    return {
      code: "INVALID_E164",
      message: "Phone must be in E.164 format.",
      fieldErrors: { phoneE164: "Phone must be in E.164 format (e.g. +15615551234)." },
    };
  }
  return { code: "DB_ERROR", message };
}

// -------------------------------------------------------------------------
// Retry a failed notification log via Phase 3C engine.
// -------------------------------------------------------------------------
export async function retryNotificationLogAction(input: {
  logId: string;
}): Promise<AdminResult<{ newLogId: string; status: string; providerMessageId: string | null }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;
  if (!input.logId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "logId is required." },
    };
  }
  const result = await retryFailedNotificationLog({
    businessId: auth.businessId,
    logId: input.logId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: { code: result.error.code, message: result.error.message },
    };
  }
  revalidatePath("/admin/message-automations");
  // The retry result might belong to any automation; revalidate the
  // detail route too if we can reach it. We don't carry automation_id
  // here, so the listing revalidation above is sufficient.
  return {
    ok: true,
    data: {
      newLogId: result.newLogId,
      status: result.status,
      providerMessageId: result.providerMessageId,
    },
  };
}
