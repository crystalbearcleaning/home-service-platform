import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  status: string;
  customer_intent: string;
  source: string | null;
  contact_id: string;
  property_id: string;
  quote_page_interaction_id: string | null;
  contacts: { full_name: string; phone: string; email: string } | null;
  properties: { formatted_address: string; city: string } | null;
};

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, created_at, status, customer_intent, source, contact_id, property_id, quote_page_interaction_id, contacts(full_name, phone, email), properties(formatted_address, city)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE} leads from /q submissions
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load leads: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">
          No leads yet. Submit a contact form at{" "}
          <Link href="/q" className="underline">
            /q
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <LeadRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function LeadRow({ row }: { row: Row }) {
  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {row.contacts?.full_name ?? "—"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {row.contacts?.email ?? "—"} · {row.contacts?.phone ?? "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1 break-all">
            {row.properties?.formatted_address ?? "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
          <StatusBadge status={row.status} />
          <span className="text-gray-500">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-gray-500 font-mono">
        lead {row.id.slice(0, 8)}… · contact {row.contact_id.slice(0, 8)}…
        {row.quote_page_interaction_id
          ? ` · interaction ${row.quote_page_interaction_id.slice(0, 8)}…`
          : ""}
        {row.source ? ` · ${row.source}` : ""}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "scheduling_requested"
      ? "bg-green-100 text-green-800"
      : status === "needs_manual_quote"
        ? "bg-amber-100 text-amber-900"
        : status === "service_area_review_needed"
          ? "bg-amber-100 text-amber-900"
          : "bg-gray-100 text-gray-800";
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wide ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
