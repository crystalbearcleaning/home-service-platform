// Door Hanger Plugin — Phase 7 simulation adapter scaffold.
//
// Phase 7B ships the adapter identity + action key taxonomy + pure
// assumption helpers. Gameplay actions (Start simulated route / Hang 1
// / Hang custom / Hang route / Finish) are wired in Phase 7D.
//
// This file deliberately does NOT mutate any DB state. It documents
// the adapter's surface so Phase 7C can render an "available actions"
// card and Phase 7D can wire the action handlers.

import { DOOR_HANGER_PLUGIN } from "../manifest";
import {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  DOOR_HANGER_SECONDS_PER_HANGER_MAX,
  DOOR_HANGER_SECONDS_PER_HANGER_MIN,
} from "./assumptions";

// -------------------------------------------------------------------------
// Action key taxonomy (§5 of the Phase 7 doc)
// -------------------------------------------------------------------------
export const DOOR_HANGER_SIMULATION_ACTIONS = [
  "start_route",
  "hang_one",
  "hang_custom",
  "hang_route",
  "finish_route",
] as const;

export type DoorHangerSimulationActionKey =
  (typeof DOOR_HANGER_SIMULATION_ACTIONS)[number];

// -------------------------------------------------------------------------
// Activity action_type taxonomy (§10.2 of the Phase 7 doc)
// -------------------------------------------------------------------------
// These are the values written into simulation_activity.action_type for
// Door Hanger gameplay rows. Folded variants of `time_advanced` and
// `inventory_used` are intentionally omitted in Phase 7B — Phase 7D
// decides whether to surface them separately or roll into the
// hang-action summary.
export const DOOR_HANGER_SIMULATION_ACTIVITY_TYPES = [
  "door_hanger.session_started",
  "door_hanger.hang_one",
  "door_hanger.hang_custom",
  "door_hanger.hang_route",
  "door_hanger.route_completed",
  "door_hanger.session_completed",
  "door_hanger.session_ended_early",
] as const;

export type DoorHangerSimulationActivityType =
  (typeof DOOR_HANGER_SIMULATION_ACTIVITY_TYPES)[number];

// -------------------------------------------------------------------------
// Adapter manifest
// -------------------------------------------------------------------------
// Read-only object describing the Door Hanger simulation adapter.
// Phase 7C renders this on `/admin/simulation/play`. Future plugins
// that grow a simulation adapter will export a parallel manifest.

export type DoorHangerSimulationAdapterManifest = {
  readonly pluginKey: typeof DOOR_HANGER_PLUGIN.pluginKey;
  readonly pluginVersion: typeof DOOR_HANGER_PLUGIN.version;
  readonly actions: readonly DoorHangerSimulationActionKey[];
  readonly activityTypes: readonly DoorHangerSimulationActivityType[];
  readonly defaultSecondsPerHanger: typeof DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER;
  readonly secondsPerHangerRange: {
    readonly min: typeof DOOR_HANGER_SECONDS_PER_HANGER_MIN;
    readonly max: typeof DOOR_HANGER_SECONDS_PER_HANGER_MAX;
  };
};

export const DOOR_HANGER_SIMULATION_ADAPTER: DoorHangerSimulationAdapterManifest =
  {
    pluginKey: DOOR_HANGER_PLUGIN.pluginKey,
    pluginVersion: DOOR_HANGER_PLUGIN.version,
    actions: DOOR_HANGER_SIMULATION_ACTIONS,
    activityTypes: DOOR_HANGER_SIMULATION_ACTIVITY_TYPES,
    defaultSecondsPerHanger: DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
    secondsPerHangerRange: {
      min: DOOR_HANGER_SECONDS_PER_HANGER_MIN,
      max: DOOR_HANGER_SECONDS_PER_HANGER_MAX,
    },
  } as const;

export function isDoorHangerSimulationActionKey(
  value: unknown,
): value is DoorHangerSimulationActionKey {
  return (
    typeof value === "string" &&
    (DOOR_HANGER_SIMULATION_ACTIONS as readonly string[]).includes(value)
  );
}

export function isDoorHangerSimulationActivityType(
  value: unknown,
): value is DoorHangerSimulationActivityType {
  return (
    typeof value === "string" &&
    (DOOR_HANGER_SIMULATION_ACTIVITY_TYPES as readonly string[]).includes(value)
  );
}
