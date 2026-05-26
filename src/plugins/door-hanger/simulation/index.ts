// Public barrel for the Phase 7 Door Hanger simulation adapter scaffold.
// Phase 7B exposes the adapter manifest + pure helpers only — no
// runtime gameplay handlers (those land in Phase 7D).

export {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  DOOR_HANGER_SECONDS_PER_HANGER_MAX,
  DOOR_HANGER_SECONDS_PER_HANGER_MIN,
  parseSecondsPerHanger,
  type SecondsPerHangerParseResult,
} from "./assumptions";

export {
  DOOR_HANGER_SIMULATION_ACTIONS,
  DOOR_HANGER_SIMULATION_ACTIVITY_TYPES,
  DOOR_HANGER_SIMULATION_ADAPTER,
  isDoorHangerSimulationActionKey,
  isDoorHangerSimulationActivityType,
  type DoorHangerSimulationActionKey,
  type DoorHangerSimulationActivityType,
  type DoorHangerSimulationAdapterManifest,
} from "./adapter";

export {
  computeEffectiveHangCount,
  computeTimeAdvanceSeconds,
  formatDurationSeconds,
  formatHangActivitySummary,
  formatRouteCompletedSummary,
  formatSessionCompletedSummary,
  formatSessionEndedEarlySummary,
  formatSessionStartedSummary,
  isRouteComplete,
  type EffectiveHangCapReason,
  type EffectiveHangCount,
} from "./helpers";
