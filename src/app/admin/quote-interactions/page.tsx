import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  interaction_status: string;
  service_area_status: string;
  property_data_status: string;
  normalized_city: string | null;
  google_place_id: string | null;
  selected_option_key: string | null;
  selected_total: number | null;
  converted_lead_id: string | null;
  converted_quote_id: string | null;
  quote_preview_data: {
    price_snapshot?: {
      options?: Record<string, number>;
      add_ons?: Record<string, number>;
    };
  } | null;
  normalized_address: {
    formatted_address?: string;
  } | null;
  address_input: string | null;
};

export default async function QuoteInteractionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("quote_page_interactions")
    .select(
      "id, created_at, interaction_status, service_area_status, property_data_status, normalized_city, google_place_id, selected_option_key, selected_total, converted_lead_id, converted_quote_id, quote_preview_data, normalized_address, address_input",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as Row[];

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Quote interactions</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE} anonymous /q lookups
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Read-only. C2 writes one row per address lookup; C3 will mark
          rows converted when the contact form lands.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load interactions: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">
          No interactions yet. Visit{" "}
          <Link href="/q" className="underline">
            /q
          </Link>{" "}
          and select an address to create one.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <InteractionRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function InteractionRow({ row }: { row: Row }) {
  const address =
    row.normalized_address?.formatted_address ?? row.address_input ?? "—";
  const previewOptions = row.quote_preview_data?.price_snapshot?.options;
  const previewInterior =
    row.quote_preview_data?.price_snapshot?.add_ons?.interior_window_cleaning;

  const converted = Boolean(row.converted_lead_id || row.converted_quote_id);

  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium break-all">{address}</div>
          <div className="text-xs text-gray-500 font-mono mt-0.5">
            {row.normalized_city ?? "—"}
            {row.google_place_id ? ` · ${row.google_place_id}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
          <StatusBadge status={row.interaction_status} />
          <span className="text-gray-500">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <Field label="service area" value={row.service_area_status} />
        <Field label="property data" value={row.property_data_status} />
        <Field
          label="selected option"
          value={row.selected_option_key ?? "—"}
        />
        <Field
          label="selected total"
          value={row.selected_total !== null ? `$${row.selected_total}` : "—"}
        />
        <Field
          label="converted"
          value={converted ? "yes" : "no"}
        />
        {previewOptions && (
          <Field
            label="preview prices"
            value={`one $${previewOptions.one_time ?? "—"} · 6mo $${previewOptions.six_month ?? "—"} · 3mo $${previewOptions.three_month ?? "—"}${
              previewInterior !== undefined
                ? ` · int +$${previewInterior}`
                : ""
            }`}
          />
        )}
      </dl>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "quote_generated"
      ? "bg-green-100 text-green-800"
      : status === "out_of_area"
        ? "bg-amber-100 text-amber-900"
        : status === "property_data_missing"
          ? "bg-amber-100 text-amber-900"
          : status === "contact_submitted" || status === "converted"
            ? "bg-blue-100 text-blue-900"
            : status === "error"
              ? "bg-red-100 text-red-900"
              : "bg-gray-100 text-gray-800";
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wide ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
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
