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
import type { NormalizedPropertyData } from "@/core/property-data";
import {
  lookupPropertyAction,
  type PropertyTestPropertyState,
  type PropertyTestResult,
} from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "loading"; place: SelectedPlace }
  | { kind: "result"; place: SelectedPlace; result: PropertyTestResult };

export function PropertyDataTestClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [autocompleteError, setAutocompleteError] = useState<string | null>(
    null,
  );

  const handleSelect = useCallback(async (place: SelectedPlace) => {
    setAutocompleteError(null);
    setState({ kind: "loading", place });
    const result = await lookupPropertyAction(place.placeId);
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
          Looking up <code>{state.place.formattedAddress}</code>…
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
  result: PropertyTestResult;
}) {
  return (
    <div className="space-y-5">
      <SelectedCard place={place} />

      {!result.ok ? (
        <ErrorCard code={result.error.code} message={result.error.message} />
      ) : (
        <>
          <NormalizedAddressCard data={result.data.normalized} />
          <ServiceAreaCard data={result.data.serviceArea} />
          <PropertyCard state={result.data.property} />
        </>
      )}
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

function PropertyCard({ state }: { state: PropertyTestPropertyState }) {
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

  return <PropertyOkCard data={state.data} />;
}

function PropertyOkCard({ data }: { data: NormalizedPropertyData }) {
  const isFound = data.property_data_status === "found";
  return (
    <div
      className={`rounded border p-4 text-sm space-y-3 ${
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
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${
              isFound
                ? "bg-green-200 text-green-900"
                : "bg-amber-200 text-amber-900"
            }`}
          >
            {data.property_data_status}
          </span>
          <span className="text-xs text-gray-600 font-mono">
            confidence: {data.data_confidence}
          </span>
        </div>
      </div>

      {!isFound && (
        <p className="text-xs text-amber-900 bg-amber-100 rounded p-2">
          In the future quote flow this triggers the manual-quote fallback:
          we&rsquo;ll ask the customer to leave contact info and queue an
          admin task to prepare a quote.
        </p>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        <Field
          label="property_type"
          value={data.property_type ?? "—"}
        />
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
          label="provider_property_id"
          value={data.provider_property_id ?? "—"}
          mono
        />
      </dl>

      <details className="text-xs">
        <summary className="text-gray-700 cursor-pointer">
          safe provider_snapshot
        </summary>
        <pre className="mt-1 text-xs bg-white/60 rounded p-2 overflow-x-auto">
          {JSON.stringify(data.provider_snapshot, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ErrorCard({ code, message }: { code: string; message: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
      <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
        Error · {code}
      </div>
      <p className="mt-1 text-red-900 whitespace-pre-wrap">{message}</p>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium break-all ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
