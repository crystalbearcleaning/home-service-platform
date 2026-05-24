// Pure builder that maps a Phase 3E quote-flow task into the
// TemplateContext consumed by ../templates.ts. No DB, no env. Customer
// email is intentionally never read or returned — see the rules in
// docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md §9.

import type { TemplateContext } from "./types";

// Inputs the engine collects from the quote-flow context. Everything is
// optional so the helper can render usable fallbacks for the manual
// quote / out-of-area paths (no quote, sometimes no full address).
export type QuoteFlowTaskContext = {
  taskCategory: string;
  taskTitle?: string | null;

  contactFullName?: string | null;

  formattedAddress?: string | null;
  addressLine1?: string | null;
  city?: string | null;

  selectedPlanLabel?: string | null;
  selectedTotal?: number | null;
};

const DOLLAR_TOTAL_RE = /^\$?\d/;

// Render `$439` for a numeric total. Returns null when input is null /
// not a positive finite number.
function formatTotal(total: number | null | undefined): string | null {
  if (total === null || total === undefined) return null;
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  return `$${Math.round(total)}`;
}

// Pick the most specific address available without dragging the
// formatted address (which often includes city + state + zip) when we
// also have a separate city field.
function pickAddress(input: QuoteFlowTaskContext): string | null {
  const line1 = (input.addressLine1 ?? "").trim();
  if (line1.length > 0) return line1;
  const formatted = (input.formattedAddress ?? "").trim();
  if (formatted.length === 0) return null;
  // If the formatted address ends with ", <city>, <state> …" and we
  // have a separate city, strip the city portion to avoid duplication.
  const city = (input.city ?? "").trim();
  if (city.length > 0) {
    const idx = formatted.toLowerCase().indexOf(`, ${city.toLowerCase()}`);
    if (idx > 0) return formatted.slice(0, idx).trim();
  }
  return formatted;
}

export function buildTemplateContextForTask(
  input: QuoteFlowTaskContext,
): TemplateContext {
  const name = (input.contactFullName ?? "").trim();
  const city = (input.city ?? "").trim();
  const planLabel = (input.selectedPlanLabel ?? "").trim();
  const totalRaw = formatTotal(input.selectedTotal ?? null);
  // Guard against an upstream that already passed `$439` as a string.
  const total =
    totalRaw === null && typeof input.selectedTotal === "string"
      ? DOLLAR_TOTAL_RE.test(input.selectedTotal)
        ? input.selectedTotal
        : null
      : totalRaw;

  return {
    customer_name: name.length > 0 ? name : null,
    address: pickAddress(input),
    city: city.length > 0 ? city : null,
    plan_label: planLabel.length > 0 ? planLabel : null,
    total,
    task_category: input.taskCategory,
  };
}
