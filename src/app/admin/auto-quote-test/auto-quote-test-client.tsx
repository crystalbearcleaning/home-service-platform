"use client";

import { useCallback, useState } from "react";
import {
  GoogleAutocomplete,
  type SelectedPlace,
} from "@/components/google-autocomplete";
import type {
  NormalizedAddress,
  ServiceAreaMatch,
} from "@/core/geo";
import type {
  QuoteAddOn,
  QuoteOption,
  QuoteOutput,
} from "@/plugins/window-cleaning-auto-quote";
import {
  calculateAutoQuoteAction,
  type AutoQuotePropertyState,
  type AutoQuoteQuoteState,
  type AutoQuoteTestResult,
} from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "loading"; place: SelectedPlace }
  | { kind: "result"; place: SelectedPlace; result: AutoQuoteTestResult };

export function AutoQuoteTestClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [autocompleteError, setAutocompleteError] = useState<string | null>(
    null,
  );

  const handleSelect = useCallback(async (place: SelectedPlace) => {
    setAutocompleteError(null);
    setState({ kind: "loading", place });
    const result = await calculateAutoQuoteAction(place.placeId);
    setState({ kind: "result", place, result });
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <label className="block text-xs uppercase tracking-wide text-gray-600 mb-1">
          Address
        </label>
        <GoogleAutocomplete
          onSelect={handleSelect}
          onSelectError={setAutocompleteError}
          disabled={state.kind === "loading"}
        />
        {autocompleteError && (
          <p className="text-xs text-red-600 mt-1">{autocompleteError}</p>
        )}
      </section>

      {state.kind === "loading" && (
        <p className="text-sm text-gray-600">
          Calculating quote for <code>{state.place.formattedAddress}</code>…
        </p>
      )}

      {state.kind === "result" && (
        <ResultView place={state.place} result={state.result} />
      )}
    </div>
  );
}

function ResultView({
  place,
  result,
}: {
  place: SelectedPlace;
  result: AutoQuoteTestResult;
}) {
  if (!result.ok) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
          Error · {result.error.code}
        </div>
        <p className="mt-1 text-red-900 whitespace-pre-wrap">
          {result.error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SelectedCard place={place} />
      <NormalizedAddressCard data={result.data.normalized} />
      <ServiceAreaCard data={result.data.serviceArea} />
      <PropertyCard state={result.data.property} />
      <QuoteCard state={result.data.quote} />
    </div>
  );
}

function SelectedCard({ place }: { place: SelectedPlace }) {
  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        Selected
      </div>
      <div className="font-medium mt-1">{place.formattedAddress}</div>
      <div className="text-xs text-gray-500 font-mono mt-1 break-all">
        {place.placeId}
      </div>
    </div>
  );
}

function NormalizedAddressCard({ data }: { data: NormalizedAddress }) {
  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        Normalized address
      </div>
      <div className="font-medium mt-1 break-all">{data.formatted_address}</div>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Field label="city" value={data.city} />
        <Field label="state" value={data.state} />
        <Field label="postal_code" value={data.postal_code ?? "—"} />
        <Field label="country" value={data.country} />
      </dl>
    </div>
  );
}

function ServiceAreaCard({ data }: { data: ServiceAreaMatch }) {
  return (
    <div
      className={`rounded border p-4 text-sm ${
        data.inArea
          ? "border-green-200 bg-green-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-700">
            Service area
          </div>
          <div className="font-medium mt-1">
            {data.inArea
              ? `In area: ${data.serviceAreaName}`
              : "Out of area"}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${
            data.inArea
              ? "bg-green-200 text-green-900"
              : "bg-amber-200 text-amber-900"
          }`}
        >
          {data.inArea ? "in_area" : "out_of_area"}
        </span>
      </div>
      {data.reason && (
        <p className="mt-2 text-xs text-gray-700">{data.reason}</p>
      )}
    </div>
  );
}

function PropertyCard({ state }: { state: AutoQuotePropertyState }) {
  if (state.state === "skipped") {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-amber-900 font-semibold">
          RentCast skipped
        </div>
        <p className="mt-1 text-amber-900">{state.reason}</p>
      </div>
    );
  }
  if (state.state === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
          Property data error · {state.error.code}
        </div>
        <p className="mt-1 text-red-900">{state.error.message}</p>
      </div>
    );
  }
  const data = state.data;
  const isFound = data.property_data_status === "found";
  return (
    <div
      className={`rounded border p-4 text-sm ${
        isFound
          ? "border-green-200 bg-green-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-700">
            Property data ({data.data_source})
          </div>
          <div className="font-medium mt-1">
            {data.square_footage !== null
              ? `${data.square_footage.toLocaleString()} sq ft`
              : "Square footage missing"}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${
            isFound
              ? "bg-green-200 text-green-900"
              : "bg-amber-200 text-amber-900"
          }`}
        >
          {data.property_data_status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        <Field label="property_type" value={data.property_type ?? "—"} />
        <Field
          label="bedrooms"
          value={data.bedrooms !== null ? String(data.bedrooms) : "—"}
        />
        <Field
          label="bathrooms"
          value={data.bathrooms !== null ? String(data.bathrooms) : "—"}
        />
        <Field
          label="year_built"
          value={data.year_built !== null ? String(data.year_built) : "—"}
        />
        <Field
          label="lot_size_sqft"
          value={
            data.lot_size_sqft !== null
              ? data.lot_size_sqft.toLocaleString()
              : "—"
          }
        />
        <Field
          label="confidence"
          value={data.data_confidence}
        />
      </dl>
    </div>
  );
}

function QuoteCard({ state }: { state: AutoQuoteQuoteState }) {
  if (state.state === "skipped") {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-amber-900 font-semibold">
          Auto-Quote skipped
        </div>
        <p className="mt-1 text-amber-900">{state.reason}</p>
      </div>
    );
  }
  if (state.state === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
          Auto-Quote error · {state.error.code}
        </div>
        <p className="mt-1 text-red-900 whitespace-pre-wrap">
          {state.error.message}
        </p>
      </div>
    );
  }
  const data = state.data;
  if (data.manual_quote_required) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
        <div className="text-xs uppercase tracking-wide text-amber-900 font-semibold">
          Manual quote required
        </div>
        <p className="text-amber-900">
          {data.reason ?? "Auto-Quote could not produce instant pricing."}
        </p>
        <p className="text-xs text-amber-900">
          In the future quote flow this triggers the manual-quote fallback
          (collect contact info; queue an admin task to prepare a quote).
        </p>
      </div>
    );
  }
  return <QuoteOkCard data={data} />;
}

function QuoteOkCard({ data }: { data: QuoteOutput }) {
  return (
    <div className="rounded border border-green-200 bg-green-50 p-4 text-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-700">
            Auto-Quote · {data.source_plugin_key} v{data.source_plugin_version}
          </div>
          <div className="font-medium mt-1">
            {data.options.length} options · 1 add-on
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded uppercase tracking-wide bg-green-200 text-green-900">
          can_quote
        </span>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.options.map((option) => (
          <OptionCard key={option.option_key} option={option} />
        ))}
      </ul>

      <AddOnRow addOn={data.add_ons[0]} />

      {data.warnings.length > 0 && (
        <ul className="rounded bg-white/60 border border-amber-200 p-2 text-xs text-amber-900 space-y-1">
          {data.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}

      <details className="text-xs">
        <summary className="text-gray-700 cursor-pointer">
          calculation_snapshot
        </summary>
        <pre className="mt-1 text-xs bg-white/60 rounded p-2 overflow-x-auto">
          {JSON.stringify(data.calculation_snapshot, null, 2)}
        </pre>
      </details>

      <details className="text-xs">
        <summary className="text-gray-700 cursor-pointer">
          price_snapshot + line_items_snapshot
        </summary>
        <pre className="mt-1 text-xs bg-white/60 rounded p-2 overflow-x-auto">
          {JSON.stringify(
            {
              price_snapshot: data.price_snapshot,
              line_items_snapshot: data.line_items_snapshot,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function OptionCard({ option }: { option: QuoteOption }) {
  return (
    <li
      className={`rounded border bg-white p-3 ${
        option.is_recommended ? "border-green-400" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{option.display_label}</div>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {option.option_key}
          </div>
        </div>
        {option.is_recommended && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 uppercase tracking-wide">
            Recommended
          </span>
        )}
      </div>
      <div className="mt-2 text-lg font-semibold">{option.price_label}</div>
      <div className="text-[11px] text-gray-500 font-mono mt-1 break-all">
        plan: {option.service_plan_id}
      </div>
    </li>
  );
}

function AddOnRow({ addOn }: { addOn: QuoteAddOn | undefined }) {
  if (!addOn) return null;
  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        Add-on
      </div>
      <div className="font-medium mt-1">{addOn.display_label}</div>
      <div className="text-[11px] text-gray-500 font-mono mt-1 break-all">
        {addOn.service_code} · service: {addOn.service_id}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
  );
}
