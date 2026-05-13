"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAutocomplete,
  type SelectedPlace,
} from "@/components/google-autocomplete";
// IMPORTANT: import from specific files, not the plugin barrel
// (`@/plugins/customer-quote-sales-page`), because that barrel re-exports
// server-only modules. Pulling the barrel into a Client Component would
// trigger Next.js' "server-only" build guard.
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
import {
  validateContactForm,
  type SubmitContactResult,
  type SubmitContactSuccess,
} from "@/plugins/customer-quote-sales-page/submit-mapping";
import type {
  OptionKey,
  QuoteAddOn,
  QuoteOption,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote/types";
import {
  lookupAddressForQuoteAction,
  submitContactForQuoteAction,
} from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "looking_up"; place: SelectedPlace }
  | { kind: "result"; place: SelectedPlace; result: AddressLookupResult }
  | {
      kind: "confirmed";
      place: SelectedPlace;
      success: SubmitContactSuccess;
    };

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

  const handleConfirmed = useCallback(
    (place: SelectedPlace, success: SubmitContactSuccess) => {
      setState({ kind: "confirmed", place, success });
    },
    [],
  );

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
        <ResultArea
          context={context}
          place={state.place}
          result={state.result}
          onConfirmed={handleConfirmed}
        />
      )}

      {state.kind === "confirmed" && (
        <ConfirmationPanel context={context} success={state.success} />
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
  onConfirmed,
}: {
  context: CustomerQuotePageContext;
  place: SelectedPlace;
  result: AddressLookupResult;
  onConfirmed: (place: SelectedPlace, success: SubmitContactSuccess) => void;
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
  const formattedAddress = data.formattedAddress || place.formattedAddress;

  if (data.kind === "out_of_area") {
    return (
      <FallbackWithContactForm
        context={context}
        kind="out_of_area"
        place={place}
        interactionId={data.interactionId}
        formattedAddress={formattedAddress}
        title="Out of service area"
        primary={context.copy.fallback_out_of_service_area}
        contactStepMessage={data.contactStepMessage}
        onConfirmed={onConfirmed}
      />
    );
  }

  if (data.kind === "property_data_missing") {
    return (
      <FallbackWithContactForm
        context={context}
        kind="property_data_missing"
        place={place}
        interactionId={data.interactionId}
        formattedAddress={formattedAddress}
        title="Property details unavailable"
        primary={context.copy.fallback_property_data_missing}
        contactStepMessage={data.contactStepMessage}
        onConfirmed={onConfirmed}
      />
    );
  }

  return (
    <QuoteResultCard
      context={context}
      place={place}
      interactionId={data.interactionId}
      formattedAddress={formattedAddress}
      quote={data.quotePreview}
      onConfirmed={onConfirmed}
    />
  );
}

// -------------------------------------------------------------------------
// Contact form (used both inline below the quote cards and as the
// fallback path for property_data_missing / out_of_area).
// -------------------------------------------------------------------------

type ContactFormProps = {
  submitLabel: string;
  busy: boolean;
  errorMessage: string | null;
  onSubmit: (input: { fullName: string; phone: string; email: string }) => void;
};

function ContactForm({
  submitLabel,
  busy,
  errorMessage,
  onSubmit,
}: ContactFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateContactForm({ fullName, phone, email });
    if (!v.ok) {
      setLocalError(v.error.message);
      return;
    }
    setLocalError(null);
    onSubmit(v.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-4" noValidate>
      <div>
        <label className="text-xs text-gray-600" htmlFor="cf-name">
          Full name
        </label>
        <input
          id="cf-name"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-gray-50"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600" htmlFor="cf-phone">
            Phone
          </label>
          <input
            id="cf-phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600" htmlFor="cf-email">
            Email
          </label>
          <input
            id="cf-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-gray-50"
          />
        </div>
      </div>

      {(localError || errorMessage) && (
        <p className="text-xs text-red-600">{localError ?? errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-black text-white py-3 text-sm font-medium disabled:opacity-40"
      >
        {busy ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}

// -------------------------------------------------------------------------
// Fallback card variants (property_data_missing / out_of_area). In C3
// they reveal the contact form inline beneath the explanation.
// -------------------------------------------------------------------------

function FallbackWithContactForm({
  context,
  kind,
  place,
  interactionId,
  formattedAddress,
  title,
  primary,
  contactStepMessage,
  onConfirmed,
}: {
  context: CustomerQuotePageContext;
  kind: "property_data_missing" | "out_of_area";
  place: SelectedPlace;
  interactionId: string;
  formattedAddress: string;
  title: string;
  primary: string;
  contactStepMessage: string;
  onConfirmed: (place: SelectedPlace, success: SubmitContactSuccess) => void;
}) {
  const [formOpen, setFormOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(input: {
    fullName: string;
    phone: string;
    email: string;
  }) {
    setBusy(true);
    setErrorMessage(null);
    let result: SubmitContactResult;
    try {
      result = await submitContactForQuoteAction({
        interactionId,
        contact: input,
        selection: {
          selectedOptionKey: null,
          interiorAddOnSelected: false,
          selectedTotal: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        ok: false,
        error: {
          code: "INTERNAL",
          message: `Could not reach the submission service: ${message}`,
        },
      };
    }
    setBusy(false);
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    setFormOpen(false);
    onConfirmed(place, result.data);
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <div className="text-xs uppercase tracking-wide font-semibold">{title}</div>
      <div className="text-sm font-medium mt-1 break-all text-gray-900">
        {formattedAddress}
      </div>
      <p className="mt-3">{primary}</p>
      <p className="mt-3 text-xs italic">{contactStepMessage}</p>

      {formOpen && (
        <div className="mt-4 rounded bg-white border border-amber-200 p-4">
          <ContactForm
            submitLabel={
              kind === "out_of_area"
                ? "Send Address for Review"
                : "Request My Quote"
            }
            busy={busy}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
          />
          <p className="mt-2 text-[11px] text-gray-500">
            We&rsquo;ll only use this to follow up.{" "}
            {context.business.phone
              ? `Prefer to talk? Call ${context.business.phone}.`
              : null}
          </p>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Quote result card with selection + inline contact form on CTA click.
// -------------------------------------------------------------------------

function QuoteResultCard({
  context,
  place,
  interactionId,
  formattedAddress,
  quote,
  onConfirmed,
}: {
  context: CustomerQuotePageContext;
  place: SelectedPlace;
  interactionId: string;
  formattedAddress: string;
  quote: QuoteOutput;
  onConfirmed: (place: SelectedPlace, success: SubmitContactSuccess) => void;
}) {
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    setContactOpen(false);
    setErrorMessage(null);
  }, [quote]);

  function pickOption(key: OptionKey) {
    setSelection((prev) => ({ ...prev, selectedOptionKey: key }));
  }

  function toggleInterior() {
    setSelection((prev) => ({
      ...prev,
      interiorAddOnSelected: !prev.interiorAddOnSelected,
    }));
  }

  function handleScheduleClick() {
    if (!canSchedule(selection)) return;
    setContactOpen(true);
    setErrorMessage(null);
  }

  async function handleSubmit(input: {
    fullName: string;
    phone: string;
    email: string;
  }) {
    setBusy(true);
    setErrorMessage(null);
    let result: SubmitContactResult;
    try {
      result = await submitContactForQuoteAction({
        interactionId,
        contact: input,
        selection: {
          selectedOptionKey: selection.selectedOptionKey,
          interiorAddOnSelected: selection.interiorAddOnSelected,
          selectedTotal,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        ok: false,
        error: {
          code: "INTERNAL",
          message: `Could not reach the submission service: ${message}`,
        },
      };
    }
    setBusy(false);
    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }
    onConfirmed(place, result.data);
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
            disabled={contactOpen}
          />
        ))}
      </ul>

      {interiorAddOn && (
        <label className="flex items-start gap-3 rounded border bg-gray-50 p-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={selection.interiorAddOnSelected}
            onChange={toggleInterior}
            disabled={contactOpen}
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

      {!contactOpen && (
        <button
          type="button"
          onClick={handleScheduleClick}
          disabled={!canSchedule(selection)}
          className="w-full rounded-lg bg-black text-white py-3 text-sm font-medium disabled:opacity-40"
        >
          Schedule My Cleaning
        </button>
      )}

      {contactOpen && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-900">
            Send your scheduling request
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            We&rsquo;ll follow up to confirm a time that works for you.
          </p>
          <ContactForm
            submitLabel="Request Scheduling"
            busy={busy}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
          />
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
  disabled,
}: {
  option: QuoteOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        disabled={disabled}
        className={`w-full text-left rounded-lg border p-4 transition ${
          selected
            ? "border-black ring-2 ring-black/10 bg-white"
            : "border-gray-200 bg-white hover:border-gray-400"
        } disabled:opacity-60`}
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

// -------------------------------------------------------------------------
// Confirmation panel — shown after a successful submission.
// -------------------------------------------------------------------------

function ConfirmationPanel({
  context,
  success,
}: {
  context: CustomerQuotePageContext;
  success: SubmitContactSuccess;
}) {
  const phone = context.business.phone;
  const isQuote = success.kind === "quote_generated";

  return (
    <section className="rounded-lg border border-green-200 bg-green-50 p-5">
      <h2 className="text-base font-semibold text-green-900">Thanks!</h2>

      {isQuote ? (
        <>
          <p className="mt-2 text-sm text-green-900">
            We received your scheduling request for{" "}
            <span className="font-medium break-all">{success.formattedAddress}</span>
            .
          </p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-green-900">
            <Detail label="Selected option" value={success.selectedOptionKey ?? "—"} />
            <Detail
              label="Total"
              value={
                success.selectedTotal !== null
                  ? `$${success.selectedTotal}`
                  : "—"
              }
            />
          </dl>
          <p className="mt-3 text-sm text-green-900">
            This quote is valid for {success.quoteValidDays} days. Our team
            will follow up to confirm a time that works for you.
          </p>
        </>
      ) : success.kind === "property_data_missing" ? (
        <p className="mt-2 text-sm text-green-900">
          We&rsquo;ll prepare your quote and follow up soon at{" "}
          <span className="font-medium break-all">{success.formattedAddress}</span>
          .
        </p>
      ) : (
        <p className="mt-2 text-sm text-green-900">
          We&rsquo;ll review your address and let you know if we can help.
        </p>
      )}

      {phone && (
        <p className="mt-3 text-xs text-green-900">
          Need a faster answer?{" "}
          <a href={`tel:${phone}`} className="font-medium underline">
            Call {phone}
          </a>
          .
        </p>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-green-800/80">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function TrustSection({ points }: { points: string[] }) {
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-base font-medium text-gray-900">What you get</h2>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <span aria-hidden="true" className="text-green-600">
              ✓
            </span>
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
