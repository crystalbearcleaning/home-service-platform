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
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import {
  formatCentsAsDollars,
  quantityRemaining,
} from "@/core/door-hanger/calculations";
import {
  listCampaigns,
  listDesigns,
  listRecentSessions,
  listRoutes,
  type DesignRow,
  type RouteRow,
  type SessionRow,
  type CampaignRow,
} from "@/core/door-hanger/admin-data";
import { SignOutButton } from "../../sign-out-button";
import {
  CampaignCreateForm,
  DesignCreateForm,
  RouteCreateForm,
  SessionCreateForm,
} from "./forms";
import { RentcastRouteGenerator } from "./rentcast-route-form";

export const dynamic = "force-dynamic";

export default async function DoorHangersDashboardPage() {
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

  const [campaigns, designs, routes, recentSessions] = await Promise.all([
    listCampaigns(business.id),
    listDesigns(business.id),
    listRoutes(business.id),
    listRecentSessions(business.id, 20),
  ]);

  const designsWithRemaining = designs.filter(
    (d) => quantityRemaining(d) > 0,
  );

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
        eyebrow="Marketing"
        title="Door Hangers"
        description="Plan campaigns, track inventory, lay out routes, and log distribution sessions. RentCast route generation lands in Phase 5C; simulation lands in Phase 6+."
      />

      <SectionCard
        title="Campaigns"
        description={
          campaigns.length === 0
            ? "No campaigns yet. Start with the campaign that frames the offer."
            : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}.`
        }
      >
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="A campaign is the organizing object — give it a name + offer, then attach inventory + routes."
          />
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.slice(0, 10).map((c) => (
              <li key={c.id} className="py-2 text-xs">
                <CampaignRowView c={c} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <CampaignCreateForm />
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Inventory"
          description={
            designs.length === 0
              ? "No inventory yet. Enter your printer's total cost per print run."
              : `${designs.length} design${designs.length === 1 ? "" : "s"}.`
          }
        >
          {designs.length === 0 ? (
            <EmptyState
              title="No inventory yet"
              description="Add a design + total print cost; cost per hanger is calculated automatically."
            />
          ) : (
            <ul className="divide-y divide-line">
              {designs.slice(0, 10).map((d) => (
                <li key={d.id} className="py-2 text-xs">
                  <DesignRowView d={d} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <DesignCreateForm />
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Routes"
          description={
            routes.length === 0
              ? "No routes yet. Create a manual route shell for now; RentCast generation lands in Phase 5C."
              : `${routes.length} route${routes.length === 1 ? "" : "s"}.`
          }
        >
          {routes.length === 0 ? (
            <EmptyState
              title="No routes yet"
              description="Sketch a manual route shell — name, optional center address, target home count."
            />
          ) : (
            <ul className="divide-y divide-line">
              {routes.slice(0, 10).map((r) => (
                <li key={r.id} className="py-2 text-xs">
                  <RouteRowView r={r} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-3">
            <RentcastRouteGenerator
              campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            />
            <RouteCreateForm
              campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
            />
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent distribution sessions"
          description={
            recentSessions.length === 0
              ? "No sessions logged yet."
              : `Last ${recentSessions.length} session${recentSessions.length === 1 ? "" : "s"}.`
          }
        >
          {recentSessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="After a route is walked, log how many hangers went out and how long it took. Inventory updates automatically."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recentSessions.map((s) => (
                <li key={s.id} className="py-2 text-xs">
                  <SessionRowView s={s} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <SessionCreateForm
              campaigns={campaigns.map((c) => ({ id: c.id, label: c.name }))}
              routes={routes.map((r) => ({
                id: r.id,
                label: r.campaignName ? `${r.name} — ${r.campaignName}` : r.name,
              }))}
              designs={designsWithRemaining.map((d) => ({
                id: d.id,
                label: `${d.name} (${quantityRemaining(d)} remaining)`,
              }))}
            />
            {designsWithRemaining.length === 0 && designs.length > 0 && (
              <p className="mt-2 text-[11px] text-warning-strong">
                All current inventory is fully used. Add a new design to log
                more sessions.
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <p className="mt-6 text-[11px] text-ink-faint">
        Create-only in Phase 5B-2. Edit / delete flows arrive later if
        needed. RentCast-backed route generation = Phase 5C. Simulated
        distribution + CRM lead generation = Phase 6+.
      </p>
    </AdminShell>
  );
}

// -------------------------------------------------------------------------
// Section row views
// -------------------------------------------------------------------------

function CampaignRowView({ c }: { c: CampaignRow }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{c.name}</span>
        <StatusBadge tone={campaignTone(c.status)}>{c.status}</StatusBadge>
      </div>
      {c.offerSummary && (
        <div className="mt-0.5 text-ink-muted">{c.offerSummary}</div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        {c.targetArea && <span>area · {c.targetArea}</span>}
        {c.responseRateAssumption !== null && (
          <span>response · {(c.responseRateAssumption * 100).toFixed(2)}%</span>
        )}
        {c.quoteToBookingAssumption !== null && (
          <span>quote→book · {(c.quoteToBookingAssumption * 100).toFixed(0)}%</span>
        )}
        {c.averageJobValueCents !== null && (
          <span>avg job · {formatCentsAsDollars(c.averageJobValueCents)}</span>
        )}
        <span className="font-mono">
          created {new Date(c.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function DesignRowView({ d }: { d: DesignRow }) {
  const remaining = quantityRemaining(d);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">
          {d.name}
          {d.versionOrOffer ? (
            <span className="ml-1 text-ink-muted">— {d.versionOrOffer}</span>
          ) : null}
        </span>
        <StatusBadge tone={remaining > 0 ? "success" : "warning"}>
          {remaining} remaining
        </StatusBadge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        <span>received {d.quantityReceived}</span>
        <span>used {d.quantityUsed}</span>
        {d.totalPrintCostCents !== null && (
          <span>total · {formatCentsAsDollars(d.totalPrintCostCents)}</span>
        )}
        {d.costPerHangerCents !== null && (
          <span>per hanger · {formatCentsAsDollars(d.costPerHangerCents)}</span>
        )}
        {d.receivedAt && <span>received {d.receivedAt}</span>}
      </div>
    </div>
  );
}

function RouteRowView({ r }: { r: RouteRow }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{r.name}</span>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone="default">{r.generatedFromSource}</StatusBadge>
          <StatusBadge tone={routeTone(r.status)}>{r.status}</StatusBadge>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        {r.campaignName && <span>campaign · {r.campaignName}</span>}
        {r.centerAddress && <span>center · {r.centerAddress}</span>}
        {r.radiusMiles !== null && <span>radius · {r.radiusMiles}mi</span>}
        {r.targetHomeCount !== null && (
          <span>target · {r.targetHomeCount}</span>
        )}
        <span>stops · {r.totalRouteStops}</span>
        {r.estimatedTimeSeconds !== null && (
          <span>est · {Math.round(r.estimatedTimeSeconds / 60)}min</span>
        )}
      </div>
    </div>
  );
}

function SessionRowView({ s }: { s: SessionRow }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink">
          {new Date(s.distributedAt).toLocaleString()}
        </span>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={s.mode === "real" ? "default" : "info"}>
            {s.mode}
          </StatusBadge>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        {s.campaignName && <span>{s.campaignName}</span>}
        {s.routeName && <span>route · {s.routeName}</span>}
        {s.designName && <span>design · {s.designName}</span>}
        <span>hung · {s.hangersDistributed}</span>
        {s.timeSpentSeconds !== null && (
          <span>time · {Math.round(s.timeSpentSeconds / 60)}min</span>
        )}
        {s.materialCostCents !== null && (
          <span>material · {formatCentsAsDollars(s.materialCostCents)}</span>
        )}
      </div>
      {s.notes && <div className="mt-1 text-ink-muted">{s.notes}</div>}
    </div>
  );
}

function campaignTone(status: string):
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "default" {
  switch (status) {
    case "active":
      return "success";
    case "paused":
      return "warning";
    case "complete":
      return "info";
    default:
      return "default";
  }
}

function routeTone(status: string):
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "default" {
  switch (status) {
    case "ready":
      return "info";
    case "in_progress":
      return "success";
    case "completed":
      return "neutral";
    case "paused":
      return "warning";
    default:
      return "default";
  }
}
