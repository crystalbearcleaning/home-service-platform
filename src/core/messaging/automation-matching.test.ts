import { describe, expect, it } from "vitest";
import {
  decideAutomationOutcome,
  pickActiveRecipientsForAutomation,
  pickAutomationsForTaskCategory,
  type EngineAutomation,
  type EngineRecipientAssignment,
} from "./automation-matching";

const AUTOMATIONS: EngineAutomation[] = [
  {
    id: "a1",
    automationKey: "schedule_request",
    triggerType: "task.created",
    triggerFilters: { category: "schedule_request" },
    channel: "sms",
    providerKey: "gohighlevel",
    templateKey: "internal_schedule_request_v1",
    isEnabled: true,
  },
  {
    id: "a2",
    automationKey: "manual_quote_needed",
    triggerType: "task.created",
    triggerFilters: { category: "manual_quote" },
    channel: "sms",
    providerKey: "gohighlevel",
    templateKey: "internal_manual_quote_needed_v1",
    isEnabled: false,
  },
  {
    id: "a3",
    automationKey: "service_area_review",
    triggerType: "task.created",
    triggerFilters: { category: "service_area_review" },
    channel: "sms",
    providerKey: "gohighlevel",
    templateKey: "internal_service_area_review_v1",
    isEnabled: true,
  },
  {
    id: "a4_irrelevant_trigger",
    automationKey: "future_other",
    triggerType: "quote.created",
    triggerFilters: { category: "schedule_request" },
    channel: "sms",
    providerKey: "gohighlevel",
    templateKey: "internal_schedule_request_v1",
    isEnabled: true,
  },
];

describe("pickAutomationsForTaskCategory", () => {
  it("matches by category + only task.created triggers", () => {
    const r = pickAutomationsForTaskCategory(AUTOMATIONS, "schedule_request");
    expect(r.map((a) => a.id)).toEqual(["a1"]);
  });
  it("does not filter by is_enabled (engine handles it)", () => {
    const r = pickAutomationsForTaskCategory(AUTOMATIONS, "manual_quote");
    expect(r.map((a) => a.id)).toEqual(["a2"]);
  });
  it("returns empty when no automation matches the category", () => {
    expect(pickAutomationsForTaskCategory(AUTOMATIONS, "bogus")).toEqual([]);
  });
  it("returns empty for empty category input", () => {
    expect(pickAutomationsForTaskCategory(AUTOMATIONS, "")).toEqual([]);
  });
  it("ignores rows with null trigger_filters", () => {
    const broken: EngineAutomation = {
      ...AUTOMATIONS[0]!,
      id: "broken",
      triggerFilters: null,
    };
    expect(
      pickAutomationsForTaskCategory([broken], "schedule_request"),
    ).toEqual([]);
  });
});

describe("pickActiveRecipientsForAutomation", () => {
  const base: EngineRecipientAssignment = {
    assignmentId: "ar1",
    recipientId: "r1",
    assignmentEnabled: true,
    recipientName: "Sam",
    recipientPhoneE164: "+15615551234",
    recipientRoleLabel: "Owner",
    recipientIsActive: true,
  };
  it("returns recipients that are both assignment-enabled AND active", () => {
    const r = pickActiveRecipientsForAutomation([
      base,
      { ...base, assignmentId: "ar2", recipientId: "r2", assignmentEnabled: false },
      { ...base, assignmentId: "ar3", recipientId: "r3", recipientIsActive: false },
    ]);
    expect(r.map((x) => x.recipientId)).toEqual(["r1"]);
  });
});

describe("decideAutomationOutcome", () => {
  const enabled = AUTOMATIONS[0]!;
  const disabled = AUTOMATIONS[1]!;
  const rec: EngineRecipientAssignment = {
    assignmentId: "ar1",
    recipientId: "r1",
    assignmentEnabled: true,
    recipientName: "Sam",
    recipientPhoneE164: "+15615551234",
    recipientRoleLabel: "Owner",
    recipientIsActive: true,
  };

  it("returns SEND when enabled and at least one active recipient", () => {
    const r = decideAutomationOutcome(enabled, [rec]);
    expect(r.kind).toBe("send");
    if (r.kind === "send") {
      expect(r.recipients).toHaveLength(1);
    }
  });
  it("returns SKIP AUTOMATION_DISABLED when automation is disabled", () => {
    const r = decideAutomationOutcome(disabled, [rec]);
    expect(r.kind).toBe("skip");
    if (r.kind === "skip") expect(r.code).toBe("AUTOMATION_DISABLED");
  });
  it("returns SKIP NO_ACTIVE_RECIPIENTS when no active recipients", () => {
    const r = decideAutomationOutcome(enabled, []);
    expect(r.kind).toBe("skip");
    if (r.kind === "skip") expect(r.code).toBe("NO_ACTIVE_RECIPIENTS");
  });
  it("AUTOMATION_DISABLED wins over NO_ACTIVE_RECIPIENTS", () => {
    const r = decideAutomationOutcome(disabled, []);
    expect(r.kind).toBe("skip");
    if (r.kind === "skip") expect(r.code).toBe("AUTOMATION_DISABLED");
  });
});
