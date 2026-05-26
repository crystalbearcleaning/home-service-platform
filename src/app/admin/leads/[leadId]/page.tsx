import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { SignOutButton } from "../../sign-out-button";
import { LeadDetailClient } from "./lead-detail-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ leadId: string }> };

type LeadRow = {
  id: string;
  business_id: string;
  status: string;
  customer_intent: string;
  source: string | null;
  created_at: string;
  contact_id: string;
  property_id: string;
  quote_page_interaction_id: string | null;
};

type ContactRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string;
};

type PropertyRow = {
  id: string;
  formatted_address: string;
  address_line_1: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  square_footage: number | null;
  property_type: string | null;
  service_area_status: string;
};

type QuoteRow = {
  id: string;
  status: string;
  selected_option_key: string | null;
  selected_total: number | null;
  expires_at: string;
  source_plugin_version: string;
  created_at: string;
};

type TaskRow = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  task_category: string;
  priority: string;
  completed_at: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  body: string;
  author_user_id: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  summary: string;
  created_at: string;
};

export default async function LeadDetailPage({ params }: Props) {
  const { leadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id,business_id,status,customer_intent,source,created_at,contact_id,property_id,quote_page_interaction_id",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) notFound();
  const leadRow = lead as LeadRow;
  if (leadRow.business_id !== business.id) notFound();

  // Fan-out everything else in parallel.
  const [contactRes, propertyRes, quoteRes, taskRes, notesRes, activityRes] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id,full_name,first_name,last_name,phone,email")
        .eq("id", leadRow.contact_id)
        .maybeSingle(),
      supabase
        .from("properties")
        .select(
          "id,formatted_address,address_line_1,city,state,postal_code,square_footage,property_type,service_area_status",
        )
        .eq("id", leadRow.property_id)
        .maybeSingle(),
      supabase
        .from("quotes")
        .select(
          "id,status,selected_option_key,selected_total,expires_at,source_plugin_version,created_at",
        )
        .eq("business_id", business.id)
        .eq("lead_id", leadRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select(
          "id,status,title,description,task_category,priority,completed_at,created_at",
        )
        .eq("business_id", business.id)
        .eq("related_object_type", "lead")
        .eq("related_object_id", leadRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("notes")
        .select("id,body,author_user_id,created_at")
        .eq("business_id", business.id)
        .eq("related_object_type", "lead")
        .eq("related_object_id", leadRow.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("activities")
        .select("id,activity_type,summary,created_at")
        .eq("business_id", business.id)
        .eq("related_object_type", "lead")
        .eq("related_object_id", leadRow.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const contact = (contactRes.data ?? null) as ContactRow | null;
  const property = (propertyRes.data ?? null) as PropertyRow | null;
  const quote = (quoteRes.data ?? null) as QuoteRow | null;
  const task = (taskRes.data ?? null) as TaskRow | null;
  const notes = ((notesRes.data ?? []) as NoteRow[]) ?? [];
  const activity = ((activityRes.data ?? []) as ActivityRow[]) ?? [];

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <div className="mb-2 text-[11px]">
        <Link
          href="/admin/leads"
          className="text-ink-muted hover:text-ink"
        >
          ← Leads
        </Link>
      </div>
      <PageHeader
        eyebrow="CRM"
        title={
          contact?.full_name
            ? `Lead: ${contact.full_name}`
            : "Lead"
        }
        description={`Created ${new Date(leadRow.created_at).toLocaleString()}`}
        actions={
          <StatusBadge tone={leadStatusTone(leadRow.status)}>
            {leadRow.status.replace(/_/g, " ")}
          </StatusBadge>
        }
      />

      <SectionCard
        title="Contact"
        actions={
          contact ? (
            <Link
              href={`/admin/contacts/${contact.id}`}
              className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Open customer hub →
            </Link>
          ) : null
        }
      >
        {contact ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <dt className="text-ink-muted">name</dt>
            <dd className="text-ink">{contact.full_name}</dd>
            <dt className="text-ink-muted">phone</dt>
            <dd className="font-mono text-ink">{contact.phone}</dd>
            <dt className="text-ink-muted">email</dt>
            <dd className="font-mono text-ink">{contact.email}</dd>
          </dl>
        ) : (
          <p className="text-xs text-ink-muted">Contact not found.</p>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Property">
          {property ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <dt className="text-ink-muted">address</dt>
              <dd className="break-all text-ink">{property.formatted_address}</dd>
              <dt className="text-ink-muted">city / state</dt>
              <dd className="text-ink">
                {property.city}
                {property.state ? `, ${property.state}` : ""}
                {property.postal_code ? ` ${property.postal_code}` : ""}
              </dd>
              <dt className="text-ink-muted">service area</dt>
              <dd className="text-ink">{property.service_area_status}</dd>
              <dt className="text-ink-muted">sq ft</dt>
              <dd className="text-ink">{property.square_footage ?? "—"}</dd>
              <dt className="text-ink-muted">property type</dt>
              <dd className="text-ink">{property.property_type ?? "—"}</dd>
            </dl>
          ) : (
            <p className="text-xs text-ink-muted">Property not found.</p>
          )}
        </SectionCard>
      </div>

      {quote && (
        <div className="mt-6">
          <SectionCard
            title="Quote"
            description={`Immutable snapshot from ${quote.source_plugin_version}.`}
          >
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <dt className="text-ink-muted">status</dt>
              <dd className="text-ink">{quote.status}</dd>
              <dt className="text-ink-muted">selected option</dt>
              <dd className="text-ink">{quote.selected_option_key ?? "—"}</dd>
              <dt className="text-ink-muted">total</dt>
              <dd className="text-ink">
                {quote.selected_total !== null ? `$${quote.selected_total}` : "—"}
              </dd>
              <dt className="text-ink-muted">expires</dt>
              <dd className="text-ink">
                {new Date(quote.expires_at).toLocaleString()}
              </dd>
            </dl>
          </SectionCard>
        </div>
      )}

      <div className="mt-6">
        <SectionCard title="Related task">
          {task ? (
            <LeadDetailClient
              leadId={leadRow.id}
              task={{
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                category: task.task_category,
                completedAt: task.completed_at,
                createdAt: task.created_at,
              }}
            />
          ) : (
            <p className="text-xs text-ink-muted">No task linked to this lead.</p>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Internal notes">
          <NotesSection leadId={leadRow.id} notes={notes} />
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent activity"
          description={`Last ${activity.length} entries scoped to this lead.`}
        >
          {activity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Activity entries from the quote-flow submission, task completion, and notes will appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="py-2 text-xs">
                  <div className="font-mono text-ink">
                    {new Date(a.created_at).toLocaleString()}
                    <span className="ml-2 text-ink-faint">
                      {a.activity_type}
                    </span>
                  </div>
                  <div className="mt-0.5 text-ink-muted">{a.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}

function leadStatusTone(status: string): StatusTone {
  switch (status) {
    case "scheduling_requested":
      return "success";
    case "needs_manual_quote":
    case "service_area_review_needed":
      return "warning";
    default:
      return "default";
  }
}

// The notes section reuses the lead-detail client. Implemented as a
// thin wrapper so the page stays a server component.
function NotesSection({
  leadId,
  notes,
}: {
  leadId: string;
  notes: NoteRow[];
}) {
  return (
    <LeadDetailClient
      leadId={leadId}
      notes={notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
      }))}
      mode="notes-only"
    />
  );
}
