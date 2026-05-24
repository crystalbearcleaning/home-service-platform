// Pure note-body validator for the Phase 3F admin server actions.
// Plain text only; trim; non-empty; capped at NOTE_MAX_LENGTH.
//
// Kept pure so the action layer and unit tests share one definition.

export const NOTE_MIN_LENGTH = 1;
export const NOTE_MAX_LENGTH = 2000;

export type NoteValidationResult =
  | { ok: true; body: string }
  | { ok: false; error: { code: "REQUIRED" | "TOO_LONG"; message: string } };

export function validateNoteBody(raw: string | null | undefined): NoteValidationResult {
  const body = (raw ?? "").trim();
  if (body.length < NOTE_MIN_LENGTH) {
    return {
      ok: false,
      error: { code: "REQUIRED", message: "Note cannot be empty." },
    };
  }
  if (body.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: {
        code: "TOO_LONG",
        message: `Note must be ${NOTE_MAX_LENGTH} characters or fewer (got ${body.length}).`,
      },
    };
  }
  return { ok: true, body };
}
