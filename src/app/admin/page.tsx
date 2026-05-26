import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  resolveAdminShellContext,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);

  // No-business state: render a minimal panel with sign-out only —
  // the shell needs an active business to be useful.
  if (!business) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl p-8">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              No business membership
            </h1>
            <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
          </div>
          <SignOutButton />
        </header>
        <p className="text-sm text-ink">
          Your account is not linked to a Crystal Bear membership. Run the
          seed script (<code>./supabase/seed/run_seed.sh</code>) after signing
          up with this email, or have an owner add you.
        </p>
      </main>
    );
  }

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  // Compact counts for the records summary strip. Head-only count
  // queries — no rows returned, no business logic touched.
  const [leadsCount, quotesCount, openTasksCount, interactionsCount] =
    await Promise.all([
      countRows(supabase, "leads", business.id),
      countRows(supabase, "quotes", business.id),
      countRows(supabase, "tasks", business.id, {
        column: "status",
        value: "open",
      }),
      countRows(supabase, "quote_page_interactions", business.id),
    ]);

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${business.name}`}
        description="Your control room. Check what needs attention, peek at recent quote-flow activity, and keep your system healthy."
      />

      <SectionCard
        title="System overview"
        description="Workspace identity, your sign-in, and the plugins powering this surface."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Workspace" value={business.name} />
          <StatCard label="Slug" value={business.slug} />
          <StatCard label="Role" value={business.roleName ?? "—"} />
          <StatCard
            label="App surfaces"
            value={String(business.appSurfacesCount)}
          />
          <StatCard
            label="Installed plugins"
            value={String(business.installedPluginsCount)}
          />
          <StatCard label="Signed in as" value={user.email ?? "—"} />
        </div>
        {shell.stagingToolsEnabled && (
          <div className="mt-4 flex items-start gap-2 rounded-control border border-warning bg-warning-soft px-3 py-2 text-xs text-warning-strong">
            <StatusBadge tone="warning" dot>
              Staging mode
            </StatusBadge>
            <span>
              Destructive reset is reachable from the Tools group. Never
              enable in production.
            </span>
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Where things stand"
          description="A live read of your quote-flow business records."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Quote interactions"
              value={String(interactionsCount)}
              description="Anonymous /q lookups"
            />
            <StatCard
              label="Leads"
              value={String(leadsCount)}
              description="From quote submissions"
              tone="info"
            />
            <StatCard
              label="Quotes"
              value={String(quotesCount)}
              description="Immutable snapshots"
              tone="brand"
            />
            <StatCard
              label="Open tasks"
              value={String(openTasksCount)}
              description="Things that want a look"
              tone={openTasksCount > 0 ? "warning" : "default"}
            />
          </div>
          {leadsCount === 0 &&
            quotesCount === 0 &&
            openTasksCount === 0 &&
            interactionsCount === 0 && (
              <div className="mt-4">
                <EmptyState
                  title="Nothing here yet"
                  description="Once a customer submits at /q, you'll see interactions, leads, quotes, and tasks land right here."
                  action={
                    <Link
                      href="/q"
                      className="rounded-control bg-brand px-3 py-1.5 text-xs font-medium text-surface hover:bg-brand-strong"
                    >
                      Open /q
                    </Link>
                  }
                />
              </div>
            )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Jump to"
          description="Quick paths to the things you check most."
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <QuickLink
              href="/admin/quote-interactions"
              label="Review new requests"
              hint="Every /q lookup, including out-of-area and missing-data attempts."
            />
            <QuickLink
              href="/admin/leads"
              label="See your leads"
              hint="Customer submissions converted into business records."
            />
            <QuickLink
              href="/admin/tasks"
              label="Check what needs attention"
              hint="Schedule follow-ups, manual quotes, and area reviews."
            />
            <QuickLink
              href="/admin/plugins"
              label="Manage your plugins"
              hint="Installed plugins, status, and declared permissions."
            />
            <QuickLink
              href="/admin/testing"
              label="Open testing tools"
              hint="Internal utilities for Google, RentCast, pricing, and rate limits."
            />
          </ul>
        </SectionCard>
      </div>
    </AdminShell>
  );
}

async function countRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  businessId: string,
  extra?: { column: string; value: string },
): Promise<number> {
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (extra) q = q.eq(extra.column, extra.value);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

function QuickLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start justify-between gap-3 rounded-control border border-line bg-surface p-3 text-sm transition hover:border-line-strong hover:bg-surface-muted"
      >
        <div className="min-w-0">
          <div className="font-medium text-ink">{label}</div>
          {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
        </div>
        <span className="shrink-0 text-ink-faint">→</span>
      </Link>
    </li>
  );
}
