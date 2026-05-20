// Shared troubleshooting copy for 401/403 results from the GHL adapter.
// Pure — safe to import from both the server page and the client form.
// Never references env values or any secret material.

export const UNAUTHORIZED_TROUBLESHOOTING_TIPS = [
  "The GHL_API_KEY (or OAuth bearer token) may be invalid, expired, or revoked.",
  "The token may belong to a different GHL sub-account / location than GHL_LOCATION_ID.",
  "GHL_LOCATION_ID may be wrong for this token.",
  "The token may lack the contacts.write or conversations/messages.write scope.",
  "The auth style may not match the token type — Private Integration tokens, OAuth tokens, and legacy v1 location API keys are NOT interchangeable on the same endpoint.",
] as const;
