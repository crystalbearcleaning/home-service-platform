import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// Server-only loaders for the Phase 5B-2 Door Hanger dashboard.
// One small query per section; nothing fancy.

export type CampaignRow = {
  id: string;
  name: string;
  offerSummary: string | null;
  targetArea: string | null;
  status: string;
  responseRateAssumption: number | null;
  quoteToBookingAssumption: number | null;
  averageJobValueCents: number | null;
  notes: string | null;
  createdAt: string;
};

export type DesignRow = {
  id: string;
  name: string;
  versionOrOffer: string | null;
  quantityReceived: number;
  quantityUsed: number;
  totalPrintCostCents: number | null;
  costPerHangerCents: number | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type RouteRow = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  name: string;
  centerAddress: string | null;
  radiusMiles: number | null;
  targetHomeCount: number | null;
  totalRouteStops: number;
  estimatedTimeSeconds: number | null;
  generatedFromSource: string;
  status: string;
  createdAt: string;
};

export type SessionRow = {
  id: string;
  distributedAt: string;
  campaignId: string | null;
  campaignName: string | null;
  routeId: string | null;
  routeName: string | null;
  designId: string | null;
  designName: string | null;
  hangersDistributed: number;
  timeSpentSeconds: number | null;
  materialCostCents: number | null;
  mode: string;
  notes: string | null;
  createdAt: string;
};

export async function listCampaigns(businessId: string): Promise<CampaignRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_campaigns")
    .select(
      "id,name,offer_summary,target_area,status,response_rate_assumption,quote_to_booking_assumption,average_job_value_cents,notes,created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    offerSummary: r.offer_summary,
    targetArea: r.target_area,
    status: r.status,
    responseRateAssumption: r.response_rate_assumption,
    quoteToBookingAssumption: r.quote_to_booking_assumption,
    averageJobValueCents: r.average_job_value_cents,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export async function listDesigns(businessId: string): Promise<DesignRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_designs")
    .select(
      "id,name,version_or_offer,quantity_received,quantity_used,total_print_cost_cents,cost_per_hanger_cents,received_at,notes,created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    versionOrOffer: r.version_or_offer,
    quantityReceived: r.quantity_received,
    quantityUsed: r.quantity_used,
    totalPrintCostCents: r.total_print_cost_cents,
    costPerHangerCents: r.cost_per_hanger_cents,
    receivedAt: r.received_at,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export async function listRoutes(businessId: string): Promise<RouteRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_routes")
    .select(
      "id,campaign_id,name,center_address,radius_miles,target_home_count,total_route_stops,estimated_time_seconds,generated_from_source,status,created_at,door_hanger_campaigns!door_hanger_routes_campaign_id_fkey(name)",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => {
    const cRaw = (r as { door_hanger_campaigns?: unknown }).door_hanger_campaigns;
    const c = Array.isArray(cRaw) ? cRaw[0] : cRaw;
    const campaignName =
      c && typeof c === "object" && "name" in c
        ? String((c as { name: unknown }).name ?? "")
        : null;
    return {
      id: r.id,
      campaignId: r.campaign_id,
      campaignName: campaignName || null,
      name: r.name,
      centerAddress: r.center_address,
      radiusMiles: r.radius_miles,
      targetHomeCount: r.target_home_count,
      totalRouteStops: r.total_route_stops,
      estimatedTimeSeconds: r.estimated_time_seconds,
      generatedFromSource: r.generated_from_source,
      status: r.status,
      createdAt: r.created_at,
    };
  });
}

export async function listRecentSessions(
  businessId: string,
  limit = 20,
): Promise<SessionRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("door_hanger_distribution_sessions")
    .select(
      "id,distributed_at,campaign_id,route_id,design_id,hangers_distributed,time_spent_seconds,material_cost_cents,mode,notes,created_at,door_hanger_campaigns!door_hanger_distribution_sessions_campaign_id_fkey(name),door_hanger_routes!door_hanger_distribution_sessions_route_id_fkey(name),door_hanger_designs!door_hanger_distribution_sessions_design_id_fkey(name)",
    )
    .eq("business_id", businessId)
    .order("distributed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const oneName = (key: string): string | null => {
      const raw = (r as Record<string, unknown>)[key];
      const obj = Array.isArray(raw) ? raw[0] : raw;
      if (obj && typeof obj === "object" && "name" in obj) {
        const v = (obj as { name: unknown }).name;
        return typeof v === "string" && v.length > 0 ? v : null;
      }
      return null;
    };
    return {
      id: r.id,
      distributedAt: r.distributed_at,
      campaignId: r.campaign_id,
      campaignName: oneName("door_hanger_campaigns"),
      routeId: r.route_id,
      routeName: oneName("door_hanger_routes"),
      designId: r.design_id,
      designName: oneName("door_hanger_designs"),
      hangersDistributed: r.hangers_distributed,
      timeSpentSeconds: r.time_spent_seconds,
      materialCostCents: r.material_cost_cents,
      mode: r.mode,
      notes: r.notes,
      createdAt: r.created_at,
    };
  });
}
