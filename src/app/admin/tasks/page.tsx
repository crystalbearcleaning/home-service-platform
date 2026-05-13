import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  status: string;
  task_category: string;
  priority: string;
  related_object_type: string | null;
  related_object_id: string | null;
  source_plugin_key: string | null;
};

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, created_at, title, description, status, task_category, priority, related_object_type, related_object_id, source_plugin_key",
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
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · most recent {PAGE_SIZE} admin tasks (read-only)
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-600">
          Failed to load tasks: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">
          No tasks yet. Tasks are created when a /q submission lands.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <TaskRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TaskRow({ row }: { row: Row }) {
  return (
    <div className="rounded border bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{row.title}</div>
          {row.description && (
            <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap font-sans">
              {row.description}
            </pre>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
          <CategoryBadge category={row.task_category} />
          <StatusBadge status={row.status} />
          <span className="text-gray-500">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-500 font-mono">
        task {row.id.slice(0, 8)}…
        {row.related_object_type && row.related_object_id
          ? ` · ${row.related_object_type} ${row.related_object_id.slice(0, 8)}…`
          : ""}
        {row.source_plugin_key ? ` · ${row.source_plugin_key}` : ""}
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const tone =
    category === "schedule_request"
      ? "bg-green-100 text-green-800"
      : category === "manual_quote"
        ? "bg-amber-100 text-amber-900"
        : category === "service_area_review"
          ? "bg-amber-100 text-amber-900"
          : "bg-gray-100 text-gray-800";
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wide ${tone}`}
    >
      {category.replace(/_/g, " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wide bg-gray-100 text-gray-800">
      {status}
    </span>
  );
}
