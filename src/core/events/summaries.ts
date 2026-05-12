import type { Phase1EventType } from "./types";

export const phase1EventTypeSummaries: Record<Phase1EventType, string> = {
  "quote_app.address_entered": "Visitor entered an address.",
  "auto_quote.quote_generated": "Quote generated.",
  "quote_app.contact_submitted": "Contact information submitted.",
  "quote_app.schedule_requested": "Schedule requested.",
  "lead.created": "Lead created.",
  "quote.created": "Quote created.",
  "task.created": "Admin task created.",
  "issue.flagged": "Issue flagged.",
};

// Map a (possibly-unknown) event_type string to a human-readable summary.
// Known Phase 1 event types use the table above; unknown types fall back
// to a generic deburred version of the type string.
export function summarizePhase1Event(eventType: string): string {
  const summary = phase1EventTypeSummaries[eventType as Phase1EventType];
  if (typeof summary === "string") return summary;
  return eventType.replace(/[._]/g, " ");
}
