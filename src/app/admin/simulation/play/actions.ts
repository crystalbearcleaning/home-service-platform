"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  performHangAction,
  type HangActionCappedBy,
  type HangActionKind,
} from "@/core/door-hanger/simulation-hang";
import { startDoorHangerSimulationSession } from "@/core/door-hanger/simulation-start";
import { getActiveSimulationRun } from "@/core/simulation/admin-data";
import { getActiveDoorHangerSimulationSession } from "@/core/simulation/play-page-data";

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

// =========================================================================
// Phase 7D-2 — Hang actions (Hang 1 / Hang custom / Hang route).
//
// All three actions:
//   1. Resolve auth + active simulation save (re-checked server-side).
//   2. Look up the single active simulated session for the save.
//   3. Delegate to performHangAction (which calls the atomic RPC).
//   4. revalidatePath('/admin/simulation/play') + the marketing page
//      (the route status flips on completion).
// =========================================================================

export type HangActionPayload = {
  effectiveCount: number;
  requestedCount: number | null;
  cappedBy: HangActionCappedBy;
  timeAdvancedSeconds: number;
  newSimulatedAt: string;
  routeCompleted: boolean;
  summary: string;
};

async function runHangAction(input: {
  actionKind: HangActionKind;
  requestedCount: number | null;
}): Promise<ActionResult<HangActionPayload>> {
  const auth = await requireActiveSimulationSave();
  if (!auth.ok) return auth;

  const session = await getActiveDoorHangerSimulationSession({
    businessId: auth.businessId,
    simulationRunId: auth.simulationRunId,
  });
  if (!session) {
    return {
      ok: false,
      error: {
        code: "NO_ACTIVE_SESSION",
        message:
          "No active simulated Door Hanger session is open. Start a simulated route first.",
      },
    };
  }

  const result = await performHangAction({
    businessId: auth.businessId,
    simulationRunId: auth.simulationRunId,
    sessionId: session.id,
    actionKind: input.actionKind,
    requestedCount: input.requestedCount,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/simulation/play");
  revalidatePath("/admin/marketing/door-hangers");

  return {
    ok: true,
    data: {
      effectiveCount: result.data.effectiveCount,
      requestedCount: result.data.requestedCount,
      cappedBy: result.data.cappedBy,
      timeAdvancedSeconds: result.data.timeAdvancedSeconds,
      newSimulatedAt: result.data.newSimulatedAt,
      routeCompleted: result.data.routeCompleted,
      summary: result.data.summary,
    },
  };
}

export async function hangOneAction(): Promise<ActionResult<HangActionPayload>> {
  return runHangAction({ actionKind: "hang_one", requestedCount: 1 });
}

export async function hangCustomAction(input: {
  amount: number;
}): Promise<ActionResult<HangActionPayload>> {
  const n = Number(input.amount);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return {
      ok: false,
      error: {
        code: "INVALID_AMOUNT",
        message: "Enter a whole number of 1 or more.",
        fieldErrors: { amount: "Enter 1 or more." },
      },
    };
  }
  return runHangAction({ actionKind: "hang_custom", requestedCount: n });
}

export async function hangRouteAction(): Promise<ActionResult<HangActionPayload>> {
  return runHangAction({ actionKind: "hang_route", requestedCount: null });
}
