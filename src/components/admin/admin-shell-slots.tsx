import type { AdminShellContext } from "./admin-shell-props";
import { SimulationModeBanner } from "./simulation-mode-banner";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Small server-rendered helpers that turn `AdminShellContext` into the
// `workspaceSwitcherSlot` / `simulationBannerSlot` props consumed by
// `AdminShell`. Lets each page write:
//
//   <AdminShell
//     workspaceName={shell.workspaceName}
//     userEmail={shell.userEmail}
//     stagingToolsEnabled={shell.stagingToolsEnabled}
//     workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
//     simulationBannerSlot={renderSimulationBanner(shell)}
//     ...
//   />
//
// without rebuilding the slot wiring in every page.

export function renderWorkspaceSwitcher(shell: AdminShellContext) {
  if (shell.workspaces.length === 0) return null;
  return (
    <WorkspaceSwitcher
      workspaces={shell.workspaces}
      activeBusinessId={shell.activeBusinessId}
    />
  );
}

export function renderSimulationBanner(shell: AdminShellContext) {
  if (!shell.simulationBanner) return null;
  return <SimulationModeBanner context={shell.simulationBanner} />;
}
