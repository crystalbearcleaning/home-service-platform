import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  resolveAdminShellContext,
  type StatusTone,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

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

  const shell = resolveAdminShellContext({
    workspaceName: business.name,
    userEmail: user.email ?? "—",
  });

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
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Business Records"
        title="Tasks"
        description={`Admin follow-up and system tasks. Each /q submission creates one (schedule, manual quote, or area review). Read-only. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load tasks: {error.message}
          </p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Each /q submission creates a task here — schedule follow-up, manual quote, or area review."
        />
      ) : (
        <SectionCard padding="none">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="p-4">
                <TaskRow row={row} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </AdminShell>
  );
}

function categoryTone(category: string): StatusTone {
  switch (category) {
    case "schedule_request":
      return "success";
    case "manual_quote":
    case "service_area_review":
      return "warning";
    default:
      return "default";
  }
}

function TaskRow({ row }: { row: Row }) {
  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{row.title}</div>
          {row.description && (
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-ink-muted">
              {row.description}
            </pre>
          )}
          <div className="mt-2 font-mono text-[11px] text-ink-faint">
            task {row.id.slice(0, 8)}…
            {row.related_object_type && row.related_object_id
              ? ` · ${row.related_object_type} ${row.related_object_id.slice(0, 8)}…`
              : ""}
            {row.source_plugin_key ? ` · ${row.source_plugin_key}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-xs">
          <StatusBadge tone={categoryTone(row.task_category)}>
            {row.task_category.replace(/_/g, " ")}
          </StatusBadge>
          <StatusBadge tone="default">{row.status}</StatusBadge>
          <span className="text-ink-faint">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
