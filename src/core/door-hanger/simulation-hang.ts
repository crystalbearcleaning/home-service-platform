import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Phase 7D-2 — Door Hanger simulation Hang actions.
//
// Thin wrapper around the `door_hanger_simulation_hang` Postgres
// function (migration `20260528120000_phase_7_door_hanger_hang_rpc.sql`).
// All gameplay state mutations live inside the RPC because they must
// be atomic; this file only marshals input/output and maps known
// `raise exception` codes to structured TS errors.
//
// No CRM writes. No message-engine calls. No event publishing.
// =========================================================================

export type HangActionKind = "hang_one" | "hang_custom" | "hang_route";

export type HangActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

export type HangActionCappedBy = "INVENTORY" | "STOPS" | null;

export type HangActionData = {
  effectiveCount: number;
  requestedCount: number | null;
  cappedBy: HangActionCappedBy;
  timeAdvancedSeconds: number;
  newSimulatedAt: string;
  routeCompleted: boolean;
  summary: string;
  activityId: string;
  routeCompletedActivityId: string | null;
  sessionCompletedActivityId: string | null;
};

export type HangActionInput = {
  businessId: string;
  simulationRunId: string;
  sessionId: string;
  actionKind: HangActionKind;
  // Required for hang_custom; ignored for hang_one (forced to 1) and
  // hang_route (the RPC reads the route's remaining target).
  requestedCount?: number | null;
};

// Map of PG raise-exception text → structured error code surfaced to
// the operator. Keep aligned with the RPC's `raise exception` calls.
const KNOWN_ERROR_CODES = new Set([
  "INVALID_INPUT",
  "INVALID_ACTION_KIND",
  "INVALID_AMOUNT",
  "NO_ACTIVE_SESSION",
  "NO_ACTIVE_SAVE",
  "SESSION_MISSING_SECONDS_PER_HANGER",
  "SESSION_MISSING_DESIGN",
  "SESSION_MISSING_ROUTE",
  "DESIGN_NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "INSUFFICIENT_INVENTORY",
  "ROUTE_ALREADY_COMPLETE",
]);

const FRIENDLY_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "One or more inputs are missing.",
  INVALID_ACTION_KIND: "Unknown Hang action.",
  INVALID_AMOUNT: "Pick an amount of 1 or more.",
  NO_ACTIVE_SESSION:
    "No active simulated Door Hanger session is open for this save.",
  NO_ACTIVE_SAVE: "The active simulation save was not found.",
  SESSION_MISSING_SECONDS_PER_HANGER:
    "The active session is missing seconds_per_hanger. Start a new session.",
  SESSION_MISSING_DESIGN: "The active session is not linked to a design.",
  SESSION_MISSING_ROUTE: "The active session is not linked to a route.",
  DESIGN_NOT_FOUND: "Inventory design was not found.",
  ROUTE_NOT_FOUND: "Route was not found.",
  INSUFFICIENT_INVENTORY: "No remaining inventory on this design.",
  ROUTE_ALREADY_COMPLETE: "This route is already complete.",
};

export async function performHangAction(
  input: HangActionInput,
): Promise<HangActionResult<HangActionData>> {
  if (!input.businessId || !input.simulationRunId || !input.sessionId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Missing required identifiers.",
      },
    };
  }
  if (input.actionKind === "hang_custom") {
    const n = Number(input.requestedCount);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return {
        ok: false,
        error: {
          code: "INVALID_AMOUNT",
          message: "Pick a whole number of 1 or more.",
          fieldErrors: { requestedCount: "Enter 1 or more." },
        },
      };
    }
  }

  // Hang 1 ignores any requested_count; Hang Route ignores it too (the
  // RPC reads remaining target from the route). We pass 1 / null
  // respectively so the RPC's `p_requested_count` is well-defined.
  let rpcRequested: number | null;
  if (input.actionKind === "hang_one") rpcRequested = 1;
  else if (input.actionKind === "hang_route") rpcRequested = null;
  else rpcRequested = Number(input.requestedCount);

  const sb = createServiceRoleClient();
  const { data, error } = await sb.rpc("door_hanger_simulation_hang", {
    p_business_id: input.businessId,
    p_simulation_run_id: input.simulationRunId,
    p_session_id: input.sessionId,
    p_action_kind: input.actionKind,
    p_requested_count: rpcRequested,
  });

  if (error) {
    // PG `raise exception 'CODE'` shows up here as `error.message`
    // containing the code. We surface a friendly message + the raw
    // code so the UI can switch on either.
    const raw = (error.message ?? "").trim();
    const code = KNOWN_ERROR_CODES.has(raw) ? raw : "DB_ERROR";
    const message =
      FRIENDLY_MESSAGES[code] ??
      (raw.length > 0 ? raw : "Hang action failed.");
    return {
      ok: false,
      error: { code, message },
    };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Hang action returned no data.",
      },
    };
  }

  const r = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      effectiveCount: Number(r.effective_count ?? 0),
      requestedCount:
        r.requested_count === null || r.requested_count === undefined
          ? null
          : Number(r.requested_count),
      cappedBy: normalizeCappedBy(r.capped_by),
      timeAdvancedSeconds: Number(r.time_advanced_seconds ?? 0),
      newSimulatedAt: String(r.new_simulated_at ?? ""),
      routeCompleted: r.route_completed === true,
      summary: String(r.summary ?? ""),
      activityId: String(r.activity_id ?? ""),
      routeCompletedActivityId:
        typeof r.route_completed_activity_id === "string"
          ? r.route_completed_activity_id
          : null,
      sessionCompletedActivityId:
        typeof r.session_completed_activity_id === "string"
          ? r.session_completed_activity_id
          : null,
    },
  };
}

function normalizeCappedBy(v: unknown): HangActionCappedBy {
  if (v === "INVENTORY" || v === "STOPS") return v;
  return null;
}
