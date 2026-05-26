// Door Hanger Plugin — Phase 7 simulation assumptions.
//
// Defaults documented in:
//   docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md §11
//   docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md §8
//
// Pure module — no DB, no env, no `server-only` import. Safe to import
// from client components if a future preview UI needs the defaults.

export const DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER = 30 as const;

export const DOOR_HANGER_SECONDS_PER_HANGER_MIN = 1 as const;
export const DOOR_HANGER_SECONDS_PER_HANGER_MAX = 600 as const;

export type SecondsPerHangerParseResult =
  | { ok: true; secondsPerHanger: number }
  | {
      ok: false;
      reason: "EMPTY" | "NOT_A_NUMBER" | "NOT_AN_INTEGER" | "OUT_OF_RANGE";
    };

// Parses an operator-entered seconds-per-hanger value. Empty / nullish
// inputs return EMPTY so the caller can decide whether to fall back to
// `DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER`.
export function parseSecondsPerHanger(
  raw: string | number | null | undefined,
): SecondsPerHangerParseResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "EMPTY" };
  const str = typeof raw === "number" ? String(raw) : raw.trim();
  if (str.length === 0) return { ok: false, reason: "EMPTY" };
  const n = Number(str);
  if (!Number.isFinite(n)) return { ok: false, reason: "NOT_A_NUMBER" };
  if (!Number.isInteger(n)) return { ok: false, reason: "NOT_AN_INTEGER" };
  if (
    n < DOOR_HANGER_SECONDS_PER_HANGER_MIN ||
    n > DOOR_HANGER_SECONDS_PER_HANGER_MAX
  ) {
    return { ok: false, reason: "OUT_OF_RANGE" };
  }
  return { ok: true, secondsPerHanger: n };
}
