export const phase1EventTypes = [
  "quote_app.address_entered",
  "auto_quote.quote_generated",
  "quote_app.contact_submitted",
  "quote_app.schedule_requested",
  "lead.created",
  "quote.created",
  "task.created",
  "issue.flagged",
] as const;

export type Phase1EventType = (typeof phase1EventTypes)[number];

export type EventSourceType = "core" | "plugin" | "system";

export type PublishEventInput = {
  businessId: string;
  eventType: Phase1EventType;
  schemaVersion?: number;
  payload: unknown;
  sourceType: EventSourceType;
  sourceKey?: string | null;
  relatedObjectType?: string | null;
  relatedObjectId?: string | null;
};

export type PublishEventResult =
  | { ok: true; eventId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
