import Link from "next/link";
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
import {
  filterTasks,
  TASK_CATEGORY_VALUES,
  TASK_STATUS_VALUES,
} from "@/core/tasks/admin-filter";
import { SignOutButton } from "../sign-out-button";
import { TasksFilterClient } from "./tasks-filter-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

type PageProps = {
  searchParams?: Promise<{ status?: string; category?: string }>;
};

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

export default async function TasksPage({ searchParams }: PageProps) {
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

  const allRows = (data ?? []) as Row[];
  const params = (await searchParams) ?? {};
  const statusFilter = (params.status ?? "").trim();
  const categoryFilter = (params.category ?? "").trim();

  const filteredRows = filterTasks(
    allRows.map((r) => ({ ...r, taskCategory: r.task_category })),
    { status: statusFilter, category: categoryFilter },
  );

  // Batched lead→contact lookup so each lead-related task row can link
  // to its customer. Tasks tie to leads via the soft reference
  // (related_object_type='lead' AND related_object_id=lead.id), which
  // isn't a true FK PostgREST can join on — so we do one extra query
  // (scoped to the filtered rows only).
  const leadIds = Array.from(
    new Set(
      filteredRows
        .filter((r) => r.related_object_type === "lead" && r.related_object_id)
        .map((r) => r.related_object_id as string),
    ),
  );
  const contactByLead = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id,contact_id")
      .eq("business_id", business.id)
      .in("id", leadIds);
    for (const l of leadRows ?? []) {
      contactByLead.set(l.id, l.contact_id);
    }
  }

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description={`Admin follow-up and system tasks. Each /q submission creates one (schedule, manual quote, or area review). Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load tasks: {error.message}
          </p>
        </SectionCard>
      ) : allRows.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Each /q submission creates a task here — schedule follow-up, manual quote, or area review."
        />
      ) : (
        <>
          <SectionCard>
            <TasksFilterClient
              initialStatus={statusFilter}
              initialCategory={categoryFilter}
              statusOptions={[...TASK_STATUS_VALUES]}
              categoryOptions={[...TASK_CATEGORY_VALUES]}
              showingCount={filteredRows.length}
              totalCount={allRows.length}
            />
          </SectionCard>
          <div className="mt-4">
            {filteredRows.length === 0 ? (
              <SectionCard>
                <p className="text-xs text-ink-muted">
                  No tasks match the current filter.
                </p>
              </SectionCard>
            ) : (
              <SectionCard padding="none">
                <ul className="divide-y divide-line">
                  {filteredRows.map((row) => {
                    const contactId =
                      row.related_object_type === "lead" && row.related_object_id
                        ? (contactByLead.get(row.related_object_id) ?? null)
                        : null;
                    return (
                      <li key={row.id} className="p-4">
                        <TaskRow row={row} contactId={contactId} />
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            )}
          </div>
        </>
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

function TaskRow({
  row,
  contactId,
}: {
  row: Row;
  contactId: string | null;
}) {
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {contactId && (
              <Link
                href={`/admin/contacts/${contactId}`}
                className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Customer →
              </Link>
            )}
            {row.related_object_type === "lead" && row.related_object_id && (
              <Link
                href={`/admin/leads/${row.related_object_id}`}
                className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Lead →
              </Link>
            )}
            <span className="font-mono text-ink-faint">
              task {row.id.slice(0, 8)}…
              {row.source_plugin_key ? ` · ${row.source_plugin_key}` : ""}
            </span>
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
