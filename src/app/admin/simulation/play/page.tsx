import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  renderSimulationBanner,
  renderWorkspaceSwitcher,
  resolveAdminShellContext,
  type StatusTone,
} from "@/components/admin";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  getActiveDoorHangerSimulationSession,
  isDoorHangerPluginEnabled,
  type ActiveDoorHangerSessionRow,
} from "@/core/simulation/play-page-data";
import {
  computeSessionProgress,
  resolvePlayPageGate,
} from "@/core/simulation/play-page-gate";
import {
  listSimulationActivityForRun,
  type SimulationActivityRow,
} from "@/core/simulation/activity";
import { getActiveSimulationRun } from "@/core/simulation/admin-data";
import { formatCentsAsDollars } from "@/core/simulation/validation";
import {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  formatDurationSeconds,
} from "@/plugins/door-hanger/simulation";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

const SESSION_STATUS_TONE: Record<
  ActiveDoorHangerSessionRow["status"],
  StatusTone
> = {
  active: "success",
  completed: "neutral",
  paused: "warning",
};

export default async function SimulationPlayPage() {
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

  const activeRun = business.isSimulation
    ? await getActiveSimulationRun(business.id)
    : null;

  const gate = resolvePlayPageGate({
    business: { name: business.name, isSimulation: business.isSimulation },
    activeRunId: activeRun?.id ?? null,
  });

  const shellChrome = {
    workspaceName: shell.workspaceName,
    userEmail: shell.userEmail,
    stagingToolsEnabled: shell.stagingToolsEnabled,
    workspaceSwitcherSlot: renderWorkspaceSwitcher(shell),
    simulationBannerSlot: renderSimulationBanner(shell),
  };

  if (gate.kind === "not_simulation_workspace") {
    return (
      <AdminShell {...shellChrome} signOutSlot={<SignOutButton />}>
        <PageHeader
          eyebrow="Simulation"
          title="Play"
          description="Operate plugin-backed simulation actions against an active save."
        />
        <SectionCard title="Switch to a simulation workspace">
          <EmptyState
            title="This is not a simulation workspace"
            description={`Active workspace: ${gate.businessName} (real). Use the workspace switcher in the top bar to pick a simulation workspace.`}
          />
        </SectionCard>
      </AdminShell>
    );
  }

  if (gate.kind === "no_active_save") {
    return (
      <AdminShell {...shellChrome} signOutSlot={<SignOutButton />}>
        <PageHeader
          eyebrow="Simulation"
          title="Play"
          description="Operate plugin-backed simulation actions against an active save."
        />
        <SectionCard title="Create or select a simulation save first">
          <EmptyState
            title="No active save"
            description="The play page needs one active save to play against."
            action={
              <Link
                href="/admin/simulation"
                className="inline-flex items-center rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                Go to Saves →
              </Link>
            }
          />
        </SectionCard>
      </AdminShell>
    );
  }

  // gate.kind === "play"
  const [doorHangerEnabled, session, activity] = await Promise.all([
    isDoorHangerPluginEnabled(business.id),
    getActiveDoorHangerSimulationSession({
      businessId: business.id,
      simulationRunId: gate.activeRunId,
    }),
    listSimulationActivityForRun({
      businessId: business.id,
      simulationRunId: gate.activeRunId,
      limit: 50,
    }),
  ]);

  return (
    <AdminShell {...shellChrome} signOutSlot={<SignOutButton />}>
      <PageHeader
        eyebrow="Simulation"
        title="Play"
        description="Use plugin-backed actions to play through business decisions. Gameplay mutations land in the next step; this page is read-only for now."
      />

      <SectionCard
        title="Active save"
        description="The save that gameplay actions will write to once they ship."
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">
              {activeRun?.name ?? "—"}
            </span>
            <StatusBadge tone="success">active</StatusBadge>
            <span className="text-xs text-ink-muted">
              · {gate.businessName}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-xs text-ink-muted sm:grid-cols-3">
            <KV
              label="Simulated now"
              value={formatIso(activeRun?.simulated_current_at)}
            />
            <KV
              label="Current cash"
              value={formatCentsAsDollars(activeRun?.current_cash_cents)}
            />
            <KV
              label="Simulated start"
              value={formatIso(activeRun?.simulated_start_at)}
            />
          </dl>
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Available plugin actions"
          description="Plugins that expose a simulation adapter appear here."
        >
          {doorHangerEnabled ? (
            <DoorHangerActionCard session={session} />
          ) : (
            <EmptyState
              title="No simulation-capable plugins are available yet"
              description="Install the Door Hanger plugin on this simulation workspace to play. Other plugins will appear here as they ship simulation adapters."
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Current Door Hanger work in progress"
          description="Read-only view of the current simulated route / session."
        >
          {session ? (
            <ActiveSessionCard session={session} />
          ) : (
            <EmptyState
              title="No Door Hanger route in progress"
              description="Start a simulated route from the Door Hanger card once gameplay actions ship."
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent simulation activity"
          description={
            activity.length === 0
              ? "Events will stream in here as you play."
              : `${activity.length} event${activity.length === 1 ? "" : "s"} (most recent first).`
          }
        >
          {activity.length === 0 ? (
            <EmptyState
              title="No simulation activity yet"
              description="Simulation activity will appear here as you play."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((row) => (
                <li key={row.id} className="py-2.5">
                  <ActivityRow row={row} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}

function DoorHangerActionCard({
  session,
}: {
  session: ActiveDoorHangerSessionRow | null;
}) {
  const hasActive = session !== null;
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Door Hangers</h3>
            <StatusBadge tone="success">enabled</StatusBadge>
            <StatusBadge tone="neutral">simulation adapter</StatusBadge>
          </div>
          <p className="mt-1 max-w-prose text-xs text-ink-muted">
            Run simulated door hanger routes. Each action consumes
            inventory and advances simulated time at the session&apos;s
            seconds-per-hanger rate. Default{" "}
            <strong>{DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER}s</strong> per
            hanger.
          </p>
        </div>
        <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint">
          Coming next
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DisabledButton label="Start simulated route" disabled={hasActive} />
        <DisabledButton label="Hang 1" disabled={!hasActive} />
        <DisabledButton label="Hang custom" disabled={!hasActive} />
        <DisabledButton label="Hang route" disabled={!hasActive} />
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">
        Gameplay actions are stubbed in Phase 7C. Wiring lands in Phase 7D —
        no clicks here will create CRM outcomes, send messages, or change
        inventory.
      </p>
    </div>
  );
}

function DisabledButton({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Coming next (Phase 7D)"
      className={`inline-flex items-center justify-center rounded-pill border border-line bg-surface-muted px-3 py-1.5 text-xs font-medium ${disabled ? "text-ink-faint" : "text-ink-muted"} cursor-not-allowed`}
    >
      {label}
    </button>
  );
}

function ActiveSessionCard({
  session,
}: {
  session: ActiveDoorHangerSessionRow;
}) {
  const routeHasStops =
    session.routeTotalStops !== null && session.routeTotalStops > 0;
  const progress = computeSessionProgress({
    hangersDistributed: session.hangersDistributed,
    routeHasStops,
    totalRouteStops: session.routeTotalStops ?? 0,
    targetHomeCount: session.routeTargetHomeCount,
  });
  const sec =
    session.secondsPerHanger ?? DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          {session.routeName ?? "Route"}
        </span>
        <StatusBadge tone={SESSION_STATUS_TONE[session.status]}>
          {session.status}
        </StatusBadge>
        {session.campaignName && (
          <span className="text-xs text-ink-muted">
            · {session.campaignName}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-ink-muted sm:grid-cols-4">
        <KV
          label="Hangers distributed"
          value={String(session.hangersDistributed)}
        />
        <KV
          label="Seconds / hanger"
          value={`${sec}s (= ${formatDurationSeconds(sec)} per hanger)`}
        />
        <KV label="Design" value={session.designName ?? "—"} />
        <KV
          label="Design remaining"
          value={
            session.designQuantityRemaining === null
              ? "—"
              : String(session.designQuantityRemaining)
          }
        />
        <KV label="Started" value={formatIso(session.startedAt)} />
        <KV
          label="Total route stops"
          value={
            session.routeTotalStops === null
              ? "—"
              : String(session.routeTotalStops)
          }
        />
        <KV
          label="Target home count"
          value={
            session.routeTargetHomeCount === null
              ? "—"
              : String(session.routeTargetHomeCount)
          }
        />
        <KV
          label="Progress"
          value={
            progress
              ? `${progress.hangersDistributed} / ${progress.totalHangers} (${progress.percentDistributed}%)`
              : "—"
          }
        />
      </dl>

      {progress && progress.totalHangers > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-pill border border-line bg-surface-muted">
          <div
            className="h-full bg-ink"
            style={{ width: `${progress.percentDistributed}%` }}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

function ActivityRow({ row }: { row: SimulationActivityRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{row.summary}</div>
        <div className="text-[11px] text-ink-faint">
          {row.plugin_key ? `${row.plugin_key} · ` : ""}
          {row.action_type}
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-ink-muted">
        <div title={row.simulated_at}>sim {formatIso(row.simulated_at)}</div>
        <div className="text-ink-faint">{formatIso(row.created_at)}</div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className="truncate text-ink">{value}</div>
    </div>
  );
}

function formatIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}
