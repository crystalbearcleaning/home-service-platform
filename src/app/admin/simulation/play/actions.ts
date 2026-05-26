"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { startDoorHangerSimulationSession } from "@/core/door-hanger/simulation-start";
import { getActiveSimulationRun } from "@/core/simulation/admin-data";

// =========================================================================
// Phase 7D-1 — /admin/simulation/play server actions.
//
// One action so far: startDoorHangerSimulationSessionAction. It
// resolves auth + active simulation business + active save and
// delegates to the core helper. No Hang actions, no CRM writes, no
// message-engine calls.
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

async function requireActiveSimulationSave(): Promise<
  | {
      ok: true;
      userId: string;
      businessId: string;
      simulationRunId: string;
      simulatedNowIso: string;
    }
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
        message: "Switch to a simulation workspace to play.",
      },
    };
  }
  const activeRun = await getActiveSimulationRun(business.id);
  if (!activeRun) {
    return {
      ok: false,
      error: {
        code: "NO_ACTIVE_SAVE",
        message:
          "No active simulation save. Create or pick one in /admin/simulation first.",
      },
    };
  }
  return {
    ok: true,
    userId: user.id,
    businessId: business.id,
    simulationRunId: activeRun.id,
    simulatedNowIso: activeRun.simulated_current_at,
  };
}

export async function startDoorHangerSimulationSessionAction(input: {
  routeId: string;
  designId: string;
  secondsPerHanger: string | number;
}): Promise<
  ActionResult<{
    sessionId: string;
    routeId: string;
    routeName: string;
    secondsPerHanger: number;
  }>
> {
  const auth = await requireActiveSimulationSave();
  if (!auth.ok) return auth;

  const result = await startDoorHangerSimulationSession({
    businessId: auth.businessId,
    simulationRunId: auth.simulationRunId,
    simulatedNowIso: auth.simulatedNowIso,
    form: {
      routeId: input.routeId,
      designId: input.designId,
      secondsPerHanger: input.secondsPerHanger,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Revalidate the play page (active session card + activity feed)
  // AND the marketing dashboard (route status flipped to in_progress).
  revalidatePath("/admin/simulation/play");
  revalidatePath("/admin/marketing/door-hangers");

  return {
    ok: true,
    data: {
      sessionId: result.data.sessionId,
      routeId: result.data.routeId,
      routeName: result.data.routeName,
      secondsPerHanger: result.data.secondsPerHanger,
    },
  };
}
