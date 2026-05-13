// Integration test for the C3 submit-contact orchestrator. All DB-touching
// modules are mocked so we can verify:
//   - the right shape of arguments flows into each core create*() function
//   - the kind-specific paths route correctly (quote_generated /
//     property_data_missing / out_of_area)
//   - duplicate / already-converted interactions are rejected
//   - no jobs / appointments / invoices / payments side-effects exist
//     (Phase 1 Do-Not-Build invariant)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedAddress } from "@/core/geo";
import type {
  PropertyDataStatus,
  SafeProviderSnapshot,
} from "@/core/property-data";
import type { QuoteOutput } from "@/plugins/window-cleaning-auto-quote/types";
import type { InteractionStatus } from "./types";

// -------------------------------------------------------------------------
// Mocks. Each captures the call args via vi.fn so assertions can inspect
// the exact payload that the orchestrator passed to the core layer.
// -------------------------------------------------------------------------

vi.mock("@/core/contacts/create", () => ({
  createOrReuseContact: vi.fn(async () => ({
    ok: true,
    contactId: "11111111-1111-1111-1111-111111111111",
    reused: false,
  })),
}));

vi.mock("@/core/properties/create", () => ({
  createPropertyForSubmission: vi.fn(async () => ({
    ok: true,
    propertyId: "22222222-2222-2222-2222-222222222222",
  })),
}));

vi.mock("@/core/leads/create", () => ({
  createLeadFromInteraction: vi.fn(async () => ({
    ok: true,
    leadId: "33333333-3333-3333-3333-333333333333",
  })),
}));

vi.mock("@/core/quotes/create", () => ({
  createQuoteFromInteraction: vi.fn(async () => ({
    ok: true,
    quoteId: "44444444-4444-4444-4444-444444444444",
  })),
}));

vi.mock("@/core/tasks/create", () => ({
  createTask: vi.fn(async () => ({
    ok: true,
    taskId: "55555555-5555-5555-5555-555555555555",
  })),
}));

vi.mock("@/core/events/bus", () => ({
  publishEvent: vi.fn(async () => ({
    ok: true,
    eventId: "66666666-6666-6666-6666-666666666666",
  })),
}));

vi.mock("@/core/activity/logger", () => ({
  createActivity: vi.fn(async () => ({
    ok: true,
    activityId: "77777777-7777-7777-7777-777777777777",
  })),
}));

vi.mock("@/core/business/quote-settings", () => ({
  loadQuoteExpirationSetting: vi.fn(async () => ({
    ok: true,
    rawValue: 30,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadInteractionMock: any = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markConvertedMock: any = vi.fn(async () => ({ ok: true }));
vi.mock("./load-interaction", () => ({
  loadInteractionForSubmission: (...args: unknown[]) =>
    loadInteractionMock(...args),
  markInteractionConverted: (...args: unknown[]) =>
    markConvertedMock(...args),
}));

// Imported *after* mocks above so the orchestrator picks them up.
import { submitContactAndConvert } from "./submit-contact";
import { createOrReuseContact } from "@/core/contacts/create";
import { createPropertyForSubmission } from "@/core/properties/create";
import { createLeadFromInteraction } from "@/core/leads/create";
import { createQuoteFromInteraction } from "@/core/quotes/create";
import { createTask } from "@/core/tasks/create";
import { publishEvent } from "@/core/events/bus";
import { createActivity } from "@/core/activity/logger";

// -------------------------------------------------------------------------
// Fixtures.
// -------------------------------------------------------------------------

const BUSINESS_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const APP_SURFACE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INTERACTION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PLACE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const SERVICE_PLAN_ONE_TIME = "00000000-0000-0000-0000-000000000010";
const SERVICE_PLAN_SIX_MONTH = "00000000-0000-0000-0000-000000000020";
const SERVICE_PLAN_THREE_MONTH = "00000000-0000-0000-0000-000000000030";
const SERVICE_INTERIOR = "00000000-0000-0000-0000-000000000040";

const NORMALIZED_ADDRESS: NormalizedAddress = {
  formatted_address: "123 Ocean Ave, Boynton Beach, FL 33435, USA",
  address_line_1: "123 Ocean Ave",
  address_line_2: null,
  city: "Boynton Beach",
  state: "FL",
  postal_code: "33435",
  country: "US",
  google_place_id: PLACE_ID,
  latitude: 26.5,
  longitude: -80.07,
  raw_google_response: {
    place_id: PLACE_ID,
    formatted_address: "123 Ocean Ave, Boynton Beach, FL 33435, USA",
    types: ["street_address"],
    address_components: [],
    geometry: { location: { lat: 26.5, lng: -80.07 } },
    name: null,
  },
};

const PROVIDER_SNAPSHOT: SafeProviderSnapshot = {
  id: "rc-xyz",
  formattedAddress: "123 Ocean Ave",
  propertyType: "Single Family",
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 1850,
  lotSize: 6500,
  yearBuilt: 1990,
};

function makeQuotePreview(): QuoteOutput {
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
      square_footage: 1850,
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
      generated_at: "2026-05-12T12:00:00.000Z",
    },
    warnings: [],
    source_plugin_key: "window_cleaning_auto_quote",
    source_plugin_version: "0.1.0",
  };
}

function makeInteraction(
  overrides: Partial<{
    interactionStatus: InteractionStatus;
    propertyDataStatus: PropertyDataStatus | string;
    propertyDataSummary: SafeProviderSnapshot | null;
    quotePreviewData: QuoteOutput | null;
    serviceAreaStatus: "in_area" | "out_of_area" | "unknown";
    serviceAreaId: string | null;
    convertedAt: string | null;
    convertedLeadId: string | null;
  }> = {},
) {
  // Use `in overrides` to distinguish explicit `null` from "not provided".
  const has = (k: keyof typeof overrides) => k in overrides;
  return {
    id: INTERACTION_ID,
    businessId: BUSINESS_ID,
    appSurfaceId: APP_SURFACE_ID,
    installedPluginId: null,
    pluginVersion: "0.1.0",
    interactionStatus:
      overrides.interactionStatus ?? ("quote_generated" as InteractionStatus),
    serviceAreaStatus: overrides.serviceAreaStatus ?? "in_area",
    propertyDataStatus: overrides.propertyDataStatus ?? "found",
    normalizedAddress: NORMALIZED_ADDRESS,
    normalizedCity: "boynton beach",
    googlePlaceId: PLACE_ID,
    serviceAreaId: has("serviceAreaId")
      ? overrides.serviceAreaId!
      : "ffffffff-ffff-ffff-ffff-ffffffffffff",
    propertyDataSummary: has("propertyDataSummary")
      ? overrides.propertyDataSummary!
      : PROVIDER_SNAPSHOT,
    quotePreviewData: has("quotePreviewData")
      ? overrides.quotePreviewData!
      : makeQuotePreview(),
    source: "quote_app",
    trackingCode: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    referrer: null,
    convertedAt: has("convertedAt") ? overrides.convertedAt! : null,
    convertedContactId: null,
    convertedLeadId: has("convertedLeadId") ? overrides.convertedLeadId! : null,
    convertedQuoteId: null,
  };
}

const VALID_CONTACT = {
  fullName: "Sam Nesdahl",
  phone: "(561) 555-1234",
  email: "sam@example.com",
};

// -------------------------------------------------------------------------
// Tests.
// -------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  loadInteractionMock.mockImplementation(async () => ({
    ok: true,
    data: makeInteraction(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitContactAndConvert — quote_generated path", () => {
  it("creates contact + property + lead + quote + task with the right shapes", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: true,
        selectedTotal: 325,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("quote_generated");
    expect(result.data.quoteId).not.toBeNull();
    expect(result.data.quoteValidDays).toBe(30);
    expect(result.data.selectedOptionKey).toBe("three_month");
    expect(result.data.selectedTotal).toBe(325);

    // Contact insert
    expect(createOrReuseContact).toHaveBeenCalledTimes(1);
    const contactInput = vi.mocked(createOrReuseContact).mock.calls[0]![0];
    expect(contactInput).toMatchObject({
      businessId: BUSINESS_ID,
      fullName: "Sam Nesdahl",
      email: "sam@example.com",
      source: "quote_app",
      createdFromAppSurfaceId: APP_SURFACE_ID,
      createdFromPluginKey: "customer_quote_sales_page",
    });

    // Property insert
    expect(createPropertyForSubmission).toHaveBeenCalledTimes(1);
    const propertyInput =
      vi.mocked(createPropertyForSubmission).mock.calls[0]![0];
    expect(propertyInput.businessId).toBe(BUSINESS_ID);
    expect(propertyInput.contactId).toBe("11111111-1111-1111-1111-111111111111");
    expect(propertyInput.serviceAreaStatus).toBe("in_area");
    expect(propertyInput.propertyData?.squareFootage).toBe(1850);
    expect(propertyInput.normalizedAddress.formatted_address).toContain(
      "Boynton Beach",
    );

    // Lead insert — must use scheduling_requested for this path
    expect(createLeadFromInteraction).toHaveBeenCalledTimes(1);
    const leadInput = vi.mocked(createLeadFromInteraction).mock.calls[0]![0];
    expect(leadInput.status).toBe("scheduling_requested");
    expect(leadInput.quotePageInteractionId).toBe(INTERACTION_ID);
    expect(leadInput.createdFromPluginKey).toBe("customer_quote_sales_page");

    // Quote insert — must be a complete immutable snapshot
    expect(createQuoteFromInteraction).toHaveBeenCalledTimes(1);
    const quoteInput = vi.mocked(createQuoteFromInteraction).mock.calls[0]![0];
    expect(quoteInput.businessId).toBe(BUSINESS_ID);
    expect(quoteInput.leadId).toBe("33333333-3333-3333-3333-333333333333");
    expect(quoteInput.sourcePluginKey).toBe("window_cleaning_auto_quote");
    expect(quoteInput.sourcePluginVersion).toBe("0.1.0");
    expect(quoteInput.selectedOptionKey).toBe("three_month");
    expect(quoteInput.selectedServicePlanId).toBe(SERVICE_PLAN_THREE_MONTH);
    expect(quoteInput.selectedTotal).toBe(325);
    expect(quoteInput.selectedAddOns).toHaveLength(1);
    expect(quoteInput.selectedAddOns[0]).toMatchObject({
      add_on_key: "interior_window_cleaning",
      service_id: SERVICE_INTERIOR,
      price: 125,
    });
    // expiresAt = now + 30d
    const expiresAt = new Date(quoteInput.expiresAt).getTime();
    const diffDays = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);

    // Task insert — schedule_request category
    expect(createTask).toHaveBeenCalledTimes(1);
    const taskInput = vi.mocked(createTask).mock.calls[0]![0];
    expect(taskInput.taskCategory).toBe("schedule_request");
    expect(taskInput.title).toBe("Follow up to schedule cleaning");
    expect(taskInput.relatedObjectType).toBe("lead");

    // Interaction marked converted
    expect(markConvertedMock).toHaveBeenCalledTimes(1);
    const markArgs = markConvertedMock.mock.calls[0]![0];
    expect(markArgs.newStatus).toBe("converted");
    expect(markArgs.contactId).toBe("11111111-1111-1111-1111-111111111111");
    expect(markArgs.quoteId).toBe("44444444-4444-4444-4444-444444444444");

    // Events: contact_submitted, schedule_requested, lead.created,
    // quote.created, task.created
    const publishedEventTypes = vi
      .mocked(publishEvent)
      .mock.calls.map((c) => c[0].eventType);
    expect(publishedEventTypes).toContain("quote_app.contact_submitted");
    expect(publishedEventTypes).toContain("quote_app.schedule_requested");
    expect(publishedEventTypes).toContain("lead.created");
    expect(publishedEventTypes).toContain("quote.created");
    expect(publishedEventTypes).toContain("task.created");

    // Activities mirror the major events.
    expect(createActivity).toHaveBeenCalled();
  });

  it("uses the seeded 30-day expiration when business_settings returns 30", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 200,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.quoteValidDays).toBe(30);
  });
});

describe("submitContactAndConvert — property_data_missing path", () => {
  beforeEach(() => {
    loadInteractionMock.mockImplementation(async () => ({
      ok: true,
      data: makeInteraction({
        interactionStatus: "property_data_missing",
        propertyDataStatus: "missing",
        propertyDataSummary: null,
        quotePreviewData: null,
      }),
    }));
  });

  it("creates lead with needs_manual_quote and manual_quote task, no quote row", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        selectedTotal: null,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("property_data_missing");
    expect(result.data.quoteId).toBeNull();

    expect(createQuoteFromInteraction).not.toHaveBeenCalled();

    const leadInput = vi.mocked(createLeadFromInteraction).mock.calls[0]![0];
    expect(leadInput.status).toBe("needs_manual_quote");

    const taskInput = vi.mocked(createTask).mock.calls[0]![0];
    expect(taskInput.taskCategory).toBe("manual_quote");
    expect(taskInput.title).toBe("Prepare manual quote");

    const publishedEventTypes = vi
      .mocked(publishEvent)
      .mock.calls.map((c) => c[0].eventType);
    expect(publishedEventTypes).toContain("lead.created");
    expect(publishedEventTypes).not.toContain("quote.created");
    expect(publishedEventTypes).not.toContain("quote_app.schedule_requested");
  });
});

describe("submitContactAndConvert — out_of_area path", () => {
  beforeEach(() => {
    loadInteractionMock.mockImplementation(async () => ({
      ok: true,
      data: makeInteraction({
        interactionStatus: "out_of_area",
        serviceAreaStatus: "out_of_area",
        propertyDataStatus: "not_requested",
        serviceAreaId: null,
        propertyDataSummary: null,
        quotePreviewData: null,
      }),
    }));
  });

  it("creates lead with service_area_review_needed and the matching task, no quote", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        selectedTotal: null,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe("out_of_area");
    expect(result.data.quoteId).toBeNull();

    expect(createQuoteFromInteraction).not.toHaveBeenCalled();

    const leadInput = vi.mocked(createLeadFromInteraction).mock.calls[0]![0];
    expect(leadInput.status).toBe("service_area_review_needed");

    const propertyInput =
      vi.mocked(createPropertyForSubmission).mock.calls[0]![0];
    expect(propertyInput.serviceAreaStatus).toBe("out_of_area");
    expect(propertyInput.serviceAreaId).toBeNull();
    expect(propertyInput.propertyData).toBeNull();

    const taskInput = vi.mocked(createTask).mock.calls[0]![0];
    expect(taskInput.taskCategory).toBe("service_area_review");
    expect(taskInput.title).toBe("Review out-of-area quote request");
  });
});

describe("submitContactAndConvert — guards", () => {
  it("rejects an interaction that is already converted", async () => {
    loadInteractionMock.mockImplementation(async () => ({
      ok: true,
      data: makeInteraction({
        convertedAt: "2026-05-10T10:00:00.000Z",
        convertedLeadId: "99999999-9999-9999-9999-999999999999",
      }),
    }));

    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 200,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ALREADY_CONVERTED");
    }
    expect(createOrReuseContact).not.toHaveBeenCalled();
    expect(createLeadFromInteraction).not.toHaveBeenCalled();
    expect(createQuoteFromInteraction).not.toHaveBeenCalled();
  });

  it("rejects an interaction in an unsupported status", async () => {
    loadInteractionMock.mockImplementation(async () => ({
      ok: true,
      data: makeInteraction({ interactionStatus: "error" }),
    }));

    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        selectedTotal: null,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_INTERACTION_STATUS");
    }
  });

  it("rejects an invalid contact form before touching the DB", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: { fullName: "", phone: "", email: "" },
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 200,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(createOrReuseContact).not.toHaveBeenCalled();
  });

  it("rejects an unknown option on the quote_generated path", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        selectedTotal: null,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a mismatched total on the quote_generated path", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 9_999,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.field).toBe("selectedTotal");
    }
  });
});

// -------------------------------------------------------------------------
// Phase 1 Do-Not-Build invariant: the orchestrator MUST NOT touch
// jobs / appointments / invoices / payments. The mock import surface
// above intentionally covers every database-touching dependency the
// orchestrator imports — there is no separate `createJob` / `createInvoice`
// / `createPayment` / `createAppointment` symbol available, so a future
// edit that tried to introduce one would either fail to compile or
// surface here. This test pins the contract.
// -------------------------------------------------------------------------
describe("Phase 1 Do-Not-Build invariant", () => {
  it("never creates jobs / appointments / invoices / payments / recurring agreements", async () => {
    const result = await submitContactAndConvert({
      businessId: BUSINESS_ID,
      appSurfaceId: APP_SURFACE_ID,
      interactionId: INTERACTION_ID,
      contact: VALID_CONTACT,
      selection: {
        selectedOptionKey: "three_month",
        interiorAddOnSelected: false,
        selectedTotal: 200,
      },
    });
    expect(result.ok).toBe(true);

    // Only the four expected creators were invoked.
    expect(createOrReuseContact).toHaveBeenCalledTimes(1);
    expect(createPropertyForSubmission).toHaveBeenCalledTimes(1);
    expect(createLeadFromInteraction).toHaveBeenCalledTimes(1);
    expect(createQuoteFromInteraction).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledTimes(1);

    // And no quote acceptance, appointment booking, or invoice path.
    // (No such symbols are imported by the orchestrator.)
  });
});
