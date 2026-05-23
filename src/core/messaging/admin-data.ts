import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import type { NotificationStatus } from "./types";

// =========================================================================
// Server-only data loaders for the Phase 3D Message Automations admin
// pages. Centralised here so the page server components, server actions,
// and any future panel widget query the same shapes through the same
// projections.
//
// All reads use the service-role client — consistent with the Phase 3C
// engine writes. RLS would also allow the user-context client to read
// these tables, but service-role keeps the engine ↔ UI seam clean.
// =========================================================================

export type AdminAutomationRow = {
  id: string;
  automationKey: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerFilters: Record<string, unknown> | null;
  channel: string;
  providerKey: string;
  templateKey: string;
  templatePreview: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  recipientCount: number;
  lastLog: {
    id: string;
    status: NotificationStatus;
    createdAt: string;
  } | null;
};

export type AdminRecipientRow = {
  id: string;
  name: string;
  phoneE164: string;
  roleLabel: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminAutomationRecipientAssignment = {
  recipient: AdminRecipientRow;
  assigned: boolean;
  assignmentEnabled: boolean;
  assignmentId: string | null;
};

export type AdminAutomationDetail = AdminAutomationRow & {
  assignments: AdminAutomationRecipientAssignment[];
};

// -------------------------------------------------------------------------
// List automations + their recipient count + their most-recent log.
// -------------------------------------------------------------------------
export async function listAdminAutomations(
  businessId: string,
): Promise<AdminAutomationRow[]> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("message_automations")
    .select(
      "id,automation_key,name,description,trigger_type,trigger_filters,channel,provider_key,template_key,template_preview,is_enabled,created_at,updated_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const automationIds = data.map((r) => r.id);

  // Per-automation recipient count.
  const counts: Record<string, number> = {};
  if (automationIds.length > 0) {
    const { data: countRows } = await sb
      .from("automation_recipients")
      .select("automation_id,recipient_id")
      .in("automation_id", automationIds)
      .eq("is_enabled", true);
    for (const row of countRows ?? []) {
      counts[row.automation_id] = (counts[row.automation_id] ?? 0) + 1;
    }
  }

  // Per-automation latest log (one extra round-trip — fine for Phase 3
  // single-tenant scale; revisit if list becomes long).
  const lastLogs: Record<
    string,
    { id: string; status: NotificationStatus; createdAt: string } | null
  > = {};
  for (const id of automationIds) {
    lastLogs[id] = null;
    const { data: row } = await sb
      .from("notification_logs")
      .select("id,status,created_at")
      .eq("business_id", businessId)
      .eq("automation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      lastLogs[id] = {
        id: row.id,
        status: row.status as NotificationStatus,
        createdAt: row.created_at,
      };
    }
  }

  return data.map((r) => ({
    id: r.id,
    automationKey: r.automation_key,
    name: r.name,
    description: r.description,
    triggerType: r.trigger_type,
    triggerFilters: (r.trigger_filters ?? null) as Record<string, unknown> | null,
    channel: r.channel,
    providerKey: r.provider_key,
    templateKey: r.template_key,
    templatePreview: r.template_preview,
    isEnabled: r.is_enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    recipientCount: counts[r.id] ?? 0,
    lastLog: lastLogs[r.id] ?? null,
  }));
}

// -------------------------------------------------------------------------
// Load one automation + every recipient for the business plus its
// assignment state. Returns null when not found / not for this business.
// -------------------------------------------------------------------------
export async function getAdminAutomationDetail(input: {
  businessId: string;
  automationId: string;
}): Promise<AdminAutomationDetail | null> {
  const sb = createServiceRoleClient();
  const { data: row, error } = await sb
    .from("message_automations")
    .select(
      "id,automation_key,name,description,trigger_type,trigger_filters,channel,provider_key,template_key,template_preview,is_enabled,created_at,updated_at",
    )
    .eq("business_id", input.businessId)
    .eq("id", input.automationId)
    .maybeSingle();
  if (error || !row) return null;

  const [recipients, assignments] = await Promise.all([
    listAdminRecipients(input.businessId),
    sb
      .from("automation_recipients")
      .select("id,recipient_id,is_enabled")
      .eq("business_id", input.businessId)
      .eq("automation_id", input.automationId),
  ]);

  const assignmentsByRecipient = new Map<
    string,
    { id: string; isEnabled: boolean }
  >();
  for (const ar of assignments.data ?? []) {
    assignmentsByRecipient.set(ar.recipient_id, {
      id: ar.id,
      isEnabled: ar.is_enabled,
    });
  }

  const assignmentsView: AdminAutomationRecipientAssignment[] = recipients.map(
    (r) => {
      const assn = assignmentsByRecipient.get(r.id);
      return {
        recipient: r,
        assigned: !!assn,
        assignmentEnabled: assn?.isEnabled ?? false,
        assignmentId: assn?.id ?? null,
      };
    },
  );

  // Recipient count derived from active assignments (also active recipient).
  const recipientCount = assignmentsView.filter(
    (a) => a.assigned && a.assignmentEnabled && a.recipient.isActive,
  ).length;

  // Most recent log for this automation.
  const { data: lastLogRow } = await sb
    .from("notification_logs")
    .select("id,status,created_at")
    .eq("business_id", input.businessId)
    .eq("automation_id", input.automationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: row.id,
    automationKey: row.automation_key,
    name: row.name,
    description: row.description,
    triggerType: row.trigger_type,
    triggerFilters: (row.trigger_filters ?? null) as Record<string, unknown> | null,
    channel: row.channel,
    providerKey: row.provider_key,
    templateKey: row.template_key,
    templatePreview: row.template_preview,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipientCount,
    lastLog: lastLogRow
      ? {
          id: lastLogRow.id,
          status: lastLogRow.status as NotificationStatus,
          createdAt: lastLogRow.created_at,
        }
      : null,
    assignments: assignmentsView,
  };
}

// -------------------------------------------------------------------------
// All recipients for a business, both active + inactive. Sorted by
// active first then name.
// -------------------------------------------------------------------------
export async function listAdminRecipients(
  businessId: string,
): Promise<AdminRecipientRow[]> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("notification_recipients")
    .select("id,name,phone_e164,role_label,is_active,created_at,updated_at")
    .eq("business_id", businessId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    phoneE164: r.phone_e164,
    roleLabel: r.role_label,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
