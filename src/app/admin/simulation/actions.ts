"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  createSimulationRun,
  markSimulationRunActive,
} from "@/core/simulation/admin-create";

// =========================================================================
// Phase 6C simulation saves admin server actions.
// Auth + business-scoped; service-role writes via the core helpers.
// Create + mark-active only — no edit / delete / archive flows.
// =========================================================================

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

async function requireSimulationBusiness(): Promise<
  | { ok: true; userId: string; businessId: string }
  | { ok: false; error: { code: string; message: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign-in required." },
    };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  if (!business.isSimulation) {
    return {
      ok: false,
      error: {
        code: "NOT_SIMULATION_WORKSPACE",
        message:
          "Switch to a simulation workspace to manage saves. Workspace switching ships in Phase 6D.",
      },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

function revalidate() {
  revalidatePath("/admin/simulation");
}

export async function createSimulationRunAction(input: {
  name: string;
  startingCashDollars: string;
  simulatedStartAt: string;
  notes?: string | null;
  markActive?: boolean;
}): Promise<ActionResult<{ runId: string; status: string }>> {
  const auth = await requireSimulationBusiness();
  if (!auth.ok) return auth;

  const result = await createSimulationRun({
    businessId: auth.businessId,
    form: {
      name: input.name,
      startingCashDollars: input.startingCashDollars,
      simulatedStartAt: input.simulatedStartAt,
      notes: input.notes ?? null,
      status: input.markActive ? "active" : "draft",
    },
    markActive: Boolean(input.markActive),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}

export async function markSimulationRunActiveAction(input: {
  runId: string;
}): Promise<ActionResult<{ runId: string }>> {
  const auth = await requireSimulationBusiness();
  if (!auth.ok) return auth;
  const result = await markSimulationRunActive({
    businessId: auth.businessId,
    runId: input.runId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}
