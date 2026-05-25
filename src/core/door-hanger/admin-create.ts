import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  computeCostPerHangerCents,
  computeMaterialCostCents,
} from "./calculations";
import {
  hasEnoughInventory,
  validateCampaign,
  validateDesign,
  validateRoute,
  validateSession,
  type CampaignFormInput,
  type DesignFormInput,
  type RouteFormInput,
  type SessionFormInput,
} from "./validation";

// =========================================================================
// Server-only create helpers for the Phase 5B-2 Door Hanger admin.
// Every helper:
//   - validates pure input via ./validation
//   - verifies business ownership when touching FK rows
//   - inserts via service-role
//   - returns a discriminated result; never throws
//
// Inventory maintenance for distribution sessions is app-level:
//   - check remaining inventory before insert
//   - insert session row
//   - update door_hanger_designs.quantity_used in the same handler
// (Phase 5B-1 deliberately did not add a DB trigger; Phase 5B-2 keeps
// the maintenance logic visible in code.)
// =========================================================================

export type CreateResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

function validationFail<T>(errors: { field: string; message: string }[]): CreateResult<T> {
  const fe: Record<string, string> = {};
  for (const e of errors) fe[e.field] = e.message;
  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "One or more fields are invalid.",
      fieldErrors: fe,
    },
  };
}

// -------------------------------------------------------------------------
// Campaign
// -------------------------------------------------------------------------
export async function createCampaign(input: {
  businessId: string;
  form: CampaignFormInput;
}): Promise<CreateResult<{ campaignId: string }>> {
  const v = validateCampaign(input.form);
  if (!v.ok) return validationFail(v.errors);

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("door_hanger_campaigns")
    .insert({
      business_id: input.businessId,
      name: v.data.name,
      offer_summary: v.data.offerSummary,
      target_area: v.data.targetArea,
      status: v.data.status,
      response_rate_assumption: v.data.responseRateAssumption,
      quote_to_booking_assumption: v.data.quoteToBookingAssumption,
      average_job_value_cents: v.data.averageJobValueCents,
      notes: v.data.notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error?.message ?? "Insert failed." },
    };
  }
  return { ok: true, data: { campaignId: data.id } };
}

// -------------------------------------------------------------------------
// Inventory / design
// -------------------------------------------------------------------------
export async function createDesign(input: {
  businessId: string;
  form: DesignFormInput;
}): Promise<CreateResult<{ designId: string }>> {
  const v = validateDesign(input.form);
  if (!v.ok) return validationFail(v.errors);

  const costPerHanger = computeCostPerHangerCents({
    totalPrintCostCents: v.data.totalPrintCostCents,
    quantityReceived: v.data.quantityReceived,
  });

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("door_hanger_designs")
    .insert({
      business_id: input.businessId,
      name: v.data.name,
      version_or_offer: v.data.versionOrOffer,
      quantity_received: v.data.quantityReceived,
      quantity_used: 0,
      total_print_cost_cents: v.data.totalPrintCostCents,
      cost_per_hanger_cents: costPerHanger,
      received_at: v.data.receivedAt,
      notes: v.data.notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error?.message ?? "Insert failed." },
    };
  }
  return { ok: true, data: { designId: data.id } };
}

// -------------------------------------------------------------------------
// Manual route shell
// -------------------------------------------------------------------------
export async function createManualRoute(input: {
  businessId: string;
  form: RouteFormInput;
}): Promise<CreateResult<{ routeId: string }>> {
  const v = validateRoute(input.form);
  if (!v.ok) return validationFail(v.errors);

  const sb = createServiceRoleClient();

  if (v.data.campaignId) {
    const { data: c } = await sb
      .from("door_hanger_campaigns")
      .select("id,business_id")
      .eq("id", v.data.campaignId)
      .maybeSingle();
    if (!c || c.business_id !== input.businessId) {
      return {
        ok: false,
        error: {
          code: "FOREIGN_BUSINESS",
          message: "Campaign not found for this business.",
          fieldErrors: { campaignId: "Campaign not found." },
        },
      };
    }
  }

  const { data, error } = await sb
    .from("door_hanger_routes")
    .insert({
      business_id: input.businessId,
      campaign_id: v.data.campaignId,
      name: v.data.name,
      center_address: v.data.centerAddress,
      radius_miles: v.data.radiusMiles,
      target_home_count: v.data.targetHomeCount,
      generated_from_source: "manual",
      status: v.data.status,
      total_route_stops: 0,
      estimated_time_seconds: v.data.estimatedTimeSeconds,
      notes: v.data.notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error?.message ?? "Insert failed." },
    };
  }
  return { ok: true, data: { routeId: data.id } };
}

// -------------------------------------------------------------------------
// Distribution session — also maintains design.quantity_used
// -------------------------------------------------------------------------
export async function createDistributionSession(input: {
  businessId: string;
  form: SessionFormInput;
}): Promise<
  CreateResult<{
    sessionId: string;
    materialCostCents: number | null;
    newQuantityUsed: number;
    newQuantityRemaining: number;
  }>
> {
  const v = validateSession(input.form);
  if (!v.ok) return validationFail(v.errors);

  const sb = createServiceRoleClient();

  // Verify all three FKs belong to this business + load design counts.
  const [campaignRes, routeRes, designRes] = await Promise.all([
    sb
      .from("door_hanger_campaigns")
      .select("id,business_id")
      .eq("id", v.data.campaignId)
      .maybeSingle(),
    sb
      .from("door_hanger_routes")
      .select("id,business_id")
      .eq("id", v.data.routeId)
      .maybeSingle(),
    sb
      .from("door_hanger_designs")
      .select("id,business_id,quantity_received,quantity_used,cost_per_hanger_cents")
      .eq("id", v.data.designId)
      .maybeSingle(),
  ]);

  if (!campaignRes.data || campaignRes.data.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Campaign not found for this business.",
        fieldErrors: { campaignId: "Campaign not found." },
      },
    };
  }
  if (!routeRes.data || routeRes.data.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Route not found for this business.",
        fieldErrors: { routeId: "Route not found." },
      },
    };
  }
  if (!designRes.data || designRes.data.business_id !== input.businessId) {
    return {
      ok: false,
      error: {
        code: "FOREIGN_BUSINESS",
        message: "Design not found for this business.",
        fieldErrors: { designId: "Design not found." },
      },
    };
  }

  const design = designRes.data;

  if (
    !hasEnoughInventory({
      quantityReceived: design.quantity_received,
      quantityUsed: design.quantity_used,
      hangersDistributed: v.data.hangersDistributed,
    })
  ) {
    const remaining = Math.max(
      0,
      design.quantity_received - design.quantity_used,
    );
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_INVENTORY",
        message: `Only ${remaining} hangers remaining for this design.`,
        fieldErrors: {
          hangersDistributed: `Only ${remaining} hangers remaining.`,
        },
      },
    };
  }

  const materialCostCents = computeMaterialCostCents({
    hangersDistributed: v.data.hangersDistributed,
    costPerHangerCents: design.cost_per_hanger_cents,
  });

  const { data: inserted, error: insertErr } = await sb
    .from("door_hanger_distribution_sessions")
    .insert({
      business_id: input.businessId,
      campaign_id: v.data.campaignId,
      route_id: v.data.routeId,
      design_id: v.data.designId,
      distributed_at: v.data.distributedAt,
      hangers_distributed: v.data.hangersDistributed,
      time_spent_seconds: v.data.timeSpentSeconds,
      material_cost_cents: materialCostCents,
      notes: v.data.notes,
      mode: "real",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: insertErr?.message ?? "Insert failed.",
      },
    };
  }

  // App-level inventory maintenance. The design's quantity_used is
  // bumped after the session insert; the CHECK quantity_used <=
  // quantity_received guards against an unexpected race. If the update
  // fails, we surface the error but the session row has already
  // landed.
  const newQuantityUsed = design.quantity_used + v.data.hangersDistributed;
  const { error: updErr } = await sb
    .from("door_hanger_designs")
    .update({ quantity_used: newQuantityUsed })
    .eq("id", v.data.designId)
    .eq("business_id", input.businessId);
  if (updErr) {
    return {
      ok: false,
      error: {
        code: "INVENTORY_UPDATE_FAILED",
        message: `Session was logged (id ${inserted.id}) but inventory update failed: ${updErr.message}`,
      },
    };
  }

  return {
    ok: true,
    data: {
      sessionId: inserted.id,
      materialCostCents,
      newQuantityUsed,
      newQuantityRemaining: design.quantity_received - newQuantityUsed,
    },
  };
}
