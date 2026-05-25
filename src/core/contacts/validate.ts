// Pure validation for Phase 4C contact-edit actions.
// Loose-but-sensible: matches the Phase 1 submit-mapping validator so
// existing contacts continue to round-trip cleanly through edit.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_RE = /\d/g;

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_RAW_MAX = 32;
const PHONE_MIN_DIGITS = 7;

export type ContactEditInput = {
  fullName: string;
  phone: string;
  email: string;
};

export type ContactFieldError = {
  field: "fullName" | "phone" | "email";
  code: "REQUIRED" | "TOO_LONG" | "INVALID_EMAIL" | "INVALID_PHONE";
  message: string;
};

export type ContactValidationResult =
  | { ok: true; data: ContactEditInput }
  | { ok: false; errors: ContactFieldError[] };

export function validateContactEdit(
  input: ContactEditInput,
): ContactValidationResult {
  const errors: ContactFieldError[] = [];

  const fullName = (input.fullName ?? "").trim();
  if (fullName.length === 0) {
    errors.push({
      field: "fullName",
      code: "REQUIRED",
      message: "Name is required.",
    });
  } else if (fullName.length > NAME_MAX) {
    errors.push({
      field: "fullName",
      code: "TOO_LONG",
      message: `Name must be ${NAME_MAX} characters or fewer.`,
    });
  }

  const phone = (input.phone ?? "").trim();
  if (phone.length === 0) {
    errors.push({
      field: "phone",
      code: "REQUIRED",
      message: "Phone is required.",
    });
  } else if (phone.length > PHONE_RAW_MAX) {
    errors.push({
      field: "phone",
      code: "TOO_LONG",
      message: `Phone must be ${PHONE_RAW_MAX} characters or fewer.`,
    });
  } else {
    const digits = phone.match(PHONE_DIGITS_RE) ?? [];
    if (digits.length < PHONE_MIN_DIGITS) {
      errors.push({
        field: "phone",
        code: "INVALID_PHONE",
        message: "Phone must contain at least 7 digits.",
      });
    }
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (email.length === 0) {
    errors.push({
      field: "email",
      code: "REQUIRED",
      message: "Email is required.",
    });
  } else if (email.length > EMAIL_MAX) {
    errors.push({
      field: "email",
      code: "TOO_LONG",
      message: `Email must be ${EMAIL_MAX} characters or fewer.`,
    });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({
      field: "email",
      code: "INVALID_EMAIL",
      message: "Email format looks invalid.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, data: { fullName, phone, email } };
}

// Diff helper used by the update action to compose a useful activity
// summary. Returns the set of fields whose value changed (case-folded
// email comparison; trimmed others).
export type ContactDiff = Array<{
  field: "fullName" | "phone" | "email";
  from: string;
  to: string;
}>;

export function diffContactEdit(
  before: ContactEditInput,
  after: ContactEditInput,
): ContactDiff {
  const diff: ContactDiff = [];
  if ((before.fullName ?? "").trim() !== (after.fullName ?? "").trim()) {
    diff.push({
      field: "fullName",
      from: before.fullName ?? "",
      to: after.fullName ?? "",
    });
  }
  if ((before.phone ?? "").trim() !== (after.phone ?? "").trim()) {
    diff.push({
      field: "phone",
      from: before.phone ?? "",
      to: after.phone ?? "",
    });
  }
  if (
    (before.email ?? "").trim().toLowerCase() !==
    (after.email ?? "").trim().toLowerCase()
  ) {
    diff.push({
      field: "email",
      from: before.email ?? "",
      to: after.email ?? "",
    });
  }
  return diff;
}
