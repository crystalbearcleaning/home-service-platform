import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

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

  const shell = resolveAdminShellContext({
    workspaceName: business.name,
    userEmail: user.email ?? "—",
  });

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
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Observability"
        title="Activity"
        description={`Human-readable history of submissions, lead creations, and plugin actions. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load activities: {error.message}
          </p>
        </SectionCard>
      ) : activities.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Activity rolls in as the quote flow runs and plugins log what they do."
        />
      ) : (
        <SectionCard padding="none">
          <ul className="divide-y divide-line">
            {activities.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{row.summary}</div>
                  <div className="mt-0.5 font-mono text-xs text-ink-faint">
                    {row.activity_type} · {row.actor_type}
                    {row.source_plugin_key
                      ? ` · ${row.source_plugin_key}`
                      : ""}
                    {row.related_object_type
                      ? ` · ${row.related_object_type}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap font-mono text-xs text-ink-faint">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </AdminShell>
  );
}
