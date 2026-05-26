import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// Server-only helpers for the Phase 7B simulation_activity table
// (docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md §10).
//
// Read helper uses service-role because the calling Server Component
// has already verified workspace + membership through the existing
// active-business resolver (Phase 6D). Write helper uses service-role
// to match the Pattern B posture of the migration (members SELECT;
// INSERT through controlled server actions only).
//
// No CRM tables are touched here. No events / activities / notifications
// are written. This module is the only entry point for writing to
// simulation_activity — Phase 7D gameplay actions call into here.

export type SimulationActivityRow = {
  id: string;
  business_id: string;
  simulation_run_id: string;
  plugin_key: string | null;
  action_type: string;
  summary: string;
  simulated_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type SimulationActivityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type SimulationActivityInput = {
  businessId: string;
  simulationRunId: string;
  pluginKey?: string | null;
  actionType: string;
  summary: string;
  simulatedAt: string;
  metadata?: Record<string, unknown> | null;
};

// Append one row to simulation_activity. Validates the minimum input
// shape before the DB round-trip; the migration's CHECK constraints
// guard against blank summary / action_type as a defense-in-depth.
export async function appendSimulationActivity(
  input: SimulationActivityInput,
): Promise<SimulationActivityResult<{ activityId: string }>> {
  if (!input.businessId || typeof input.businessId !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "businessId is required." },
    };
  }
  if (!input.simulationRunId || typeof input.simulationRunId !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "simulationRunId is required.",
      },
    };
  }
  const actionType = (input.actionType ?? "").trim();
  if (actionType.length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "actionType is required." },
    };
  }
  const summary = (input.summary ?? "").trim();
  if (summary.length === 0) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "summary is required." },
    };
  }
  if (!input.simulatedAt || Number.isNaN(Date.parse(input.simulatedAt))) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "simulatedAt must be a valid timestamp.",
      },
    };
  }

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("simulation_activity")
    .insert({
      business_id: input.businessId,
      simulation_run_id: input.simulationRunId,
      plugin_key: input.pluginKey ?? null,
      action_type: actionType,
      summary,
      simulated_at: input.simulatedAt,
      metadata: input.metadata ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Insert failed.",
      },
    };
  }
  return { ok: true, data: { activityId: data.id } };
}

// Read the most recent N simulation_activity rows for one save. Sorted
// newest-first by `created_at` (wall-clock) so the play page feed is
// stable even when the simulated clock jumps forward by large amounts.
export async function listSimulationActivityForRun(input: {
  businessId: string;
  simulationRunId: string;
  limit?: number;
}): Promise<SimulationActivityRow[]> {
  if (!input.businessId || !input.simulationRunId) return [];
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT);

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("simulation_activity")
    .select(
      "id, business_id, simulation_run_id, plugin_key, action_type, " +
        "summary, simulated_at, metadata, created_at",
    )
    .eq("business_id", input.businessId)
    .eq("simulation_run_id", input.simulationRunId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as SimulationActivityRow[];
}

function clampLimit(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return DEFAULT_LIMIT;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}
