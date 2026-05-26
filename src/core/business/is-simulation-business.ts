import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// Phase 6D — server-side lookup used by adapters (SMS first; email /
// payments / future integrations later) to decide whether to skip a
// real external side effect because the active business is a
// simulation workspace.
//
// Returns a discriminated result so callers can distinguish "this is a
// simulation workspace, skip" from "lookup failed, treat as
// non-simulation and fail-safe to current behavior".

export type SimulationLookup =
  | { ok: true; isSimulation: boolean }
  | { ok: false; error: { code: string; message: string } };

export async function lookupBusinessIsSimulation(
  businessId: string,
): Promise<SimulationLookup> {
  if (!businessId || typeof businessId !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "businessId is required." },
    };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message: err instanceof Error ? err.message : "Service-role client failed.",
      },
    };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("is_simulation")
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error?.message ?? "Business not found.",
      },
    };
  }

  return {
    ok: true,
    isSimulation: Boolean((data as { is_simulation?: unknown }).is_simulation),
  };
}

// Pure decision helper — exposed for testing the SMS-guardrail logic
// without a database. If the lookup failed, we fall through to the
// existing send path (fail-safe to current behavior); only a confirmed
// `isSimulation = true` triggers the short-circuit.
export function shouldSkipForSimulation(lookup: SimulationLookup): boolean {
  return lookup.ok === true && lookup.isSimulation === true;
}
