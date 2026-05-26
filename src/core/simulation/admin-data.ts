import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import type { SimulationRunStatus } from "./validation";

// Read-side helpers for the Phase 6C simulation saves admin page. Uses
// the service-role client because the calling Server Component has
// already verified business membership through `getActiveBusinessForUser`.

export type SimulationRunRow = {
  id: string;
  business_id: string;
  name: string;
  starting_cash_cents: number;
  current_cash_cents: number;
  simulated_start_at: string;
  simulated_current_at: string;
  status: SimulationRunStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSimulationRuns(
  businessId: string,
): Promise<SimulationRunRow[]> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("simulation_runs")
    .select(
      "id, business_id, name, starting_cash_cents, current_cash_cents, " +
        "simulated_start_at, simulated_current_at, status, notes, " +
        "created_at, updated_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data as unknown as SimulationRunRow[];
}

export async function getActiveSimulationRun(
  businessId: string,
): Promise<SimulationRunRow | null> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("simulation_runs")
    .select(
      "id, business_id, name, starting_cash_cents, current_cash_cents, " +
        "simulated_start_at, simulated_current_at, status, notes, " +
        "created_at, updated_at",
    )
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as unknown as SimulationRunRow;
}
