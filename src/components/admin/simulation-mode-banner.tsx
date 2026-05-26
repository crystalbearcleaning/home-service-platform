import Link from "next/link";

// Phase 6D — persistent banner at the top of the admin shell whenever
// the active workspace is a simulation workspace. Server-rendered so
// the data comes straight from the shell-context fetch — no client
// state, no flicker.
//
// Shows:
//   - "Simulation Mode" + workspace name
//   - active save name / simulated current time / current cash if one
//     is active
//   - friendly "No active save" link to /admin/simulation otherwise
//   - warning that real external side effects are disabled
//
// Never rendered on real workspaces.

export type SimulationBannerContext = {
  workspaceName: string;
  activeRun: {
    id: string;
    name: string;
    simulatedCurrentAt: string;
    currentCashCents: number;
  } | null;
};

export function SimulationModeBanner({
  context,
}: {
  context: SimulationBannerContext;
}) {
  const { workspaceName, activeRun } = context;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-warning/40 bg-warning-soft px-4 py-2 text-warning-strong"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-pill bg-warning"
          />
          <span className="font-semibold uppercase tracking-wide">
            Simulation Mode
          </span>
          <span className="text-warning-strong/80">·</span>
          <span className="truncate">{workspaceName}</span>
          <span className="text-warning-strong/80">·</span>
          <span className="text-[11px]">
            Real external effects are disabled.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {activeRun ? (
            <>
              <span className="truncate" title="Active save">
                <span className="text-warning-strong/70">Save:</span>{" "}
                <span className="font-medium">{activeRun.name}</span>
              </span>
              <span className="truncate" title="Simulated current time">
                <span className="text-warning-strong/70">Sim time:</span>{" "}
                {formatSimTime(activeRun.simulatedCurrentAt)}
              </span>
              <span title="Current cash">
                <span className="text-warning-strong/70">Cash:</span>{" "}
                {formatCash(activeRun.currentCashCents)}
              </span>
            </>
          ) : (
            <span>
              No active save selected.{" "}
              <Link
                href="/admin/simulation"
                className="underline underline-offset-2"
              >
                Create or pick one →
              </Link>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSimTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function formatCash(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents))
    return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
