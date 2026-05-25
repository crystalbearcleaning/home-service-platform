// Plugin identity for the Phase 5B Door Hanger Plugin.
// Kept in sync with the seeded plugin_definitions row
// (supabase/seed/phase_5_seed.sql).
//
// Phase 5B-1 ships only the schema + plugin registration. Admin UI
// (Marketing → Door Hangers), create flows, and RentCast route
// generation come in later steps. The simulation loop is deferred
// to Phase 6+.

export const DOOR_HANGER_PLUGIN = {
  pluginKey: "door_hanger" as const,
  version: "0.1.0",
} as const;

// Source-of-source for the marketing routes the plugin will own once
// Phase 5B-2 lands. Centralised here so the future nav config + UI
// imports the same constant.
export const DOOR_HANGER_ROUTES = {
  dashboard: "/admin/marketing/door-hangers" as const,
} as const;

// Modes that may appear on `door_hanger_distribution_sessions.mode`.
// Phase 5B writes only `real`; `simulated` lands with the Phase 6
// simulation adapter and is included now so the schema constants line
// up with the eventual values.
export const DOOR_HANGER_SESSION_MODES = ["real", "simulated"] as const;
export type DoorHangerSessionMode = (typeof DOOR_HANGER_SESSION_MODES)[number];

// Source values for `door_hanger_routes.generated_from_source`.
export const DOOR_HANGER_ROUTE_SOURCES = ["manual", "rentcast"] as const;
export type DoorHangerRouteSource = (typeof DOOR_HANGER_ROUTE_SOURCES)[number];

// Status taxonomies (mirror the CHECK constraints in the migration).
export const DOOR_HANGER_CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "complete",
] as const;
export type DoorHangerCampaignStatus =
  (typeof DOOR_HANGER_CAMPAIGN_STATUSES)[number];

export const DOOR_HANGER_ROUTE_STATUSES = [
  "draft",
  "ready",
  "in_progress",
  "completed",
  "paused",
] as const;
export type DoorHangerRouteStatus =
  (typeof DOOR_HANGER_ROUTE_STATUSES)[number];

export const DOOR_HANGER_ROUTE_STOP_STATUSES = [
  "pending",
  "completed",
  "skipped",
] as const;
export type DoorHangerRouteStopStatus =
  (typeof DOOR_HANGER_ROUTE_STOP_STATUSES)[number];
