"use client";

import { useCallback, useState } from "react";
import { GoogleAutocomplete, type SelectedPlace } from "@/components/google-autocomplete";
import type { NormalizedAddress, ServiceAreaMatch } from "@/core/geo";
import { lookupAddressAction, type LookupAddressResult } from "./actions";

type State =
  | { kind: "idle" }
  | { kind: "loading"; place: SelectedPlace }
  | { kind: "result"; place: SelectedPlace; result: LookupAddressResult };

export function GeoTestClient() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [autocompleteError, setAutocompleteError] = useState<string | null>(
    null,
  );

  const handleSelect = useCallback(async (place: SelectedPlace) => {
    setAutocompleteError(null);
    setState({ kind: "loading", place });
    const result = await lookupAddressAction(place.placeId);
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

      {state.kind === "result" && <ResultView state={state} />}
    </div>
  );
}

function ResultView({
  state,
}: {
  state: { kind: "result"; place: SelectedPlace; result: LookupAddressResult };
}) {
  const { place, result } = state;

  return (
    <div className="space-y-5">
      <div className="rounded border bg-white p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Selected
        </div>
        <div className="font-medium mt-1">{place.formattedAddress}</div>
        <div className="text-xs text-gray-500 font-mono mt-1 break-all">
          {place.placeId}
        </div>
      </div>

      {!result.ok ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm">
          <div className="text-xs uppercase tracking-wide text-red-700 font-semibold">
            Error · {result.error.code}
          </div>
          <p className="mt-1 text-red-900">{result.error.message}</p>
        </div>
      ) : (
        <>
          <NormalizedAddressCard data={result.data.normalized} />
          <ServiceAreaCard data={result.data.serviceArea} />
        </>
      )}
    </div>
  );
}

function NormalizedAddressCard({ data }: { data: NormalizedAddress }) {
  return (
    <div className="rounded border bg-white p-4 text-sm space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Normalized address
        </div>
        <div className="font-medium mt-1 break-all">
          {data.formatted_address}
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Field label="address_line_1" value={data.address_line_1} />
        <Field label="address_line_2" value={data.address_line_2 ?? "—"} />
        <Field label="city" value={data.city} />
        <Field label="state" value={data.state} />
        <Field label="postal_code" value={data.postal_code ?? "—"} />
        <Field label="country" value={data.country} />
        <Field
          label="latitude"
          value={data.latitude !== null ? data.latitude.toFixed(6) : "—"}
        />
        <Field
          label="longitude"
          value={data.longitude !== null ? data.longitude.toFixed(6) : "—"}
        />
        <Field
          label="google_place_id"
          value={data.google_place_id}
          fullSpan
          mono
        />
      </dl>
      <details className="text-xs">
        <summary className="text-gray-600 cursor-pointer">
          safe raw_google_response
        </summary>
        <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-x-auto">
          {JSON.stringify(data.raw_google_response, null, 2)}
        </pre>
      </details>
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
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Field label="normalized_city" value={data.normalizedCity} />
        <Field
          label="service_area_id"
          value={data.serviceAreaId ?? "—"}
          mono
        />
        {data.reason && (
          <Field label="reason" value={data.reason} fullSpan />
        )}
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  fullSpan,
  mono,
}: {
  label: string;
  value: string;
  fullSpan?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={fullSpan ? "sm:col-span-2" : ""}>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium break-all ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
