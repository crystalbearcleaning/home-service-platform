import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

import {
  computeCooldownStatus,
  summarizeRouteCooldown,
  type CooldownStopStatus,
  type RouteCooldownSummary,
} from "./cooldown";
import {
  computeRouteShape,
  type RouteMapShape,
} from "./route-map-geometry";

// =========================================================================
// Phase 8B — Server-only loader for /admin/marketing/door-hangers/routes.
//
// Returns everything the future map UI (Phase 8C/8D) needs in one trip:
//   - one row per route, business-scoped
//   - convex-hull polygon OR center+radius circle OR table-only flag
//   - per-route cooldown summary against the supplied reference time
//   - stops grouped by route id, each with status + cooldown status
//   - latest distribution session per route (one summary row)
//
// Strictly read-only. No CRM writes. No RentCast calls. No Google
// Maps calls. No event / activity / notification writes.
//
// Service-role is used because every call site (Server Components on
// `/admin/marketing/door-hangers/routes`) has already verified
// business membership through the active-business resolver.
// =========================================================================

export type { RouteMapShape };

export type RouteMapStop = {
  id: string;
  stopOrder: number | null;
  address: string;
  lat: number | null;
  lng: number | null;
  status: "pending" | "completed" | "skipped" | string;
  completedAt: string | null;
  cooldown: CooldownStopStatus;
};

export type RouteMapLatestSession = {
  id: string;
  distributedAt: string;
  hangersDistributed: number;
  status: "active" | "completed" | "paused" | string;
  mode: "real" | "simulated" | string;
};

export type RouteMapRoute = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  generatedFromSource: "manual" | "rentcast" | string;
  status: "draft" | "ready" | "in_progress" | "completed" | "paused" | string;
  totalRouteStops: number;
  targetHomeCount: number | null;
  estimatedTimeSeconds: number | null;
  cooldownDays: number;
  lastCompletedAt: string | null;
  centerAddress: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number | null;
  createdAt: string;
  shape: RouteMapShape;
  cooldownSummary: RouteCooldownSummary;
  stops: ReadonlyArray<RouteMapStop>;
  latestSession: RouteMapLatestSession | null;
};

export type RouteMapData = {
  referenceTime: string;
  routes: ReadonlyArray<RouteMapRoute>;
};

export type LoadRouteMapDataInput = {
  businessId: string;
  // ISO timestamp. Callers pass the active save's
  // simulated_current_at in simulation workspaces, or now() in real
  // workspaces (use `getDoorHangerRouteMapReferenceTime`).
  referenceTime: string;
};

export async function loadRouteMapData(
  input: LoadRouteMapDataInput,
): Promise<RouteMapData> {
  const empty: RouteMapData = {
    referenceTime: input.referenceTime,
    routes: [],
  };
  if (!input.businessId || !input.referenceTime) return empty;

  const sb = createServiceRoleClient();

  // Fetch routes + linked campaign name in one round trip.
  const { data: routeRows, error: routesErr } = await sb
    .from("door_hanger_routes")
    .select(
      "id,name,campaign_id,generated_from_source,status,total_route_stops," +
        "target_home_count,estimated_time_seconds,cooldown_days," +
        "last_completed_at,center_address,center_lat,center_lng," +
        "radius_miles,created_at," +
        "door_hanger_campaigns!door_hanger_routes_campaign_id_fkey(name)",
    )
    .eq("business_id", input.businessId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (routesErr || !routeRows || routeRows.length === 0) return empty;

  const routeIds = routeRows.map((r) =>
    String((r as unknown as { id: unknown }).id),
  );

  // Fetch all route_stops for these routes in one round trip. The
  // map needs every pin; pagination would defeat the polygon
  // computation.
  const { data: stopRows } = await sb
    .from("door_hanger_route_stops")
    .select(
      "id,route_id,stop_order,address,lat,lng,status,completed_at,created_at",
    )
    .eq("business_id", input.businessId)
    .in("route_id", routeIds)
    .order("stop_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const stopsByRoute = new Map<string, RawStopRow[]>();
  for (const raw of stopRows ?? []) {
    const arr = stopsByRoute.get(String(raw.route_id)) ?? [];
    arr.push(raw as RawStopRow);
    stopsByRoute.set(String(raw.route_id), arr);
  }

  // Fetch the latest session per route. We pull a wider slice and
  // pick the newest per route_id in app code (PostgREST has no clean
  // DISTINCT ON via the JS client).
  const { data: sessionRows } = await sb
    .from("door_hanger_distribution_sessions")
    .select(
      "id,route_id,distributed_at,hangers_distributed,status,mode,created_at",
    )
    .eq("business_id", input.businessId)
    .in("route_id", routeIds)
    .order("distributed_at", { ascending: false })
    .limit(500);

  const latestSessionByRoute = new Map<string, RouteMapLatestSession>();
  for (const raw of sessionRows ?? []) {
    const rid = raw.route_id ? String(raw.route_id) : null;
    if (!rid) continue;
    if (latestSessionByRoute.has(rid)) continue;
    latestSessionByRoute.set(rid, {
      id: String(raw.id),
      distributedAt: String(raw.distributed_at),
      hangersDistributed: Number(raw.hangers_distributed ?? 0),
      status: String(raw.status ?? ""),
      mode: String(raw.mode ?? ""),
    });
  }

  const routes: RouteMapRoute[] = routeRows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const id = String(row.id);
    const cooldownDays = normalizeCooldownDays(row.cooldown_days);
    const centerLat = toNumberOrNull(row.center_lat);
    const centerLng = toNumberOrNull(row.center_lng);
    const radiusMiles = toNumberOrNull(row.radius_miles);

    const rawStops = stopsByRoute.get(id) ?? [];
    const stops = rawStops.map<RouteMapStop>((s) => {
      const lat = toNumberOrNull(s.lat);
      const lng = toNumberOrNull(s.lng);
      const completedAtRaw =
        typeof s.completed_at === "string" ? s.completed_at : null;
      const cooldown = computeCooldownStatus({
        completedAt: completedAtRaw,
        cooldownDays,
        referenceTime: input.referenceTime,
      });
      return {
        id: String(s.id),
        stopOrder:
          s.stop_order === null || s.stop_order === undefined
            ? null
            : Number(s.stop_order),
        address: String(s.address ?? ""),
        lat,
        lng,
        status: String(s.status ?? "pending"),
        completedAt: s.completed_at ? String(s.completed_at) : null,
        cooldown,
      };
    });

    const cooldownSummary = summarizeRouteCooldown({
      stops: stops.map((s) => ({
        status: s.status,
        completedAt: s.completedAt,
      })),
      cooldownDays,
      referenceTime: input.referenceTime,
    });

    const shape = computeRouteShape({
      stops,
      centerLat,
      centerLng,
      radiusMiles,
    });

    const campaignRaw = (row as { door_hanger_campaigns?: unknown }).door_hanger_campaigns;
    const campaignObj = Array.isArray(campaignRaw)
      ? campaignRaw[0]
      : campaignRaw;
    const campaignName =
      campaignObj && typeof campaignObj === "object" && "name" in campaignObj
        ? String(((campaignObj as { name: unknown }).name) ?? "")
        : "";

    return {
      id,
      name: String(row.name ?? ""),
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      campaignName: campaignName.length > 0 ? campaignName : null,
      generatedFromSource: String(row.generated_from_source ?? "manual"),
      status: String(row.status ?? "draft"),
      totalRouteStops: Number(row.total_route_stops ?? 0),
      targetHomeCount: toIntOrNull(row.target_home_count),
      estimatedTimeSeconds: toIntOrNull(row.estimated_time_seconds),
      cooldownDays,
      lastCompletedAt: row.last_completed_at
        ? String(row.last_completed_at)
        : null,
      centerAddress: row.center_address
        ? String(row.center_address)
        : null,
      centerLat,
      centerLng,
      radiusMiles,
      createdAt: String(row.created_at ?? ""),
      shape,
      cooldownSummary,
      stops,
      latestSession: latestSessionByRoute.get(id) ?? null,
    };
  });

  return { referenceTime: input.referenceTime, routes };
}

// -------------------------------------------------------------------------
// Internal types + numeric coercion helpers
// -------------------------------------------------------------------------

type RawStopRow = {
  id: unknown;
  route_id: unknown;
  stop_order: unknown;
  address: unknown;
  lat: unknown;
  lng: unknown;
  status: unknown;
  completed_at: unknown;
  created_at: unknown;
};

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function normalizeCooldownDays(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 60;
  return Math.floor(n);
}
