import { describe, it, expect } from "vitest";
import {
  canSchedule,
  computeSelectedTotal,
  findSelectedOption,
  INITIAL_SELECTION,
} from "./selection";
import type {
  QuoteAddOn,
  QuoteOption,
} from "@/plugins/window-cleaning-auto-quote";

const OPTIONS: QuoteOption[] = [
  {
    option_key: "one_time",
    service_plan_id: "p1",
    service_plan_name: "One-Time Clean",
    display_label: "One-Time",
    is_recommended: false,
    exterior_price: 250,
    recurring_interval_months: null,
    price_label: "$250",
  },
  {
    option_key: "six_month",
    service_plan_id: "p2",
    service_plan_name: "Every 6 Months",
    display_label: "Every 6 Months",
    is_recommended: false,
    exterior_price: 225,
    recurring_interval_months: 6,
    price_label: "$225 per visit",
  },
  {
    option_key: "three_month",
    service_plan_id: "p3",
    service_plan_name: "Every 3 Months",
    display_label: "Every 3 Months",
    is_recommended: true,
    exterior_price: 200,
    recurring_interval_months: 3,
    price_label: "$200 per visit",
  },
];

const INTERIOR: QuoteAddOn = {
  add_on_key: "interior_window_cleaning",
  service_id: "svc-int",
  service_code: "INT_WINDOW",
  service_name: "Interior Window Cleaning",
  price: 125,
  display_label: "Add Interior Window Cleaning to This Cleaning: +$125",
};

describe("INITIAL_SELECTION", () => {
  it("has no option selected by default", () => {
    expect(INITIAL_SELECTION.selectedOptionKey).toBeNull();
    expect(INITIAL_SELECTION.interiorAddOnSelected).toBe(false);
  });
});

describe("findSelectedOption", () => {
  it("returns null when no key is set", () => {
    expect(findSelectedOption(OPTIONS, null)).toBeNull();
  });
  it("returns the matching option", () => {
    expect(findSelectedOption(OPTIONS, "three_month")?.exterior_price).toBe(
      200,
    );
  });
});

describe("computeSelectedTotal", () => {
  it("returns null when nothing is selected", () => {
    expect(
      computeSelectedTotal({
        selectedOptionKey: null,
        interiorAddOnSelected: false,
        options: OPTIONS,
        interiorAddOn: INTERIOR,
      }),
    ).toBeNull();
  });

  it("returns the option price alone when interior is off", () => {
    expect(
      computeSelectedTotal({
        selectedOptionKey: "six_month",
        interiorAddOnSelected: false,
        options: OPTIONS,
        interiorAddOn: INTERIOR,
      }),
    ).toBe(225);
  });

  it("adds the interior price when interior is on", () => {
    expect(
      computeSelectedTotal({
        selectedOptionKey: "one_time",
        interiorAddOnSelected: true,
        options: OPTIONS,
        interiorAddOn: INTERIOR,
      }),
    ).toBe(375);
  });

  it("ignores interiorAddOnSelected when no add-on object is provided", () => {
    expect(
      computeSelectedTotal({
        selectedOptionKey: "three_month",
        interiorAddOnSelected: true,
        options: OPTIONS,
        interiorAddOn: undefined,
      }),
    ).toBe(200);
  });
});

describe("canSchedule", () => {
  it("returns false until an option is chosen", () => {
    expect(canSchedule(INITIAL_SELECTION)).toBe(false);
  });
  it("returns true once an option is chosen", () => {
    expect(
      canSchedule({ selectedOptionKey: "one_time", interiorAddOnSelected: false }),
    ).toBe(true);
  });
});
