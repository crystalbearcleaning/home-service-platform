// Plugin registry types — pure type definitions, no runtime imports.

export type PluginStatus = "installed" | "enabled" | "disabled" | "error";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SurfaceType = "admin" | "customer" | "role";
export type PluginPermission = string;

export type PluginManifestActionDecl = {
  actionKey: string;
  name: string;
  description?: string;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
};

export type PluginManifestUiDecl = {
  uiKey: string;
  surfaceType: SurfaceType;
  slot: string;
  componentKey: string;
};

export type PluginManifest = {
  pluginKey: string;
  name: string;
  version: string;
  permissions: PluginPermission[];
  actions: PluginManifestActionDecl[];
  events: string[];
  uiRegistrations: PluginManifestUiDecl[];
};

export type PluginActionRegistration = {
  actionKey: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
};

export type PluginUiRegistration = {
  id: string;
  uiKey: string;
  surfaceType: SurfaceType;
  slot: string;
  componentKey: string;
  config: unknown | null;
  isEnabled: boolean;
};

export type PluginDefinition = {
  id: string;
  pluginKey: string;
  name: string;
  description: string | null;
  currentVersion: string;
  manifest: PluginManifest;
  isInternal: boolean;
};

export type InstalledPlugin = {
  id: string;
  businessId: string;
  pluginDefinitionId: string;
  pluginKey: string;
  installedVersion: string;
  status: PluginStatus;
  settings: unknown | null;
};

export type LoadedPlugin = {
  installed: InstalledPlugin;
  definition: PluginDefinition;
  permissions: PluginPermission[];
  actionRegistrations: PluginActionRegistration[];
  uiRegistrations: PluginUiRegistration[];
};

export type PluginLoadErrorReason =
  | "malformed_manifest"
  | "missing_definition"
  | "unknown";

export type PluginLoadError = {
  pluginKey: string;
  reason: PluginLoadErrorReason;
  message: string;
};

export type PluginLoadStatus =
  | "ok"
  | "disabled"
  | "error"
  | "malformed_manifest"
  | "missing_definition";

// Admin-facing record. Includes load errors and any non-OK plugin states so
// the admin Plugins page can show every installed plugin, not just the ones
// the runtime would accept.
export type AdminPluginRecord = {
  installed: InstalledPlugin;
  definition: PluginDefinition | null;
  loadStatus: PluginLoadStatus;
  permissions: PluginPermission[];
  actionRegistrations: PluginActionRegistration[];
  uiRegistrations: PluginUiRegistration[];
  loadError: PluginLoadError | null;
};

// Runtime registry shape. Contains only successfully loaded, enabled plugins
// plus a separate list of load errors that the runtime/admin can surface.
export type PluginRegistry = {
  businessId: string;
  plugins: LoadedPlugin[];
  errors: PluginLoadError[];
};
