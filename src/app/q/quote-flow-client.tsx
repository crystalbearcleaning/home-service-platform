"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAutocomplete,
  type SelectedPlace,
} from "@/components/google-autocomplete";
// IMPORTANT: import from specific files, not the plugin barrel
// (`@/plugins/customer-quote-sales-page`), because that barrel re-exports
// server-only modules (address-lookup.ts, interactions.ts, context.ts).
// The value imports below would otherwise pull those into the browser
// bundle and trigger the "You're importing a component that needs
// server-only" build error.
import {
  canSchedule,
  computeSelectedTotal,
  INITIAL_SELECTION,
  type SelectionState,
} from "@/plugins/customer-quote-sales-page/selection";
import type {
  AddressLookupResult,
  CustomerQuotePageContext,
  TrackingContext,
} from "@/plugins/customer-quote-sales-page/types";
import type {
  OptionKey,
  QuoteAddOn,
  QuoteOption,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote/types";
import { lookupAddressForQuoteAction } from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "looking_up"; place: SelectedPlace }
  | { kind: "result"; place: SelectedPlace; result: AddressLookupResult };

type Props = {
  context: CustomerQuotePageContext;
};

const TRACKING_KEYS = [
  "source",
  "tracking_code",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

function readTrackingContext(): TrackingContext {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: TrackingContext = {};
  for (const key of TRACKING_KEYS) {
    const value = params.get(key);
    if (value && value.trim().length > 0) {
      (out as Record<string, string>)[key] = value.trim();
    }
  }
  const referrer = typeof document !== "undefined" ? document.referrer : "";
  if (referrer) out.referrer = referrer;
  return out;
}

export function QuoteFlowClient({ context }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [autocompleteError, setAutocompleteError] = useState<string | null>(
    null,
  );

  const handleSelect = useCallback(async (place: SelectedPlace) => {
    setAutocompleteError(null);
    setState({ kind: "looking_up", place });
    const tracking = readTrackingContext();
    let result: AddressLookupResult;
    try {
      result = await lookupAddressForQuoteAction({
        placeId: place.placeId,
        formattedAddress: place.formattedAddress,
        tracking,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("lookupAddressForQuoteAction threw:", err);
      result = {
        ok: false,
        error: {
          code: "INTERNAL",
          message: `Could not reach the address lookup service: ${message}`,
        },
      };
    }
    setState({ kind: "result", place, result });
  }, []);

  const headlineSubtitle =
    "Get an instant exterior window cleaning quote — no calls, no callbacks.";

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-medium text-gray-900">
          Enter your address
        </h2>
        <p className="text-sm text-gray-600 mt-1">{headlineSubtitle}</p>
        <div className="mt-3">
          <GoogleAutocomplete
            onSelect={handleSelect}
            onSelectError={setAutocompleteError}
            disabled={state.kind === "looking_up"}
            placeholder="Start typing your address…"
          />
          {autocompleteError && (
            <p className="text-xs text-red-600 mt-1">{autocompleteError}</p>
          )}
        </div>
      </section>

      {state.kind === "looking_up" && (
        <p className="text-sm text-gray-600">
          Checking <code className="text-xs">{state.place.formattedAddress}</code>…
        </p>
      )}

      {state.kind === "result" && (
        <ResultArea context={context} place={state.place} result={state.result} />
      )}

      <TrustSection points={context.copy.customer_quote_trust_points} />
      <SecondaryContact context={context} />
    </div>
  );
}

function ResultArea({
  context,
  place,
  result,
}: {
  context: CustomerQuotePageContext;
  place: SelectedPlace;
  result: AddressLookupResult;
}) {
  if (!result.ok) {
    if (result.error.code === "RATE_LIMITED") {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Slow down a sec.</p>
          <p className="mt-1">
            Please wait{" "}
            {result.error.retryAfterSeconds ?? "a few"} seconds before trying
            another address.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-medium">We hit a snag.</p>
        <p className="mt-1">{result.error.message}</p>
        <p className="mt-2 text-xs">
          Try again, or {context.business.phone ? `call ${context.business.phone}` : "give us a call"}.
        </p>
      </div>
    );
  }

  const data = result.data;

  if (data.kind === "out_of_area") {
    return (
      <FallbackCard
        tone="amber"
        title="Out of service area"
        primary={context.copy.fallback_out_of_service_area}
        contactStepMessage={data.contactStepMessage}
        formattedAddress={data.formattedAddress || place.formattedAddress}
      />
    );
  }

  if (data.kind === "property_data_missing") {
    return (
      <FallbackCard
        tone="amber"
        title="Property details unavailable"
        primary={context.copy.fallback_property_data_missing}
        contactStepMessage={data.contactStepMessage}
        formattedAddress={data.formattedAddress || place.formattedAddress}
      />
    );
  }

  return (
    <QuoteResultCard
      context={context}
      formattedAddress={data.formattedAddress || place.formattedAddress}
      quote={data.quotePreview}
    />
  );
}

function FallbackCard({
  tone,
  title,
  primary,
  contactStepMessage,
  formattedAddress,
}: {
  tone: "amber" | "red";
  title: string;
  primary: string;
  contactStepMessage: string;
  formattedAddress: string;
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`rounded-lg border p-5 text-sm ${cls}`}>
      <div className="text-xs uppercase tracking-wide font-semibold">{title}</div>
      <div className="text-sm font-medium mt-1 break-all">
        {formattedAddress}
      </div>
      <p className="mt-3">{primary}</p>
      <p className="mt-3 text-xs italic">{contactStepMessage}</p>
    </div>
  );
}

function QuoteResultCard({
  context,
  formattedAddress,
  quote,
}: {
  context: CustomerQuotePageContext;
  formattedAddress: string;
  quote: QuoteOutput;
}) {
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const [ctaMessage, setCtaMessage] = useState<string | null>(null);

  const interiorAddOn = quote.add_ons[0];

  const selectedTotal = useMemo(
    () =>
      computeSelectedTotal({
        selectedOptionKey: selection.selectedOptionKey,
        interiorAddOnSelected: selection.interiorAddOnSelected,
        options: quote.options,
        interiorAddOn,
      }),
    [selection, quote.options, interiorAddOn],
  );

  // Reset selection if the quote changes (e.g., user picked a new address).
  useEffect(() => {
    setSelection(INITIAL_SELECTION);
    setCtaMessage(null);
  }, [quote]);

  function pickOption(key: OptionKey) {
    setSelection((prev) => ({ ...prev, selectedOptionKey: key }));
    setCtaMessage(null);
  }

  function toggleInterior() {
    setSelection((prev) => ({
      ...prev,
      interiorAddOnSelected: !prev.interiorAddOnSelected,
    }));
  }

  function handleScheduleClick() {
    setCtaMessage("Contact step will be added next.");
  }

  return (
    <div className="rounded-lg border bg-white p-5 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Quote for
        </div>
        <div className="font-medium mt-1 break-all">{formattedAddress}</div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quote.options.map((option) => (
          <OptionCard
            key={option.option_key}
            option={option}
            selected={selection.selectedOptionKey === option.option_key}
            onSelect={() => pickOption(option.option_key)}
          />
        ))}
      </ul>

      {interiorAddOn && (
        <label className="flex items-start gap-3 rounded border bg-gray-50 p-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selection.interiorAddOnSelected}
            onChange={toggleInterior}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{interiorAddOn.display_label}</span>
            <span className="block text-xs text-gray-600 mt-0.5">
              Optional — only applies to this cleaning.
            </span>
          </span>
        </label>
      )}

      <p className="text-xs text-gray-700">
        ✓ Free screen cleaning included with every visit.
      </p>

      <div className="rounded border bg-gray-50 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          First cleaning total
        </div>
        <div className="text-2xl font-semibold mt-1">
          {selectedTotal !== null ? `$${selectedTotal}` : "Pick an option"}
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {context.copy.customer_quote_scheduling_copy}
        </p>
      </div>

      <button
        type="button"
        onClick={handleScheduleClick}
        disabled={!canSchedule(selection)}
        className="w-full rounded-lg bg-black text-white py-3 text-sm font-medium disabled:opacity-40"
      >
        Schedule My Cleaning
      </button>

      {ctaMessage && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          {ctaMessage}
        </div>
      )}

      {quote.warnings.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5">
          {quote.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: QuoteOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full text-left rounded-lg border p-4 transition ${
          selected
            ? "border-black ring-2 ring-black/10 bg-white"
            : "border-gray-200 bg-white hover:border-gray-400"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{option.display_label}</span>
          {option.is_recommended && (
            <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
              Recommended
            </span>
          )}
        </div>
        <div className="mt-2 text-xl font-semibold">{option.price_label}</div>
      </button>
    </li>
  );
}

function TrustSection({ points }: { points: string[] }) {
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-base font-medium text-gray-900">
        What you get
      </h2>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <span aria-hidden="true" className="text-green-600">✓</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SecondaryContact({ context }: { context: CustomerQuotePageContext }) {
  const phone = context.business.phone;
  return (
    <section className="text-sm text-gray-700 text-center">
      <p>
        {context.copy.customer_quote_phone_secondary}
        {phone ? (
          <>
            {" "}
            <a
              href={`tel:${phone}`}
              className="font-medium text-black underline"
            >
              {phone}
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
