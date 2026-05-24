// Pure matching helpers for the Phase 3E automation engine. No DB / no
// fetch — exists so the trigger logic is unit-testable independently
// of Supabase.

export type EngineAutomation = {
  id: string;
  automationKey: string;
  triggerType: string;
  triggerFilters: Record<string, unknown> | null;
  channel: string;
  providerKey: string;
  templateKey: string;
  isEnabled: boolean;
};

export type EngineRecipientAssignment = {
  assignmentId: string;
  recipientId: string;
  assignmentEnabled: boolean;
  recipientName: string;
  recipientPhoneE164: string;
  recipientRoleLabel: string | null;
  recipientIsActive: boolean;
};

// Decide which automations fire for a given task.created event. Filters
// by:
//   - trigger_type === "task.created"
//   - trigger_filters.category === taskCategory
//
// Disabled automations are NOT filtered out here — the engine still
// writes a `skipped` log for them so the admin can see what happened.
export function pickAutomationsForTaskCategory(
  automations: EngineAutomation[],
  taskCategory: string,
): EngineAutomation[] {
  if (!taskCategory) return [];
  return automations.filter((a) => {
    if (a.triggerType !== "task.created") return false;
    if (!a.triggerFilters) return false;
    const cat = a.triggerFilters["category"];
    return typeof cat === "string" && cat === taskCategory;
  });
}

// Recipients that are eligible to receive a send for one automation:
//   - assignment is enabled
//   - recipient row is active
export function pickActiveRecipientsForAutomation(
  assignments: EngineRecipientAssignment[],
): EngineRecipientAssignment[] {
  return assignments.filter(
    (a) => a.assignmentEnabled && a.recipientIsActive,
  );
}

// Per-automation decision: how the engine should treat this automation
// given its state and recipient set. The engine consumes this to either
// call sendInternalSms (per active recipient) or write a single skipped
// log row.
export type AutomationDecision =
  | { kind: "send"; recipients: EngineRecipientAssignment[] }
  | { kind: "skip"; code: "AUTOMATION_DISABLED"; message: string }
  | { kind: "skip"; code: "NO_ACTIVE_RECIPIENTS"; message: string };

export function decideAutomationOutcome(
  automation: EngineAutomation,
  activeRecipients: EngineRecipientAssignment[],
): AutomationDecision {
  if (!automation.isEnabled) {
    return {
      kind: "skip",
      code: "AUTOMATION_DISABLED",
      message: `Automation ${automation.automationKey} is disabled.`,
    };
  }
  if (activeRecipients.length === 0) {
    return {
      kind: "skip",
      code: "NO_ACTIVE_RECIPIENTS",
      message: `Automation ${automation.automationKey} has no active recipients.`,
    };
  }
  return { kind: "send", recipients: activeRecipients };
}
