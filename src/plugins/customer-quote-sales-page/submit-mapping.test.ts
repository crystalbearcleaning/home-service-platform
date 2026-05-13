import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUOTE_EXPIRATION_DAYS,
  computeExpiresAtIso,
  kindFromInteractionStatus,
  leadStatusForKind,
  resolveExpirationDays,
  taskCategoryForKind,
  taskTitleForKind,
  validateContactForm,
  validateSelectionAgainstQuote,
} from "./submit-mapping";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote/types";

const SERVICE_PLAN_ONE_TIME = "00000000-0000-0000-0000-000000000010";
const SERVICE_PLAN_SIX_MONTH = "00000000-0000-0000-0000-000000000020";
const SERVICE_PLAN_THREE_MONTH = "00000000-0000-0000-0000-000000000030";
const SERVICE_INTERIOR = "00000000-0000-0000-0000-000000000040";

function makeQuote(): QuoteOutput {
  return {
    can_quote: true,
    manual_quote_required: false,
    reason: null,
    options: [
      {
        option_key: "one_time",
        service_plan_id: SERVICE_PLAN_ONE_TIME,
        service_plan_name: "One-Time Clean",
        display_label: "One-Time",
        is_recommended: false,
        exterior_price: 250,
        recurring_interval_months: null,
        price_label: "$250",
      },
      {
        option_key: "six_month",
        service_plan_id: SERVICE_PLAN_SIX_MONTH,
        service_plan_name: "Every 6 Months",
        display_label: "Every 6 Months",
        is_recommended: false,
        exterior_price: 225,
        recurring_interval_months: 6,
        price_label: "$225 per visit",
      },
      {
        option_key: "three_month",
        service_plan_id: SERVICE_PLAN_THREE_MONTH,
        service_plan_name: "Every 3 Months",
        display_label: "Every 3 Months",
        is_recommended: true,
        exterior_price: 200,
        recurring_interval_months: 3,
        price_label: "$200 per visit",
      },
    ],
    add_ons: [
      {
        add_on_key: "interior_window_cleaning",
        service_id: SERVICE_INTERIOR,
        service_code: "interior_window_cleaning",
        service_name: "Interior Window Cleaning",
        price: 125,
        display_label: "Add Interior Window Cleaning to This Cleaning: +$125",
      },
    ],
    selected_option_key: null,
    selected_add_ons: [],
    line_items_snapshot: [],
    price_snapshot: {
      currency: "USD",
      minimum_price: 199,
      options: { one_time: 250, six_month: 225, three_month: 200 },
      add_ons: { interior_window_cleaning: 125 },
    },
    calculation_snapshot: {
      square_footage: 2500,
      base_exterior_before_minimum: 250,
      minimum_price: 199,
      one_time_formula: "max(square_footage * 0.10 * 1, 199)",
      six_month_multiplier: 0.9,
      three_month_multiplier: 0.8,
      interior_multiplier: 0.5,
      minimum_applied: {
        one_time: false,
        six_month: false,
        three_month: false,
        interior_add_on: false,
      },
      rounding: "nearest_dollar",
      price_rules_used: [],
      reason: null,
      generated_at: new Date().toISOString(),
    },
    warnings: [],
    source_plugin_key: "window_cleaning_auto_quote",
    source_plugin_version: "0.1.0",
  };
}

describe("kindFromInteractionStatus", () => {
  it("maps the three supported statuses", () => {
    expect(kindFromInteractionStatus("quote_generated")).toBe(
      "quote_generated",
    );
    expect(kindFromInteractionStatus("property_data_missing")).toBe(
      "property_data_missing",
    );
    expect(kindFromInteractionStatus("out_of_area")).toBe("out_of_area");
  });

  it("rejects unrelated statuses", () => {
    expect(kindFromInteractionStatus("address_entered")).toBeNull();
    expect(kindFromInteractionStatus("contact_submitted")).toBeNull();
    expect(kindFromInteractionStatus("converted")).toBeNull();
    expect(kindFromInteractionStatus("error")).toBeNull();
    expect(kindFromInteractionStatus("abandoned")).toBeNull();
  });
});

describe("kind → lead / task mapping", () => {
  it("maps lead status correctly", () => {
    expect(leadStatusForKind("quote_generated")).toBe("scheduling_requested");
    expect(leadStatusForKind("property_data_missing")).toBe(
      "needs_manual_quote",
    );
    expect(leadStatusForKind("out_of_area")).toBe(
      "service_area_review_needed",
    );
  });

  it("maps task category correctly", () => {
    expect(taskCategoryForKind("quote_generated")).toBe("schedule_request");
    expect(taskCategoryForKind("property_data_missing")).toBe("manual_quote");
    expect(taskCategoryForKind("out_of_area")).toBe("service_area_review");
  });

  it("maps task title correctly", () => {
    expect(taskTitleForKind("quote_generated")).toBe(
      "Follow up to schedule cleaning",
    );
    expect(taskTitleForKind("property_data_missing")).toBe(
      "Prepare manual quote",
    );
    expect(taskTitleForKind("out_of_area")).toBe(
      "Review out-of-area quote request",
    );
  });
});

describe("validateContactForm", () => {
  it("accepts a valid form", () => {
    const r = validateContactForm({
      fullName: "Sam Nesdahl",
      phone: "(561) 555-1234",
      email: "sam@example.com",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fullName).toBe("Sam Nesdahl");
      expect(r.data.email).toBe("sam@example.com");
    }
  });

  it("rejects an empty / short name", () => {
    const r = validateContactForm({
      fullName: "S",
      phone: "555-555-5555",
      email: "x@y.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("fullName");
  });

  it("rejects a phone with too few digits", () => {
    const r = validateContactForm({
      fullName: "Sam Nesdahl",
      phone: "123",
      email: "x@y.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("phone");
  });

  it("rejects an invalid email", () => {
    const r = validateContactForm({
      fullName: "Sam Nesdahl",
      phone: "555-555-5555",
      email: "not-an-email",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("email");
  });

  it("lowercases the email", () => {
    const r = validateContactForm({
      fullName: "Sam",
      phone: "555 555 5555",
      email: "Sam@Example.COM",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe("sam@example.com");
  });
});

describe("validateSelectionAgainstQuote", () => {
  it("accepts a 3-month option without interior", () => {
    const quote = makeQuote();
    const r = validateSelectionAgainstQuote(
      {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 200,
      },
      quote,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.selectedTotal).toBe(200);
      expect(r.data.selectedAddOns).toEqual([]);
      expect(r.data.selectedServicePlanId).toBe(SERVICE_PLAN_THREE_MONTH);
    }
  });

  it("accepts a 3-month option WITH interior add-on", () => {
    const quote = makeQuote();
    const r = validateSelectionAgainstQuote(
      {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: true,
        selectedTotal: 325,
      },
      quote,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.selectedTotal).toBe(325);
      expect(r.data.selectedAddOns).toHaveLength(1);
      expect(r.data.selectedAddOns[0]).toEqual({
        add_on_key: "interior_window_cleaning",
        service_id: SERVICE_INTERIOR,
        price: 125,
      });
    }
  });

  it("rejects an unknown option key", () => {
    const quote = makeQuote();
    const r = validateSelectionAgainstQuote(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        selectedOptionKey: "bogus" as any,
        interiorAddOnSelected: false,
        selectedTotal: 100,
      },
      quote,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("selectedOptionKey");
  });

  it("rejects a missing option key", () => {
    const quote = makeQuote();
    const r = validateSelectionAgainstQuote(
      {
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        selectedTotal: null,
      },
      quote,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("selectedOptionKey");
  });

  it("rejects a mismatched total", () => {
    const quote = makeQuote();
    const r = validateSelectionAgainstQuote(
      {
        selectedOptionKey: "six_month",
        interiorAddOnSelected: false,
        selectedTotal: 999,
      },
      quote,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("selectedTotal");
  });

  it("rejects interior add-on when quote has none", () => {
    const quote = makeQuote();
    quote.add_ons = [];
    const r = validateSelectionAgainstQuote(
      {
        selectedOptionKey: "one_time",
        interiorAddOnSelected: true,
        selectedTotal: 250,
      },
      quote,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("interiorAddOnSelected");
  });
});

describe("resolveExpirationDays", () => {
  it("returns the default for missing / null / non-numeric values", () => {
    expect(resolveExpirationDays(null)).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
    expect(resolveExpirationDays(undefined)).toBe(
      DEFAULT_QUOTE_EXPIRATION_DAYS,
    );
    expect(resolveExpirationDays("30")).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
    expect(resolveExpirationDays(NaN)).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
    expect(resolveExpirationDays({})).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
  });

  it("returns the default for out-of-range values", () => {
    expect(resolveExpirationDays(0)).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
    expect(resolveExpirationDays(-10)).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
    expect(resolveExpirationDays(99999)).toBe(DEFAULT_QUOTE_EXPIRATION_DAYS);
  });

  it("uses the stored value when in range", () => {
    expect(resolveExpirationDays(14)).toBe(14);
    expect(resolveExpirationDays(60)).toBe(60);
  });

  it("defaults to 30 days, matching the seeded business_settings", () => {
    expect(DEFAULT_QUOTE_EXPIRATION_DAYS).toBe(30);
  });
});

describe("computeExpiresAtIso", () => {
  it("adds the requested number of days to the provided 'now'", () => {
    const now = new Date("2026-05-12T12:00:00.000Z");
    const iso = computeExpiresAtIso(now, 30);
    expect(iso).toBe("2026-06-11T12:00:00.000Z");
  });
});
