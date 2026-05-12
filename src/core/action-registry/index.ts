import "server-only";
import { createActionRegistry } from "./registry";
import { registerCoreActions } from "./core-actions";
import type { ActionRegistry } from "./types";

// HMR-stable singleton. Next.js dev re-evaluates modules; storing the
// registry on globalThis prevents double-registration on every reload.
declare global {
  // eslint-disable-next-line no-var
  var __actionRegistry: ActionRegistry | undefined;
}

export function getActionRegistry(): ActionRegistry {
  if (!globalThis.__actionRegistry) {
    const registry = createActionRegistry();
    registerCoreActions(registry);
    globalThis.__actionRegistry = registry;
  }
  return globalThis.__actionRegistry;
}

export type {
  ActionContext,
  ActionDefinition,
  ActionError,
  ActionErrorCode,
  ActionHandler,
  ActionRegistry,
  ActionResult,
  ActionRiskLevel,
  ActionSourceType,
  AnyActionDefinition,
} from "./types";
