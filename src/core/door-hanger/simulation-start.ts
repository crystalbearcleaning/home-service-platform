import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import { appendSimulationActivity } from "@/core/simulation/activity";
import { DOOR_HANGER_PLUGIN } from "@/plugins/door-hanger";
import {
  formatSessionStartedSummary,
  validateStartSessionForm,
  type StartSessionFormInput,
} from "@/plugins/door-hanger/simulation";

// =========================================================================
// Phase 7D-1 — Door Hanger simulation: Start simulated route / session.
//
// One transactional intent across three writes (the Supabase JS client
// has no native transactions, so writes are ordered + failures are
// surfaced; see "Known limitation" at the bottom of this file):
//
//   1. Insert door_hanger_distribution_sessions row (mode='simulated',
//      status='active', linked to the active save).
//   2. Update door_hanger_routes.status = 'in_progress'.
//   3. Append simulation_activity row "Started route {name}".
//
// This helper does NOT decrement inventory, does NOT advance simulated
// time, does NOT complete route stops, and does NOT write any CRM /
// notification / event / activity rows. Those land in Phase 7D-2+.
// =========================================================================

export type StartSimulationSessionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

export type StartSimulationSessionInput = {
  businessId: string;
  simulationRunId: string;
  simulatedNowIso: string;
  form: StartSessionFormInput;
};

export type StartSimulationSessionData = {
  sessionId: string;
  routeId: string;
  routeName: string;
  designId: string;
  campaignId: string | null;
  secondsPerHanger: number;
  startedAt: string;
};

const ALLOWED_START_STATUSES = new Set(["draft", "ready", "paused"]);

export async function startDoorHangerSimulationSession(
  input: StartSimulationSessionInput,
): Promise<StartSimulationSessionResult<StartSimulationSessionData>> {
  // 1. Pure validation first so the operator gets field-level errors
  //    before any DB round-trip.
  const v = validateStartSessionForm(input.form);
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
  if (!input.simulatedNowIso || Number.isNaN(Date.parse(input.simulatedNowIso))) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "simulatedNowIso must be a valid timestamp.",
      },
    };
  }

  const sb = createServiceRoleClient();

  // 2. Verify Door Hanger plugin is installed + enabled on the active
  //    simulation business. Skips the rest if not — keeps the play
  //    page action symmetrical with `isDoorHangerPluginEnabled`.
  const { data: def } = await sb
    .from("plugin_definitions")
    .select("id")
    .eq("plugin_key", DOOR_HANGER_PLUGIN.pluginKey)
    .maybeSingle();
  if (!def) {
    return {
      ok: false,
      error: {
        code: "PLUGIN_NOT_INSTALLED",
        message: "Door Hanger plugin is not installed on this workspace.",
      },
    };
  }
  const { data: inst } = await sb
    .from("installed_plugins")
    .select("id,status")
    .eq("business_id", input.businessId)
    .eq("plugin_definition_id", def.id)
    .eq("status", "enabled")
    .maybeSingle();
  if (!inst) {
    return {
      ok: false,
      error: {
        code: "PLUGIN_NOT_ENABLED",
        message: "Door Hanger plugin is not enabled on this workspace.",
      },
    };
  }

  // 3. Verify the route belongs to this business and is in a startable
  //    status. Pull the campaign id at the same time so we can attach
  //    it to the session.
  const { data: route, error: routeErr } = await sb
    .from("door_hanger_routes")
    .select("id,business_id,name,status,campaign_id")
    .eq("id", v.data.routeId)
    .maybeSingle();
  if (routeErr) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: routeErr.message },
    };
  }
  if (!route || route.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Route not found for this workspace.",
        fieldErrors: { routeId: "Route not found." },
      },
    };
  }
  if (!ALLOWED_START_STATUSES.has(route.status)) {
    return {
      ok: false,
      error: {
        code: "ROUTE_NOT_STARTABLE",
        message: `Route is ${route.status} — only draft / ready / paused routes can be started.`,
        fieldErrors: { routeId: `Route is ${route.status}.` },
      },
    };
  }

  // 4. Verify the design belongs to this business and has remaining
  //    inventory. Start refuses on zero remaining because the operator
  //    can't even hang one hanger.
  const { data: design, error: designErr } = await sb
    .from("door_hanger_designs")
    .select("id,business_id,quantity_received,quantity_used")
    .eq("id", v.data.designId)
    .maybeSingle();
  if (designErr) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: designErr.message },
    };
  }
  if (!design || design.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Design not found for this workspace.",
        fieldErrors: { designId: "Design not found." },
      },
    };
  }
  const remaining = Math.max(
    0,
    Number(design.quantity_received ?? 0) - Number(design.quantity_used ?? 0),
  );
  if (remaining <= 0) {
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_INVENTORY",
        message: "This design has no remaining inventory.",
        fieldErrors: { designId: "No inventory remaining." },
      },
    };
  }

  // 5. Enforce one-active-session-per-save rule (§9 of the Phase 7
  //    doc). Phase 7B added the `simulation_run_id` + `status` columns
  //    that this check uses.
  const { data: existing, error: existingErr } = await sb
    .from("door_hanger_distribution_sessions")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("simulation_run_id", input.simulationRunId)
    .eq("mode", "simulated")
    .eq("status", "active")
    .limit(1);
  if (existingErr) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: existingErr.message },
    };
  }
  if (existing && existing.length > 0) {
    return {
      ok: false,
      error: {
        code: "SESSION_ALREADY_ACTIVE",
        message:
          "A simulated Door Hanger session is already active for this save. Finish or pause it before starting another.",
      },
    };
  }

  // 6. Insert the session. distributed_at + started_at both use the
  //    simulated clock — wall-clock is irrelevant for play.
  const { data: session, error: insertErr } = await sb
    .from("door_hanger_distribution_sessions")
    .insert({
      business_id: input.businessId,
      simulation_run_id: input.simulationRunId,
      campaign_id: route.campaign_id ?? null,
      route_id: route.id,
      design_id: design.id,
      distributed_at: input.simulatedNowIso,
      started_at: input.simulatedNowIso,
      hangers_distributed: 0,
      time_spent_seconds: 0,
      material_cost_cents: null,
      mode: "simulated",
      status: "active",
      seconds_per_hanger: v.data.secondsPerHanger,
    })
    .select("id")
    .single();
  if (insertErr || !session) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: insertErr?.message ?? "Session insert failed.",
      },
    };
  }

  // 7. Flip the route to in_progress. Soft-fail — a stale route status
  //    is recoverable, the session row is what gates further play.
  const { error: routeUpdErr } = await sb
    .from("door_hanger_routes")
    .update({ status: "in_progress" })
    .eq("id", route.id)
    .eq("business_id", input.businessId);
  if (routeUpdErr) {
    return {
      ok: false,
      error: {
        code: "ROUTE_UPDATE_FAILED",
        message: `Session was started (id ${session.id}) but route status update failed: ${routeUpdErr.message}`,
      },
    };
  }

  // 8. Write the activity row. Soft-fail by design — a missing activity
  //    row does not invalidate the session. The play page survives.
  const activity = await appendSimulationActivity({
    businessId: input.businessId,
    simulationRunId: input.simulationRunId,
    pluginKey: DOOR_HANGER_PLUGIN.pluginKey,
    actionType: "door_hanger.session_started",
    summary: formatSessionStartedSummary(route.name),
    simulatedAt: input.simulatedNowIso,
    metadata: {
      session_id: session.id,
      route_id: route.id,
      design_id: design.id,
      seconds_per_hanger: v.data.secondsPerHanger,
    },
  });
  if (!activity.ok) {
    // Return success-with-warning shape would be nicer; for now the
    // session is real, the route is in_progress, and the activity feed
    // will just be missing one row. Surface a soft warning code.
    return {
      ok: false,
      error: {
        code: "ACTIVITY_LOG_FAILED",
        message: `Session was started but activity log insert failed: ${activity.error.message}`,
      },
    };
  }

  return {
    ok: true,
    data: {
      sessionId: session.id,
      routeId: route.id,
      routeName: route.name,
      designId: design.id,
      campaignId: route.campaign_id ?? null,
      secondsPerHanger: v.data.secondsPerHanger,
      startedAt: input.simulatedNowIso,
    },
  };
}

// =========================================================================
// Known limitation
//
// Steps 6–8 are not wrapped in a real DB transaction — the Supabase JS
// client doesn't expose one and the existing project pattern (see
// Phase 5B's createDistributionSession + inventory update) accepts the
// same posture. The worst case here is:
//
//   - Step 6 (session insert) succeeds, step 7 (route status update)
//     fails  → session is active, route still draft. Hang actions
//     still work against the session; the route badge is stale.
//   - Steps 6+7 succeed, step 8 (activity insert) fails  → session is
//     active + visible in the play page, the feed is missing one row.
//
// Phase 7D-2 may add an RPC-based transaction once the Hang actions
// land (their inventory + clock + stop completion must be atomic).
// =========================================================================
