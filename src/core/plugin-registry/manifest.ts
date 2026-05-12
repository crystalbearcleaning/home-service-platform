import { z } from "zod";
import type { PluginManifest } from "./types";

const RiskLevelEnum = z.enum(["low", "medium", "high", "critical"]);
const SurfaceTypeEnum = z.enum(["admin", "customer", "role"]);

const ManifestActionSchema = z.object({
  action_key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  risk_level: RiskLevelEnum.optional(),
  requires_approval: z.boolean().optional(),
});

const ManifestUiSchema = z.object({
  ui_key: z.string(),
  surface_type: SurfaceTypeEnum,
  slot: z.string(),
  component_key: z.string(),
});

export const ManifestSchema = z.object({
  plugin_key: z.string(),
  name: z.string(),
  version: z.string(),
  permissions: z.array(z.string()).default([]),
  actions: z.array(ManifestActionSchema).default([]),
  events: z.array(z.string()).default([]),
  ui_registrations: z.array(ManifestUiSchema).default([]),
});

export type ParseManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; error: string };

// Parse a raw manifest jsonb value. Never throws — returns a discriminated
// union the registry uses to decide whether the plugin loads, fails with
// `malformed_manifest`, or surfaces a softer error to the admin UI.
export function parseManifest(raw: unknown): ParseManifestResult {
  const result = ManifestSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}`
      : "Manifest failed validation";
    return { ok: false, error: message };
  }

  const m = result.data;
  return {
    ok: true,
    manifest: {
      pluginKey: m.plugin_key,
      name: m.name,
      version: m.version,
      permissions: m.permissions,
      actions: m.actions.map((a) => ({
        actionKey: a.action_key,
        name: a.name,
        description: a.description,
        riskLevel: a.risk_level,
        requiresApproval: a.requires_approval,
      })),
      events: m.events,
      uiRegistrations: m.ui_registrations.map((u) => ({
        uiKey: u.ui_key,
        surfaceType: u.surface_type,
        slot: u.slot,
        componentKey: u.component_key,
      })),
    },
  };
}
