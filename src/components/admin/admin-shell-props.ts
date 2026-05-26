import "server-only";

import type { ActiveBusinessSummary } from "@/core/business/active-business";
import { listMembershipBusinessesForUser } from "@/core/business/list-memberships";
import { getActiveSimulationRun } from "@/core/simulation/admin-data";
import { readStagingToolsGate } from "@/core/staging-tools/env";
import type { SimulationBannerContext } from "./simulation-mode-banner";
import type { WorkspaceSwitcherOption } from "./workspace-switcher";

// Server-only helper that gathers every cross-cutting piece of admin
// shell context in one trip:
//   - existing: workspace name, user email, staging-tools gate
//   - Phase 6D: workspaces list (for the switcher), active workspace id,
//               and simulation banner context (workspace name + active
//               save) when the active workspace is a simulation workspace.
//
// Async by necessity now (membership + active-save lookups).

export type AdminShellContext = {
  workspaceName: string;
  userEmail: string;
  stagingToolsEnabled: boolean;
  workspaces: WorkspaceSwitcherOption[];
  activeBusinessId: string;
  simulationBanner: SimulationBannerContext | null;
};

export async function resolveAdminShellContext(input: {
  business: ActiveBusinessSummary;
  userId: string;
  userEmail: string;
}): Promise<AdminShellContext> {
  const gate = readStagingToolsGate(process.env);

  const [workspaces, activeRun] = await Promise.all([
    listMembershipBusinessesForUser(input.userId),
    input.business.isSimulation
      ? getActiveSimulationRun(input.business.id)
      : Promise.resolve(null),
  ]);

  const simulationBanner: SimulationBannerContext | null =
    input.business.isSimulation
      ? {
          workspaceName: input.business.name,
          activeRun: activeRun
            ? {
                id: activeRun.id,
                name: activeRun.name,
                simulatedCurrentAt: activeRun.simulated_current_at,
                currentCashCents: activeRun.current_cash_cents,
              }
            : null,
        }
      : null;

  return {
    workspaceName: input.business.name,
    userEmail: input.userEmail,
    stagingToolsEnabled: gate.publicEnabled,
    workspaces,
    activeBusinessId: input.business.id,
    simulationBanner,
  };
}
