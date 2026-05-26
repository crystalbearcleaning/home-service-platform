import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  statusesAfterMarkingActive,
  validateSimulationRunForm,
  type SimulationRunFormInput,
  type SimulationRunStatus,
} from "./validation";

export type SimulationActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

// Verifies that `businessId` is a simulation workspace
// (`businesses.is_simulation = true`). The server actions also gate on
// this — keeping the check inside the create helpers means accidental
// misuse from a future call site still fails closed.
async function verifyIsSimulationBusiness(
  businessId: string,
): Promise<{ ok: true } | SimulationActionResult<never>> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("businesses")
    .select("is_simulation")
    .eq("id", businessId)
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: {
        code: "BUSINESS_LOOKUP_FAILED",
        message: error?.message ?? "Active business not found.",
      },
    };
  }
  if (!data.is_simulation) {
    return {
      ok: false,
      error: {
        code: "NOT_SIMULATION_WORKSPACE",
        message: "Simulation saves can only be created in a simulation workspace.",
      },
    };
  }
  return { ok: true };
}

export async function createSimulationRun(input: {
  businessId: string;
  form: SimulationRunFormInput;
  markActive?: boolean;
}): Promise<SimulationActionResult<{ runId: string; status: SimulationRunStatus }>> {
  const v = validateSimulationRunForm(input.form);
  if (!v.ok) {
    const fe: Record<string, string> = {};
    for (const e of v.errors) fe[e.field] = e.message;
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        fieldErrors: fe,
      },
    };
  }

  const sim = await verifyIsSimulationBusiness(input.businessId);
  if (!sim.ok) return sim;

  const wantsActive = Boolean(input.markActive);
  const status: SimulationRunStatus = wantsActive ? "active" : v.data.status;

  const sb = createServiceRoleClient();

  // If creating as active, demote prior active rows BEFORE insert so the
  // single-active-save rule holds even if the user reloads mid-flight.
  if (wantsActive) {
    const demote = await demotePriorActiveRuns(input.businessId);
    if (!demote.ok) return demote;
  }

  const { data, error } = await sb
    .from("simulation_runs")
    .insert({
      business_id: input.businessId,
      name: v.data.name,
      starting_cash_cents: v.data.startingCashCents,
      current_cash_cents: v.data.startingCashCents,
      simulated_start_at: v.data.simulatedStartAt,
      simulated_current_at: v.data.simulatedStartAt,
      status,
      notes: v.data.notes,
    })
    .select("id, status")
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
  return {
    ok: true,
    data: { runId: data.id, status: data.status as SimulationRunStatus },
  };
}

async function demotePriorActiveRuns(
  businessId: string,
): Promise<{ ok: true } | SimulationActionResult<never>> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("simulation_runs")
    .update({ status: "paused" })
    .eq("business_id", businessId)
    .eq("status", "active");
  if (error) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: error.message,
      },
    };
  }
  return { ok: true };
}

export async function markSimulationRunActive(input: {
  businessId: string;
  runId: string;
}): Promise<SimulationActionResult<{ runId: string }>> {
  const sim = await verifyIsSimulationBusiness(input.businessId);
  if (!sim.ok) return sim;

  const sb = createServiceRoleClient();

  // Verify the target run exists and belongs to this business — without
  // this check a caller could promote a run from another workspace.
  const { data: target, error: targetErr } = await sb
    .from("simulation_runs")
    .select("id, business_id, status")
    .eq("id", input.runId)
    .single();
  if (targetErr || !target) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Simulation save not found.",
      },
    };
  }
  if (target.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "WRONG_BUSINESS",
        message: "Simulation save does not belong to the active business.",
      },
    };
  }
  if (target.status === "archived") {
    return {
      ok: false,
      error: {
        code: "ARCHIVED",
        message: "Archived saves cannot be made active.",
      },
    };
  }

  // Load sibling runs so the §5 status-transition rule is a pure decision.
  const { data: siblings, error: sibErr } = await sb
    .from("simulation_runs")
    .select("id, status")
    .eq("business_id", input.businessId);
  if (sibErr || !siblings) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: sibErr?.message ?? "Failed to load simulation saves.",
      },
    };
  }

  const updates = statusesAfterMarkingActive({
    runs: siblings.map((s) => ({
      id: s.id,
      status: s.status as SimulationRunStatus,
    })),
    targetId: input.runId,
  });

  // Apply demotions first, then the promotion. Each row is a single
  // update — Phase 6C doesn't need a real transaction here because the
  // single-active-save rule already holds if either step fails (worst
  // case: zero active saves, which the UI happily surfaces).
  for (const u of updates) {
    if (u.nextStatus === "paused") {
      const { error: e } = await sb
        .from("simulation_runs")
        .update({ status: "paused" })
        .eq("id", u.id)
        .eq("business_id", input.businessId)
        .eq("status", "active");
      if (e) {
        return {
          ok: false,
          error: { code: "DB_ERROR", message: e.message },
        };
      }
    }
  }

  if (target.status !== "active") {
    const { error: pe } = await sb
      .from("simulation_runs")
      .update({ status: "active" })
      .eq("id", input.runId)
      .eq("business_id", input.businessId);
    if (pe) {
      return {
        ok: false,
        error: { code: "DB_ERROR", message: pe.message },
      };
    }
  }

  return { ok: true, data: { runId: input.runId } };
}
