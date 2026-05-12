import "server-only";
import { createClient } from "@/core/auth/server";
import { parseManifest } from "./manifest";
import type {
  AdminPluginRecord,
  InstalledPlugin,
  LoadedPlugin,
  PluginActionRegistration,
  PluginDefinition,
  PluginLoadError,
  PluginLoadStatus,
  PluginRegistry,
  PluginStatus,
  PluginUiRegistration,
  RiskLevel,
  SurfaceType,
} from "./types";

// ---------------------------------------------------------------------------
// Row shapes (mirror the schema; kept here so the loader compiles without
// generated Supabase types).
// ---------------------------------------------------------------------------
type InstalledRow = {
  id: string;
  business_id: string;
  plugin_definition_id: string;
  plugin_key: string;
  installed_version: string;
  status: string;
  settings: unknown | null;
};

type DefinitionRow = {
  id: string;
  plugin_key: string;
  name: string;
  description: string | null;
  current_version: string;
  manifest: unknown;
  is_internal: boolean;
};

type ActionRow = {
  plugin_definition_id: string;
  action_key: string;
  name: string;
  description: string | null;
  input_schema: unknown;
  output_schema: unknown;
  risk_level: string;
  requires_approval: boolean;
};

type UiRow = {
  id: string;
  installed_plugin_id: string;
  ui_key: string;
  surface_type: string;
  slot: string;
  component_key: string;
  config: unknown | null;
  is_enabled: boolean;
};

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------
function mapInstalled(row: InstalledRow): InstalledPlugin {
  return {
    id: row.id,
    businessId: row.business_id,
    pluginDefinitionId: row.plugin_definition_id,
    pluginKey: row.plugin_key,
    installedVersion: row.installed_version,
    status: row.status as PluginStatus,
    settings: row.settings,
  };
}

function mapAction(row: ActionRow): PluginActionRegistration {
  return {
    actionKey: row.action_key,
    name: row.name,
    description: row.description,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    riskLevel: row.risk_level as RiskLevel,
    requiresApproval: row.requires_approval,
  };
}

function mapUi(row: UiRow): PluginUiRegistration {
  return {
    id: row.id,
    uiKey: row.ui_key,
    surfaceType: row.surface_type as SurfaceType,
    slot: row.slot,
    componentKey: row.component_key,
    config: row.config,
    isEnabled: row.is_enabled,
  };
}

// ---------------------------------------------------------------------------
// Fetch all rows we need for a business in as few round-trips as possible.
// Reads run under the caller's authenticated context; RLS enforces scoping.
// ---------------------------------------------------------------------------
async function fetchAll(businessId: string): Promise<{
  installed: InstalledRow[];
  definitions: DefinitionRow[];
  actions: ActionRow[];
  uiRows: UiRow[];
}> {
  const supabase = await createClient();

  const [installedRes, uiRes] = await Promise.all([
    supabase
      .from("installed_plugins")
      .select(
        "id, business_id, plugin_definition_id, plugin_key, installed_version, status, settings",
      )
      .eq("business_id", businessId),
    supabase
      .from("plugin_ui_registrations")
      .select(
        "id, installed_plugin_id, ui_key, surface_type, slot, component_key, config, is_enabled",
      )
      .eq("business_id", businessId),
  ]);

  if (installedRes.error) {
    throw new Error(`installed_plugins: ${installedRes.error.message}`);
  }
  if (uiRes.error) {
    throw new Error(`plugin_ui_registrations: ${uiRes.error.message}`);
  }

  const installed = (installedRes.data ?? []) as InstalledRow[];
  const uiRows = (uiRes.data ?? []) as UiRow[];

  if (installed.length === 0) {
    return { installed, definitions: [], actions: [], uiRows };
  }

  const definitionIds = Array.from(
    new Set(installed.map((row) => row.plugin_definition_id)),
  );

  const [defRes, actionsRes] = await Promise.all([
    supabase
      .from("plugin_definitions")
      .select(
        "id, plugin_key, name, description, current_version, manifest, is_internal",
      )
      .in("id", definitionIds),
    supabase
      .from("plugin_action_registrations")
      .select(
        "plugin_definition_id, action_key, name, description, input_schema, output_schema, risk_level, requires_approval",
      )
      .in("plugin_definition_id", definitionIds),
  ]);

  if (defRes.error) {
    throw new Error(`plugin_definitions: ${defRes.error.message}`);
  }
  if (actionsRes.error) {
    throw new Error(`plugin_action_registrations: ${actionsRes.error.message}`);
  }

  return {
    installed,
    definitions: (defRes.data ?? []) as DefinitionRow[],
    actions: (actionsRes.data ?? []) as ActionRow[],
    uiRows,
  };
}

// ---------------------------------------------------------------------------
// Build a single admin record from already-fetched rows. Each branch
// returns a value — malformed manifests and missing definitions degrade
// gracefully instead of throwing.
// ---------------------------------------------------------------------------
function buildAdminRecord(
  row: InstalledRow,
  defs: DefinitionRow[],
  actions: ActionRow[],
  uiRows: UiRow[],
): AdminPluginRecord {
  const installed = mapInstalled(row);
  const def = defs.find((d) => d.id === row.plugin_definition_id) ?? null;

  const pluginUi = uiRows
    .filter((u) => u.installed_plugin_id === row.id)
    .map(mapUi);

  const pluginActions = def
    ? actions
        .filter((a) => a.plugin_definition_id === def.id)
        .map(mapAction)
    : [];

  if (!def) {
    return {
      installed,
      definition: null,
      loadStatus: "missing_definition",
      permissions: [],
      actionRegistrations: pluginActions,
      uiRegistrations: pluginUi,
      loadError: {
        pluginKey: row.plugin_key,
        reason: "missing_definition",
        message: "Plugin definition row not found for this installed plugin.",
      },
    };
  }

  const parsed = parseManifest(def.manifest);
  if (!parsed.ok) {
    const fallbackManifest = {
      pluginKey: def.plugin_key,
      name: def.name,
      version: def.current_version,
      permissions: [],
      actions: [],
      events: [],
      uiRegistrations: [],
    };

    return {
      installed,
      definition: {
        id: def.id,
        pluginKey: def.plugin_key,
        name: def.name,
        description: def.description,
        currentVersion: def.current_version,
        manifest: fallbackManifest,
        isInternal: def.is_internal,
      },
      loadStatus: "malformed_manifest",
      permissions: [],
      actionRegistrations: pluginActions,
      uiRegistrations: pluginUi,
      loadError: {
        pluginKey: row.plugin_key,
        reason: "malformed_manifest",
        message: parsed.error,
      },
    };
  }

  const definition: PluginDefinition = {
    id: def.id,
    pluginKey: def.plugin_key,
    name: def.name,
    description: def.description,
    currentVersion: def.current_version,
    manifest: parsed.manifest,
    isInternal: def.is_internal,
  };

  let loadStatus: PluginLoadStatus = "ok";
  if (installed.status === "disabled") loadStatus = "disabled";
  if (installed.status === "error") loadStatus = "error";

  return {
    installed,
    definition,
    loadStatus,
    permissions: parsed.manifest.permissions,
    actionRegistrations: pluginActions,
    uiRegistrations: pluginUi,
    loadError: null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// All installed plugins for the business, including disabled/error/malformed
// rows. Used by the admin Plugins page.
export async function listInstalledPluginsForBusiness(
  businessId: string,
): Promise<AdminPluginRecord[]> {
  try {
    const { installed, definitions, actions, uiRows } =
      await fetchAll(businessId);
    return installed
      .map((row) => buildAdminRecord(row, definitions, actions, uiRows))
      .sort((a, b) =>
        a.installed.pluginKey.localeCompare(b.installed.pluginKey),
      );
  } catch (err) {
    // Top-level fetch failure (network, RLS misconfiguration, etc.) returns
    // an empty list instead of crashing the page. The caller can render an
    // empty-state. Log to server console for debugging.
    console.error("listInstalledPluginsForBusiness failed:", err);
    return [];
  }
}

// Single installed plugin by key.
export async function getInstalledPluginRecord(
  businessId: string,
  pluginKey: string,
): Promise<AdminPluginRecord | null> {
  const all = await listInstalledPluginsForBusiness(businessId);
  return all.find((r) => r.installed.pluginKey === pluginKey) ?? null;
}

// Runtime registry — only successfully loaded, enabled plugins. Load
// errors are surfaced separately on the returned registry.
export async function loadEnabledPluginsForBusiness(
  businessId: string,
): Promise<PluginRegistry> {
  const all = await listInstalledPluginsForBusiness(businessId);

  const plugins: LoadedPlugin[] = [];
  const errors: PluginLoadError[] = [];

  for (const record of all) {
    if (
      record.loadStatus === "ok" &&
      record.installed.status === "enabled" &&
      record.definition
    ) {
      plugins.push({
        installed: record.installed,
        definition: record.definition,
        permissions: record.permissions,
        actionRegistrations: record.actionRegistrations,
        uiRegistrations: record.uiRegistrations,
      });
    } else if (record.loadError) {
      errors.push(record.loadError);
    }
  }

  return { businessId, plugins, errors };
}
