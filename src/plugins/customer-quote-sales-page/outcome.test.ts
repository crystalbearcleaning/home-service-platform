import { describe, it, expect } from "vitest";
import { decideOutcome } from "./outcome";
import type { ServiceAreaMatch } from "@/core/geo";
import type { NormalizedPropertyData } from "@/core/property-data";
import type {
  AutoQuoteResult,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote";

const IN_AREA: ServiceAreaMatch = {
  inArea: true,
  serviceAreaId: "00000000-0000-0000-0000-0000000000a1",
  serviceAreaName: "Boynton Beach",
  normalizedCity: "boynton beach",
  reason: null,
};

const OUT_OF_AREA: ServiceAreaMatch = {
  inArea: false,
  serviceAreaId: null,
  serviceAreaName: null,
  normalizedCity: "wellington",
  reason: 'No active service area for city "Wellington".',
};

function foundProperty(): NormalizedPropertyData {
  return {
    square_footage: 1850,
    property_type: "Single Family",
    lot_size_sqft: 6500,
    year_built: 1990,
    bedrooms: 3,
    bathrooms: 2,
    data_source: "rentcast",
    data_confidence: "high",
    property_data_status: "found",
    provider_property_id: "rc-xyz",
    provider_snapshot: {
      id: "rc-xyz",
      formattedAddress: "123 Main St",
      propertyType: "Single Family",
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1850,
      lotSize: 6500,
      yearBuilt: 1990,
    },
  };
}

function missingProperty(): NormalizedPropertyData {
  return {
    ...foundProperty(),
    square_footage: null,
    data_confidence: "unknown",
    property_data_status: "missing",
  };
}

const FAKE_QUOTE_OK: AutoQuoteResult = {
  ok: true,
  data: {
    can_quote: true,
    manual_quote_required: false,
    reason: null,
    options: [],
    add_ons: [],
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
  } satisfies QuoteOutput,
};

describe("decideOutcome", () => {
  it("returns out_of_area without ever inspecting property/quote", () => {
    const result = decideOutcome({
      serviceArea: OUT_OF_AREA,
      property: null,
      quote: null,
    });
    expect(result.interactionStatus).toBe("out_of_area");
    expect(result.serviceAreaStatus).toBe("out_of_area");
    expect(result.propertyDataStatus).toBe("not_requested");
    expect(result.quotePreview).toBeNull();
    expect(result.reason).toContain("Wellington");
  });

  it("returns error when in-area but property lookup failed (property=null)", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: null,
      quote: null,
    });
    expect(result.interactionStatus).toBe("error");
    expect(result.propertyDataStatus).toBe("error");
    expect(result.providerError).toBeTruthy();
  });

  it("returns property_data_missing when sqft is missing", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: missingProperty(),
      quote: null,
    });
    expect(result.interactionStatus).toBe("property_data_missing");
    expect(result.propertyDataStatus).toBe("missing");
    expect(result.quotePreview).toBeNull();
  });

  it("returns error when sqft was found but Auto-Quote was not invoked", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: foundProperty(),
      quote: null,
    });
    expect(result.interactionStatus).toBe("error");
  });

  it("returns error when Auto-Quote returned ok=false", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: foundProperty(),
      quote: {
        ok: false,
        error: { code: "DB_ERROR", message: "boom" },
      },
    });
    expect(result.interactionStatus).toBe("error");
    expect(result.providerError).toBe("DB_ERROR");
  });

  it("returns property_data_missing when Auto-Quote flags manual_quote_required", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: foundProperty(),
      quote: {
        ok: true,
        data: {
          ...FAKE_QUOTE_OK.ok ? FAKE_QUOTE_OK.data : ({} as QuoteOutput),
          can_quote: false,
          manual_quote_required: true,
          reason: "input validation flagged",
        } as QuoteOutput,
      },
    });
    expect(result.interactionStatus).toBe("property_data_missing");
    expect(result.propertyDataStatus).toBe("missing");
  });

  it("returns quote_generated with the full quote preview when everything succeeds", () => {
    const result = decideOutcome({
      serviceArea: IN_AREA,
      property: foundProperty(),
      quote: FAKE_QUOTE_OK,
    });
    expect(result.interactionStatus).toBe("quote_generated");
    expect(result.propertyDataStatus).toBe("found");
    expect(result.serviceAreaStatus).toBe("in_area");
    expect(result.quotePreview).not.toBeNull();
    expect(result.reason).toBeNull();
  });
});
