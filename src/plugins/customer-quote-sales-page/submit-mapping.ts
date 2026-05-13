// Pure mapping + validation helpers for C3 contact submission. No DB, no
// fetch, no env vars — safe to import from any context and unit-test
// directly.

import type {
  OptionKey,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote/types";
import type { InteractionStatus } from "./types";

// -------------------------------------------------------------------------
// Public result types for the submit-contact orchestrator.
// Declared here (in the pure mapping module — no `server-only`) so the
// client component can import them without dragging server modules into
// the browser bundle.
// -------------------------------------------------------------------------

export type SubmitContactSuccess = {
  kind: SubmitKind;
  contactId: string;
  propertyId: string;
  leadId: string;
  quoteId: string | null;
  taskId: string;
  selectedOptionKey: OptionKey | null;
  selectedTotal: number | null;
  quoteValidDays: number;
  formattedAddress: string;
};

export type SubmitContactErrorCode =
  | "INVALID_INPUT"
  | "VALIDATION_FAILED"
  | "INTERACTION_NOT_FOUND"
  | "ALREADY_CONVERTED"
  | "UNSUPPORTED_INTERACTION_STATUS"
  | "MISSING_PROPERTY_DATA"
  | "MISSING_QUOTE_PREVIEW"
  | "CONTACT_WRITE_FAILED"
  | "PROPERTY_WRITE_FAILED"
  | "LEAD_WRITE_FAILED"
  | "QUOTE_WRITE_FAILED"
  | "TASK_WRITE_FAILED"
  | "INTERACTION_UPDATE_FAILED"
  | "BUSINESS_RESOLUTION_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL"
  | (string & {});

export type SubmitContactError = {
  code: SubmitContactErrorCode;
  message: string;
  field?: string;
  details?: unknown;
};

export type SubmitContactResult =
  | { ok: true; data: SubmitContactSuccess }
  | { ok: false; error: SubmitContactError };

export type LeadStatus =
  | "scheduling_requested"
  | "needs_manual_quote"
  | "service_area_review_needed";

export type TaskCategory =
  | "schedule_request"
  | "manual_quote"
  | "service_area_review";

export type SubmitKind =
  | "quote_generated"
  | "property_data_missing"
  | "out_of_area";

const KIND_TO_LEAD_STATUS: Record<SubmitKind, LeadStatus> = {
  quote_generated: "scheduling_requested",
  property_data_missing: "needs_manual_quote",
  out_of_area: "service_area_review_needed",
};

const KIND_TO_TASK_CATEGORY: Record<SubmitKind, TaskCategory> = {
  quote_generated: "schedule_request",
  property_data_missing: "manual_quote",
  out_of_area: "service_area_review",
};

const KIND_TO_TASK_TITLE: Record<SubmitKind, string> = {
  quote_generated: "Follow up to schedule cleaning",
  property_data_missing: "Prepare manual quote",
  out_of_area: "Review out-of-area quote request",
};

export function leadStatusForKind(kind: SubmitKind): LeadStatus {
  return KIND_TO_LEAD_STATUS[kind];
}

export function taskCategoryForKind(kind: SubmitKind): TaskCategory {
  return KIND_TO_TASK_CATEGORY[kind];
}

export function taskTitleForKind(kind: SubmitKind): string {
  return KIND_TO_TASK_TITLE[kind];
}

// Only these interaction statuses are allowed through C3. Any other
// status (address_entered, error, abandoned, contact_submitted,
// converted) is rejected up-front.
export function kindFromInteractionStatus(
  status: InteractionStatus,
): SubmitKind | null {
  if (status === "quote_generated") return "quote_generated";
  if (status === "property_data_missing") return "property_data_missing";
  if (status === "out_of_area") return "out_of_area";
  return null;
}

// -------------------------------------------------------------------------
// Contact-form validation. Loose by design — basic format only.
// -------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_RE = /\d/g;

export type ContactFormInput = {
  fullName: string;
  phone: string;
  email: string;
};

export type ValidatedContact = {
  fullName: string;
  phone: string;
  email: string;
};

export type ContactValidationError = {
  field: "fullName" | "phone" | "email";
  message: string;
};

export function validateContactForm(
  input: ContactFormInput,
): { ok: true; data: ValidatedContact } | { ok: false; error: ContactValidationError } {
  const fullName = (input.fullName ?? "").trim();
  if (fullName.length < 2) {
    return {
      ok: false,
      error: { field: "fullName", message: "Please enter your full name." },
    };
  }

  const phoneRaw = (input.phone ?? "").trim();
  const phoneDigits = phoneRaw.match(PHONE_DIGITS_RE) ?? [];
  if (phoneDigits.length < 7) {
    return {
      ok: false,
      error: { field: "phone", message: "Please enter a valid phone number." },
    };
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      error: { field: "email", message: "Please enter a valid email address." },
    };
  }

  return { ok: true, data: { fullName, phone: phoneRaw, email } };
}

// -------------------------------------------------------------------------
// Selection validation against a stored quote_preview_data snapshot.
// Only used for the quote_generated path — the other kinds skip this.
// -------------------------------------------------------------------------

export type SelectionInput = {
  selectedOptionKey: OptionKey | null;
  interiorAddOnSelected: boolean;
  selectedTotal: number | null;
};

export type ValidatedSelection = {
  selectedOptionKey: OptionKey;
  selectedServicePlanId: string;
  exteriorPrice: number;
  interiorAddOnSelected: boolean;
  selectedAddOns: Array<{
    add_on_key: "interior_window_cleaning";
    service_id: string;
    price: number;
  }>;
  selectedTotal: number;
};

export type SelectionValidationError = {
  field: "selectedOptionKey" | "interiorAddOnSelected" | "selectedTotal";
  message: string;
};

const VALID_OPTION_KEYS = new Set<OptionKey>([
  "one_time",
  "six_month",
  "three_month",
]);

export function validateSelectionAgainstQuote(
  selection: SelectionInput,
  quote: QuoteOutput,
):
  | { ok: true; data: ValidatedSelection }
  | { ok: false; error: SelectionValidationError } {
  const key = selection.selectedOptionKey;
  if (!key || !VALID_OPTION_KEYS.has(key)) {
    return {
      ok: false,
      error: {
        field: "selectedOptionKey",
        message: "Please pick one of the cleaning options.",
      },
    };
  }
  const option = quote.options.find((o) => o.option_key === key);
  if (!option) {
    return {
      ok: false,
      error: {
        field: "selectedOptionKey",
        message: "Selected option is not part of this quote.",
      },
    };
  }
  const interior = quote.add_ons.find(
    (a) => a.add_on_key === "interior_window_cleaning",
  );

  // Interior was requested but the quote does not include the add-on.
  if (selection.interiorAddOnSelected && !interior) {
    return {
      ok: false,
      error: {
        field: "interiorAddOnSelected",
        message: "Interior add-on is not available for this quote.",
      },
    };
  }

  const interiorPrice =
    selection.interiorAddOnSelected && interior ? interior.price : 0;
  const expectedTotal = option.exterior_price + interiorPrice;

  if (selection.selectedTotal === null || selection.selectedTotal === undefined) {
    return {
      ok: false,
      error: { field: "selectedTotal", message: "Total is missing." },
    };
  }
  if (Math.round(selection.selectedTotal) !== Math.round(expectedTotal)) {
    return {
      ok: false,
      error: {
        field: "selectedTotal",
        message: `Total $${selection.selectedTotal} does not match calculated $${expectedTotal}.`,
      },
    };
  }

  const selectedAddOns: ValidatedSelection["selectedAddOns"] =
    selection.interiorAddOnSelected && interior
      ? [
          {
            add_on_key: "interior_window_cleaning",
            service_id: interior.service_id,
            price: interior.price,
          },
        ]
      : [];

  return {
    ok: true,
    data: {
      selectedOptionKey: key,
      selectedServicePlanId: option.service_plan_id,
      exteriorPrice: option.exterior_price,
      interiorAddOnSelected: selection.interiorAddOnSelected,
      selectedAddOns,
      selectedTotal: expectedTotal,
    },
  };
}

// -------------------------------------------------------------------------
// Quote expiration. Clamps to a sane range so a misconfigured setting
// can't produce already-expired or absurdly-long quotes.
// -------------------------------------------------------------------------

export const DEFAULT_QUOTE_EXPIRATION_DAYS = 30;
const MIN_QUOTE_EXPIRATION_DAYS = 1;
const MAX_QUOTE_EXPIRATION_DAYS = 365;

export function resolveExpirationDays(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n >= MIN_QUOTE_EXPIRATION_DAYS && n <= MAX_QUOTE_EXPIRATION_DAYS) {
      return n;
    }
  }
  return DEFAULT_QUOTE_EXPIRATION_DAYS;
}

export function computeExpiresAtIso(
  now: Date,
  expirationDays: number,
): string {
  const ms = expirationDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}
