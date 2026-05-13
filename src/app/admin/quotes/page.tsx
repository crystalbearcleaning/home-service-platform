import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  expires_at: string;
  status: string;
  selected_option_key: string | null;
  selected_total: number | null;
  source_plugin_version: string;
  lead_id: string;
  contact_id: string;
  property_id: string;
  contacts: { full_name: string; email: string } | null;
  properties: { formatted_address: string } | null;
};

export default async function QuotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, created_at, expires_at, status, selected_option_key, selected_total, source_plugin_version, lead_id, contact_id, property_id, contacts(full_name, email), properties(formatted_address)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE} immutable quote snapshots
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load quotes: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">
          No quotes yet. Quotes are created when a customer with an instant
          quote submits the scheduling request.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const expired = new Date(row.expires_at).getTime() < now;
            return (
              <li key={row.id}>
                <QuoteRow row={row} expired={expired} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function QuoteRow({ row, expired }: { row: Row; expired: boolean }) {
  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{row.contacts?.full_name ?? "—"}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {row.contacts?.email ?? "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1 break-all">
            {row.properties?.formatted_address ?? "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
          <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wide bg-blue-100 text-blue-900">
            {row.status}
          </span>
          {expired && (
            <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wide bg-red-100 text-red-900">
              expired
            </span>
          )}
          <span className="text-gray-500">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <Field label="option" value={row.selected_option_key ?? "—"} />
        <Field
          label="total"
          value={row.selected_total !== null ? `$${row.selected_total}` : "—"}
        />
        <Field
          label="expires"
          value={new Date(row.expires_at).toLocaleDateString()}
        />
        <Field label="plugin version" value={row.source_plugin_version} />
      </dl>

      <div className="mt-2 text-[11px] text-gray-500 font-mono">
        quote {row.id.slice(0, 8)}… · lead {row.lead_id.slice(0, 8)}…
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
  );
}
