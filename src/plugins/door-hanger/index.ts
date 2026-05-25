// Public barrel for the Phase 5 Door Hanger plugin. Phase 5B-1 ships
// only the plugin identity + schema constants — no runtime code,
// no UI, no actions wired yet.

export {
  DOOR_HANGER_PLUGIN,
  DOOR_HANGER_ROUTES,
  DOOR_HANGER_CAMPAIGN_STATUSES,
  DOOR_HANGER_ROUTE_SOURCES,
  DOOR_HANGER_ROUTE_STATUSES,
  DOOR_HANGER_ROUTE_STOP_STATUSES,
  DOOR_HANGER_SESSION_MODES,
  type DoorHangerCampaignStatus,
  type DoorHangerRouteSource,
  type DoorHangerRouteStatus,
  type DoorHangerRouteStopStatus,
  type DoorHangerSessionMode,
} from "./manifest";
