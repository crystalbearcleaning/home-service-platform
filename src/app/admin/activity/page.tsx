import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type ActivityRow = {
  id: string;
  created_at: string;
  actor_type: string;
  source_plugin_key: string | null;
  activity_type: string;
  summary: string;
  related_object_type: string | null;
  related_object_id: string | null;
  event_id: string | null;
};

export default async function AdminActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, created_at, actor_type, source_plugin_key, activity_type, summary, related_object_type, related_object_id, event_id",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const activities = (data ?? []) as ActivityRow[];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE}
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load activities: {error.message}
        </p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-700">
          No activities yet. They will appear here as core actions and the
          (future) quote flow log them.
        </p>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {activities.map((row) => (
            <li
              key={row.id}
              className="p-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <div className="font-medium">{row.summary}</div>
                <div className="text-xs text-gray-500 mt-0.5 font-mono">
                  {row.activity_type} · {row.actor_type}
                  {row.source_plugin_key
                    ? ` · ${row.source_plugin_key}`
                    : ""}
                  {row.related_object_type
                    ? ` · ${row.related_object_type}`
                    : ""}
                </div>
              </div>
              <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                {new Date(row.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
