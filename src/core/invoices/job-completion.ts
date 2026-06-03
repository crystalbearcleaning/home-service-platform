// Phase 11D — pure helpers for the Complete Job → Create Invoice
// flow on /admin/jobs/[jobId]. No DB, no env, no `server-only`.

// Per §15 of the Phase 11 doc: Complete Job is eligible for any
// "in-progress-ish" status, including the tiny-job same-day path
// where a job is invoiced without ever being formally scheduled.
const COMPLETION_ELIGIBLE_STATUSES = new Set<string>([
  "draft",
  "unscheduled",
  "scheduled",
  "in_progress",
]);

export function isJobCompletionEligibleStatus(status: string): boolean {
  return COMPLETION_ELIGIBLE_STATUSES.has(status);
}

// Per §16 of the Phase 11 doc: when a job already has at least one
// invoice, the **primary** Complete Job button is hidden / replaced
// with a notice listing the existing invoices. The manual fallback
// stays available for re-invoicing scenarios.
//
// This helper centralises the UI decision so the server page +
// any tests stay aligned.
export type CompleteJobButtonState =
  | "primary" // status eligible + no invoices → primary CTA
  | "deemphasized" // status eligible BUT invoices already exist
  | "hidden"; // status not eligible

export function deriveCompleteJobButtonState(input: {
  status: string;
  existingInvoiceCount: number;
}): CompleteJobButtonState {
  if (!isJobCompletionEligibleStatus(input.status)) return "hidden";
  if (input.existingInvoiceCount > 0) return "deemphasized";
  return "primary";
}
