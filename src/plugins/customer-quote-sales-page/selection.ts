// Pure client-side helpers for the quote-cards selection state. Lifted
// out of the React component so the math is unit-testable.

import type {
  OptionKey,
  QuoteAddOn,
  QuoteOption,
} from "@/plugins/window-cleaning-auto-quote";

export type SelectionState = {
  selectedOptionKey: OptionKey | null;
  interiorAddOnSelected: boolean;
};

export const INITIAL_SELECTION: SelectionState = {
  selectedOptionKey: null,
  interiorAddOnSelected: false,
};

export function findSelectedOption(
  options: QuoteOption[],
  key: OptionKey | null,
): QuoteOption | null {
  if (!key) return null;
  return options.find((o) => o.option_key === key) ?? null;
}

// Compute the customer-facing "first cleaning total" given the current
// selection. Returns null when no option is chosen yet — that's the
// signal the UI uses to keep the CTA disabled.
export function computeSelectedTotal(input: {
  selectedOptionKey: OptionKey | null;
  interiorAddOnSelected: boolean;
  options: QuoteOption[];
  interiorAddOn: QuoteAddOn | undefined;
}): number | null {
  const selected = findSelectedOption(input.options, input.selectedOptionKey);
  if (!selected) return null;
  const interior =
    input.interiorAddOnSelected && input.interiorAddOn
      ? input.interiorAddOn.price
      : 0;
  return selected.exterior_price + interior;
}

export function canSchedule(state: SelectionState): boolean {
  return state.selectedOptionKey !== null;
}
