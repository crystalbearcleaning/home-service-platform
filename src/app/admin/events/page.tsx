import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { summarizePhase1Event } from "@/core/events/summaries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  schema_version: number;
  source_type: string;
  source_key: string | null;
  related_object_type: string | null;
  related_object_id: string | null;
  payload: Record<string, unknown> | null;
};

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("events")
    .select(
      "id, created_at, event_type, schema_version, source_type, source_key, related_object_type, related_object_id, payload",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const events = (data ?? []) as EventRow[];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load events: {error.message}
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-700">
          No events yet. They will appear here once core actions or the
          (future) quote flow publish them.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((row) => (
            <li key={row.id} className="rounded border bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {summarizePhase1Event(row.event_type)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">
                    {row.event_type} v{row.schema_version} · {row.source_type}
                    {row.source_key ? ` (${row.source_key})` : ""}
                    {row.related_object_type
                      ? ` · ${row.related_object_type}`
                      : ""}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
              {row.payload && Object.keys(row.payload).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-600 cursor-pointer">
                    payload
                  </summary>
                  <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
