import { redirect } from "next/navigation";

import {
  AdminShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  renderSimulationBanner,
  renderWorkspaceSwitcher,
  resolveAdminShellContext,
} from "@/components/admin";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { getDoorHangerRouteMapReferenceTime } from "@/core/door-hanger/cooldown";
import { loadRouteMapData } from "@/core/door-hanger/route-map-data";
import { getActiveSimulationRun } from "@/core/simulation/admin-data";

import { SignOutButton } from "../../../sign-out-button";
import { RouteMap, type MapRouteFull } from "./route-map";

export const dynamic = "force-dynamic";

export default async function DoorHangerRoutesMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  // Cooldown reference time: real → now(); sim + save → simulated
  // clock; sim + no save → now() with a soft notice.
  const activeSimRun = business.isSimulation
    ? await getActiveSimulationRun(business.id)
    : null;
  const refTime = getDoorHangerRouteMapReferenceTime({
    isSimulation: business.isSimulation,
    activeSave: activeSimRun
      ? { simulatedCurrentAt: activeSimRun.simulated_current_at }
      : null,
  });

  const data = await loadRouteMapData({
    businessId: business.id,
    referenceTime: refTime.referenceTime,
  });

  const routesWithGeometry = data.routes.filter(
    (r) => r.shape.kind !== "none",
  );
  const tableOnlyRouteCount = data.routes.length - routesWithGeometry.length;

  // Pass ALL routes to the client — even table-only ones — so the
  // routes table overlay can list them too. The map skips drawing for
  // shape.kind === "none".
  const mapRoutes: MapRouteFull[] = data.routes.map((r) => ({
    id: r.id,
    name: r.name,
    campaignName: r.campaignName,
    generatedFromSource: r.generatedFromSource,
    status: r.status,
    totalRouteStops: r.totalRouteStops,
    cooldownDays: r.cooldownDays,
    lastCompletedAt: r.lastCompletedAt,
    centerAddress: r.centerAddress,
    radiusMiles: r.radiusMiles,
    estimatedTimeSeconds: r.estimatedTimeSeconds,
    shape: r.shape,
    cooldownSummary: r.cooldownSummary,
    stops: r.stops.map((s) => ({
      id: s.id,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      status: s.status,
      completedAt: s.completedAt,
      cooldown: s.cooldown,
    })),
    latestSession: r.latestSession
      ? {
          id: r.latestSession.id,
          distributedAt: r.latestSession.distributedAt,
          hangersDistributed: r.latestSession.hangersDistributed,
          status: r.latestSession.status,
          mode: r.latestSession.mode,
        }
      : null,
  }));

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader
        eyebrow="Marketing · Door Hangers"
        title="Routes (map)"
        description="See saved Door Hanger routes geographically. Click a route shape for a quick stats overlay. Overlays + Generate Route ship in later Phase 8 steps."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <StatusBadge tone="neutral">
          {data.routes.length} route{data.routes.length === 1 ? "" : "s"}
        </StatusBadge>
        <StatusBadge tone="neutral">
          {routesWithGeometry.length} on map
        </StatusBadge>
        {tableOnlyRouteCount > 0 && (
          <StatusBadge tone="warning">
            {tableOnlyRouteCount} table-only (no geometry)
          </StatusBadge>
        )}
        {refTime.source === "simulated_clock" && (
          <StatusBadge tone="success">
            Cooldown: simulated clock
          </StatusBadge>
        )}
        {refTime.source === "fallback_now_no_active_save" && (
          <StatusBadge tone="warning">
            Cooldown: wall-clock (no active save)
          </StatusBadge>
        )}
      </div>

      {data.routes.length === 0 ? (
        <SectionCard
          title="No routes yet"
          description="Create or generate a route in the Door Hanger dashboard first."
        >
          <EmptyState
            title="Nothing to map"
            description="Once you create a manual route or generate one from a center address, it will show up here."
          />
        </SectionCard>
      ) : (
        <div className="h-[70vh] min-h-[480px] w-full">
          <RouteMap routes={mapRoutes} />
        </div>
      )}

      {tableOnlyRouteCount > 0 && (
        <p className="mt-3 text-[11px] text-ink-faint">
          {tableOnlyRouteCount} route
          {tableOnlyRouteCount === 1 ? "" : "s"} have no usable geometry
          (no route stops with lat/lng and no center+radius). They&apos;ll
          appear in the routes table overlay (Phase 8D) but cannot be
          drawn on the map.
        </p>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">
        Reference time:{" "}
        <code>{data.referenceTime}</code> · source{" "}
        <code>{refTime.source}</code>. Cooldown counts in the route
        details overlay use this reference.
      </p>
    </AdminShell>
  );
}
