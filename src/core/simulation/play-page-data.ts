import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { DOOR_HANGER_PLUGIN } from "@/plugins/door-hanger";

// Server-only read helpers for /admin/simulation/play (Phase 7C).
//
// Strictly read-only. No DB writes. No CRM table writes. No message-
// engine calls. No outcome generation. Everything here is consumed by
// the page renderer to draw the read-only shell.

export type ActiveDoorHangerSessionRow = {
  id: string;
  status: "active" | "completed" | "paused";
  startedAt: string | null;
  endedAt: string | null;
  hangersDistributed: number;
  secondsPerHanger: number | null;
  campaignId: string | null;
  campaignName: string | null;
  routeId: string | null;
  routeName: string | null;
  routeTotalStops: number | null;
  routeTargetHomeCount: number | null;
  designId: string | null;
  designName: string | null;
  designQuantityRemaining: number | null;
  distributedAt: string;
  createdAt: string;
};

// Returns the single active simulated Door Hanger session for a save
// (§9 of the Phase 7 doc — exactly one active session per active save).
// Returns null when no active session exists, or on any read error
// (the play page never raises read errors at the operator).
export async function getActiveDoorHangerSimulationSession(input: {
  businessId: string;
  simulationRunId: string;
}): Promise<ActiveDoorHangerSessionRow | null> {
  if (!input.businessId || !input.simulationRunId) return null;
  const sb = createServiceRoleClient();

  const { data, error } = await sb
    .from("door_hanger_distribution_sessions")
    .select(
      "id,status,started_at,ended_at,hangers_distributed,seconds_per_hanger," +
        "distributed_at,created_at," +
        "campaign_id,route_id,design_id," +
        "door_hanger_campaigns!door_hanger_distribution_sessions_campaign_id_fkey(name)," +
        "door_hanger_routes!door_hanger_distribution_sessions_route_id_fkey(name,total_route_stops,target_home_count)," +
        "door_hanger_designs!door_hanger_distribution_sessions_design_id_fkey(name,quantity_received,quantity_used)",
    )
    .eq("business_id", input.businessId)
    .eq("simulation_run_id", input.simulationRunId)
    .eq("mode", "simulated")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const r = data[0] as unknown as Record<string, unknown>;

  const oneObj = (key: string): Record<string, unknown> | null => {
    const raw = r[key];
    const obj = Array.isArray(raw) ? raw[0] : raw;
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  };
  const camp = oneObj("door_hanger_campaigns");
  const rt = oneObj("door_hanger_routes");
  const dz = oneObj("door_hanger_designs");

  const quantityReceived =
    dz && typeof dz.quantity_received === "number" ? dz.quantity_received : null;
  const quantityUsed =
    dz && typeof dz.quantity_used === "number" ? dz.quantity_used : null;
  const designRemaining =
    quantityReceived !== null && quantityUsed !== null
      ? Math.max(0, quantityReceived - quantityUsed)
      : null;

  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const asNumber = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const status = (r.status as string) ?? "active";

  return {
    id: String(r.id),
    status:
      status === "completed" || status === "paused"
        ? (status as "active" | "completed" | "paused")
        : "active",
    startedAt: asString(r.started_at),
    endedAt: asString(r.ended_at),
    hangersDistributed: asNumber(r.hangers_distributed) ?? 0,
    secondsPerHanger: asNumber(r.seconds_per_hanger),
    campaignId: asString(r.campaign_id),
    campaignName: camp && typeof camp.name === "string" ? camp.name : null,
    routeId: asString(r.route_id),
    routeName: rt && typeof rt.name === "string" ? rt.name : null,
    routeTotalStops:
      rt && typeof rt.total_route_stops === "number"
        ? rt.total_route_stops
        : null,
    routeTargetHomeCount:
      rt && typeof rt.target_home_count === "number"
        ? rt.target_home_count
        : null,
    designId: asString(r.design_id),
    designName: dz && typeof dz.name === "string" ? dz.name : null,
    designQuantityRemaining: designRemaining,
    distributedAt: String(r.distributed_at ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

// -------------------------------------------------------------------------
// Selectable routes + designs for the Start simulated route form
// (Phase 7D-1). Read-only; the server-side Start action re-verifies
// every FK before insert.
// -------------------------------------------------------------------------

export type StartFormRouteOption = {
  id: string;
  name: string;
  status: "draft" | "ready" | "paused";
  generatedFromSource: "manual" | "rentcast";
  totalRouteStops: number;
  targetHomeCount: number | null;
};

export type StartFormDesignOption = {
  id: string;
  name: string;
  quantityRemaining: number;
};

// Routes in a startable status (draft / ready / paused). Excludes
// in_progress and completed — the operator can't start one that's
// already running. Sorted by created_at desc to surface fresh routes.
export async function listSelectableRoutesForStart(
  businessId: string,
): Promise<StartFormRouteOption[]> {
  if (!businessId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_routes")
    .select(
      "id,name,status,generated_from_source,total_route_stops,target_home_count",
    )
    .eq("business_id", businessId)
    .in("status", ["draft", "ready", "paused"])
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as "draft" | "ready" | "paused",
    generatedFromSource: r.generated_from_source as "manual" | "rentcast",
    totalRouteStops: Number(r.total_route_stops ?? 0),
    targetHomeCount:
      r.target_home_count === null || r.target_home_count === undefined
        ? null
        : Number(r.target_home_count),
  }));
}

// Designs with remaining inventory > 0. Computed app-side because
// PostgREST does not support `column > other_column` filters.
export async function listSelectableDesignsForStart(
  businessId: string,
): Promise<StartFormDesignOption[]> {
  if (!businessId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_designs")
    .select("id,name,quantity_received,quantity_used")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []).map((d) => {
    const remaining = Math.max(
      0,
      Number(d.quantity_received ?? 0) - Number(d.quantity_used ?? 0),
    );
    return {
      id: d.id,
      name: d.name,
      quantityRemaining: remaining,
    };
  });
  return rows.filter((r) => r.quantityRemaining > 0);
}

// Is the Door Hanger plugin installed + enabled on this workspace?
// Used to decide whether the play page renders the Door Hanger card.
// Phase 7C only checks `door_hanger`; future plugins with their own
// simulation adapter will register similar checks.
export async function isDoorHangerPluginEnabled(
  businessId: string,
): Promise<boolean> {
  if (!businessId) return false;
  const sb = createServiceRoleClient();

  // Resolve the plugin_definitions.id for `door_hanger` first; the
  // installed_plugins row references that, not the plugin_key directly.
  const { data: def, error: defErr } = await sb
    .from("plugin_definitions")
    .select("id")
    .eq("plugin_key", DOOR_HANGER_PLUGIN.pluginKey)
    .maybeSingle();
  if (defErr || !def) return false;

  const { data: inst, error: instErr } = await sb
    .from("installed_plugins")
    .select("id,status")
    .eq("business_id", businessId)
    .eq("plugin_definition_id", def.id)
    .eq("status", "enabled")
    .maybeSingle();
  if (instErr || !inst) return false;
  return true;
}
