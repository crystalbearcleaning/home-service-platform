import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { summarizePhase1Event } from "@/core/events/summaries";
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

  const shell = resolveAdminShellContext({
    workspaceName: business.name,
    userEmail: user.email ?? "—",
  });

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
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Observability"
        title="Events"
        description={`Technical / system event log. Machine-readable counterpart to Activity. Most recent ${PAGE_SIZE}.`}
      />

      {error ? (
        <SectionCard>
          <p className="text-sm text-danger-strong">
            Failed to load events: {error.message}
          </p>
        </SectionCard>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Events stream in once the quote flow or core actions publish them."
        />
      ) : (
        <ul className="space-y-2">
          {events.map((row) => (
            <li key={row.id}>
              <SectionCard padding="tight">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">
                      {summarizePhase1Event(row.event_type)}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-ink-faint">
                      {row.event_type} v{row.schema_version} · {row.source_type}
                      {row.source_key ? ` (${row.source_key})` : ""}
                      {row.related_object_type
                        ? ` · ${row.related_object_type}`
                        : ""}
                    </div>
                  </div>
                  <div className="whitespace-nowrap font-mono text-xs text-ink-faint">
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
                {row.payload && Object.keys(row.payload).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-muted">
                      payload
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded-control bg-surface-muted p-2 text-xs">
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </SectionCard>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
