// Pure validation helpers for the Phase 3D admin actions. Kept pure so
// the server action layer and the unit tests share one definition.
//
// Rules align with the DB CHECK constraints introduced in
// 20260520120000_phase_3_message_automations.sql:
//
//   phone_e164  CHECK  (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
//
// We validate client-side AND server-side; the DB CHECK is the final
// authority but we want friendly error messages before the round-trip.

export const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

export type RecipientInput = {
  name: string;
  phoneE164: string;
  roleLabel?: string | null;
  isActive: boolean;
};

export type RecipientValidationError = {
  field: "name" | "phoneE164" | "roleLabel" | "isActive";
  code:
    | "REQUIRED"
    | "TOO_LONG"
    | "INVALID_E164"
    | "INVALID_BOOLEAN";
  message: string;
};

export type RecipientValidationResult =
  | { ok: true; data: Required<Omit<RecipientInput, "roleLabel">> & { roleLabel: string | null } }
  | { ok: false; errors: RecipientValidationError[] };

const NAME_MAX = 120;
const ROLE_LABEL_MAX = 80;

export function validateRecipientInput(
  input: RecipientInput,
): RecipientValidationResult {
  const errors: RecipientValidationError[] = [];

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    errors.push({
      field: "name",
      code: "REQUIRED",
      message: "Name is required.",
    });
  } else if (name.length > NAME_MAX) {
    errors.push({
      field: "name",
      code: "TOO_LONG",
      message: `Name must be ${NAME_MAX} characters or fewer.`,
    });
  }

  const phone = (input.phoneE164 ?? "").trim();
  if (phone.length === 0) {
    errors.push({
      field: "phoneE164",
      code: "REQUIRED",
      message: "Phone number is required.",
    });
  } else if (!E164_REGEX.test(phone)) {
    errors.push({
      field: "phoneE164",
      code: "INVALID_E164",
      message:
        "Phone must be in E.164 format (e.g. +15615551234) — start with + then country code and number.",
    });
  }

  const role = (input.roleLabel ?? "").trim();
  if (role.length > ROLE_LABEL_MAX) {
    errors.push({
      field: "roleLabel",
      code: "TOO_LONG",
      message: `Role label must be ${ROLE_LABEL_MAX} characters or fewer.`,
    });
  }

  if (typeof input.isActive !== "boolean") {
    errors.push({
      field: "isActive",
      code: "INVALID_BOOLEAN",
      message: "Active flag must be a boolean.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      phoneE164: phone,
      roleLabel: role.length === 0 ? null : role,
      isActive: input.isActive,
    },
  };
}

// Phone display helper. The admin UI never shows the raw E.164 number
// in case the screen is shared. Country prefix + last 4 only.
export function maskPhoneE164(phone: string): string {
  if (!phone || phone.length <= 6) return "•••";
  return `${phone.slice(0, 2)}••••••${phone.slice(-4)}`;
}
