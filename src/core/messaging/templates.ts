// Pure SMS template renderers for the three Phase 3 seeded automations.
// Inputs are TemplateContext fields; outputs are short action-focused
// strings safe to send via the GHL adapter.
//
// Rules:
//   - never throw
//   - never include the customer's email
//   - fall back to sensible placeholders ("a lead", "an address") so the
//     operator can still understand a partial-context message
//   - keep bodies reasonably short — these are internal alerts, not
//     marketing copy

import type { RenderedMessage, TemplateContext, TemplateKey } from "./types";

const FALLBACK = {
  customerName: "a lead",
  address: "an address",
  city: "their area",
  plan: "their selected plan",
  total: "(no total)",
} as const;

// Trim + collapse internal whitespace; treat empty / whitespace-only as
// missing.
function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length === 0 ? null : s;
}

function locationPhrase(address: string | null, city: string | null): string {
  if (address && city) return `${address}, ${city}`;
  if (address) return address;
  if (city) return city;
  return FALLBACK.address;
}

export function renderScheduleRequest(context: TemplateContext): string {
  const name = clean(context.customer_name) ?? FALLBACK.customerName;
  const address = clean(context.address);
  const city = clean(context.city);
  const plan = clean(context.plan_label) ?? FALLBACK.plan;
  const total = clean(context.total) ?? FALLBACK.total;
  const where = locationPhrase(address, city);
  return `New schedule request: ${name}, ${where}. ${plan}, ${total}. Call/text them to confirm scheduling.`;
}

export function renderManualQuoteNeeded(context: TemplateContext): string {
  const name = clean(context.customer_name) ?? FALLBACK.customerName;
  const address = clean(context.address);
  const city = clean(context.city);
  const where = locationPhrase(address, city);
  return `Manual quote needed: ${name}, ${where}. Property details were missing. Call/text them to prepare a quote.`;
}

export function renderServiceAreaReview(context: TemplateContext): string {
  const name = clean(context.customer_name) ?? FALLBACK.customerName;
  const city = clean(context.city) ?? FALLBACK.city;
  return `Out-of-area lead: ${name}, ${city}. Review whether Crystal Bear can help and follow up.`;
}

const RENDERERS: Record<TemplateKey, (ctx: TemplateContext) => string> = {
  internal_schedule_request_v1: renderScheduleRequest,
  internal_manual_quote_needed_v1: renderManualQuoteNeeded,
  internal_service_area_review_v1: renderServiceAreaReview,
};

export function renderMessage(
  templateKey: TemplateKey,
  context: TemplateContext,
): RenderedMessage {
  const renderer = RENDERERS[templateKey];
  return { templateKey, body: renderer(context) };
}

// Sample context used by the internal SMS test page so admins can preview
// how each template looks with realistic but fake data. Phone is never
// included — only the body fields.
export const SAMPLE_TEMPLATE_CONTEXT: Required<TemplateContext> = {
  customer_name: "Jane Smith (test)",
  address: "8126 Valhalla Dr",
  city: "Boca Raton",
  plan_label: "Every 3 Months",
  total: "$439",
  task_category: "schedule_request",
};
