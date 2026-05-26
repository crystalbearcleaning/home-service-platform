// Pure form-level validation for the Phase 7D-1 "Start simulated
// Door Hanger route" action.
//
// No DB, no server-only — safe to import from the client form for
// early-feedback parity. The server-side helper re-validates before
// any DB round-trip.

import {
  DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER,
  DOOR_HANGER_SECONDS_PER_HANGER_MAX,
  DOOR_HANGER_SECONDS_PER_HANGER_MIN,
  parseSecondsPerHanger,
} from "./assumptions";

export type StartSessionFormInput = {
  routeId: string | null | undefined;
  designId: string | null | undefined;
  // The form accepts a string from `<input type="number">`, but the
  // server may pass a parsed number — accept either.
  secondsPerHanger: string | number | null | undefined;
};

export type StartSessionValidated = {
  routeId: string;
  designId: string;
  secondsPerHanger: number;
};

export type StartSessionFieldError = { field: string; message: string };

export type StartSessionValidationResult =
  | { ok: true; data: StartSessionValidated }
  | { ok: false; errors: StartSessionFieldError[] };

export function validateStartSessionForm(
  input: StartSessionFormInput,
): StartSessionValidationResult {
  const errors: StartSessionFieldError[] = [];

  const routeId = (input.routeId ?? "").toString().trim();
  if (routeId.length === 0) {
    errors.push({ field: "routeId", message: "Pick a route to walk." });
  }

  const designId = (input.designId ?? "").toString().trim();
  if (designId.length === 0) {
    errors.push({ field: "designId", message: "Pick an inventory design." });
  }

  // Seconds per hanger defaults to 30 when the field is empty; any
  // other invalid value surfaces a field error so the operator can
  // correct it.
  let secondsPerHanger = DOOR_HANGER_DEFAULT_SECONDS_PER_HANGER as number;
  if (
    input.secondsPerHanger !== null &&
    input.secondsPerHanger !== undefined &&
    String(input.secondsPerHanger).trim().length > 0
  ) {
    const parsed = parseSecondsPerHanger(input.secondsPerHanger);
    if (!parsed.ok) {
      const message =
        parsed.reason === "NOT_A_NUMBER"
          ? "Seconds per hanger must be a number."
          : parsed.reason === "NOT_AN_INTEGER"
            ? "Seconds per hanger must be a whole number."
            : `Seconds per hanger must be between ${DOOR_HANGER_SECONDS_PER_HANGER_MIN} and ${DOOR_HANGER_SECONDS_PER_HANGER_MAX}.`;
      errors.push({ field: "secondsPerHanger", message });
    } else {
      secondsPerHanger = parsed.secondsPerHanger;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { routeId, designId, secondsPerHanger },
  };
}
