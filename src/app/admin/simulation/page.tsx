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
  getActiveSimulationRun,
  listSimulationRuns,
  type SimulationRunRow,
} from "@/core/simulation/admin-data";
import {
  formatCentsAsDollars,
  type SimulationRunStatus,
} from "@/core/simulation/validation";
import { SignOutButton } from "../sign-out-button";
import { MakeActiveButton, SimulationRunCreateForm } from "./forms";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<SimulationRunStatus, StatusTone> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  archived: "neutral",
};

export default async function SimulationDashboardPage() {
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

  if (!business.isSimulation) {
    return (
      <AdminShell
        workspaceName={shell.workspaceName}
        userEmail={shell.userEmail}
        signOutSlot={<SignOutButton />}
        stagingToolsEnabled={shell.stagingToolsEnabled}
      >
        <PageHeader
          eyebrow="Simulation"
          title="Saves"
          description="Simulation saves live inside a simulation workspace. Switch to a simulation workspace to manage saves."
        />
        <SectionCard
          title="Switch to a simulation workspace"
          description="Workspace switching ships in Phase 6D. For now, an operator with membership in a simulation workspace can swap by changing memberships directly. The active workspace is shown in the top-left."
        >
          <EmptyState
            title="This is not a simulation workspace"
            description={`Active workspace: ${business.name} (real). Saves are disabled here so real customer data stays clean.`}
          />
        </SectionCard>
      </AdminShell>
    );
  }

  const [runs, activeRun] = await Promise.all([
    listSimulationRuns(business.id),
    getActiveSimulationRun(business.id),
  ]);

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Simulation"
        title="Saves"
        description="Create and open simulation saves for this workspace. Gameplay (Hang 1 / Hang Route / clock advance / CRM outcomes) lands in Phase 7+."
      />

      <SectionCard
        title="Active save"
        description={
          activeRun
            ? "The save that future gameplay actions will write to."
            : "No save is active yet. Mark one active when you're ready to play."
        }
      >
        {activeRun ? (
          <ActiveRunCard run={activeRun} />
        ) : (
          <EmptyState
            title="No active save"
            description="Create your first save below — or mark an existing save active from the list."
          />
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="All saves"
          description={
            runs.length === 0
              ? "Create your first simulation save."
              : `${runs.length} save${runs.length === 1 ? "" : "s"}.`
          }
        >
          {runs.length === 0 ? (
            <EmptyState
              title="No saves yet"
              description="A save tracks starting cash, simulated date/time, and status. Gameplay will mutate the current values; create-only first."
            />
          ) : (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id} className="py-3">
                  <RunRow row={r} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <SimulationRunCreateForm />
          </div>
        </SectionCard>
      </div>
    </AdminShell>
  );
}

function ActiveRunCard({ run }: { run: SimulationRunRow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{run.name}</span>
        <StatusBadge tone={STATUS_TONE[run.status]}>{run.status}</StatusBadge>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-xs text-ink-muted sm:grid-cols-4">
        <KV label="Starting cash" value={formatCentsAsDollars(run.starting_cash_cents)} />
        <KV label="Current cash" value={formatCentsAsDollars(run.current_cash_cents)} />
        <KV label="Simulated start" value={formatIso(run.simulated_start_at)} />
        <KV label="Simulated now" value={formatIso(run.simulated_current_at)} />
      </dl>
      {run.notes && (
        <p className="text-xs text-ink-muted">{run.notes}</p>
      )}
    </div>
  );
}

function RunRow({ row }: { row: SimulationRunRow }) {
  const isActive = row.status === "active";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{row.name}</span>
          <StatusBadge tone={STATUS_TONE[row.status]}>{row.status}</StatusBadge>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-ink-muted sm:grid-cols-4">
          <KV label="Starting cash" value={formatCentsAsDollars(row.starting_cash_cents)} />
          <KV label="Current cash" value={formatCentsAsDollars(row.current_cash_cents)} />
          <KV label="Simulated now" value={formatIso(row.simulated_current_at)} />
          <KV label="Created" value={formatIso(row.created_at)} />
        </div>
      </div>
      <div className="shrink-0">
        {!isActive && row.status !== "archived" && (
          <MakeActiveButton runId={row.id} />
        )}
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

function formatIso(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}
