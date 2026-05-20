// Public types for the Phase 3 messaging system. Pure — safe to import
// from anywhere (server or browser). No "server-only" so client
// components can refer to the discriminated result shapes.

export const NOTIFICATION_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const MESSAGE_CHANNELS = ["sms"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const PROVIDER_KEYS = ["gohighlevel"] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

// -------------------------------------------------------------------------
// Template keys (mirror seeded values in supabase/seed/phase_3_seed.sql)
// -------------------------------------------------------------------------
export const TEMPLATE_KEYS = [
  "internal_schedule_request_v1",
  "internal_manual_quote_needed_v1",
  "internal_service_area_review_v1",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// -------------------------------------------------------------------------
// Template context — every renderable field. All fields optional so the
// renderer can fall back gracefully when the calling code only has partial
// data (e.g. service_area_review tasks have no quote).
// -------------------------------------------------------------------------
export type TemplateContext = {
  customer_name?: string | null;
  address?: string | null;
  city?: string | null;
  plan_label?: string | null;
  total?: string | null;
  task_category?: string | null;
};

export type RenderedMessage = {
  templateKey: TemplateKey;
  body: string;
};

// -------------------------------------------------------------------------
// Provider adapter — discriminated send result.
// -------------------------------------------------------------------------
export type SafeProviderResponse = {
  providerMessageId: string | null;
  status: string | null;
  conversationId?: string | null;
  // Echo of selected safe fields from the provider response. Never the raw
  // body — sanitization strips auth headers, keys, and unknown nested
  // objects.
  echo: Record<string, string | number | boolean | null>;
  // Optional diagnostics populated by the adapter on the error path so
  // the admin UI can show *which step* of a multi-call flow failed
  // (e.g. GHL's contact_upsert vs send_message) and the HTTP status —
  // without exposing any secret material.
  step?: string;
  httpStatus?: number;
  snippet?: string;
};

export type SmsSendInput = {
  to: string; // E.164
  body: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SmsSendOk = {
  ok: true;
  providerMessageId: string | null;
  raw: SafeProviderResponse;
};

export type SmsSendErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_INPUT"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "UPSTREAM_UNAUTHORIZED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

// Steps the GHL adapter (and any other multi-call adapter) may report on
// the error path. Adapter-agnostic in shape — other providers can use
// their own step keys.
export type ProviderStep = "contact_upsert" | "send_message" | string;

export type SmsSendErr = {
  ok: false;
  error: {
    code: SmsSendErrorCode;
    message: string;
    httpStatus?: number;
    step?: ProviderStep;
    details?: unknown;
    raw?: SafeProviderResponse;
  };
};

export type SmsSendResult = SmsSendOk | SmsSendErr;

// -------------------------------------------------------------------------
// Provider config status — what the admin test page surfaces. Never
// contains a key value; only key presence.
// -------------------------------------------------------------------------
export type ProviderConfigStatus = {
  providerKey: ProviderKey;
  configured: boolean;
  missingKeys: string[];
};

// -------------------------------------------------------------------------
// Notification-log related-object pointers. All optional and nullable —
// the engine may have any subset depending on the flow that created it.
// -------------------------------------------------------------------------
export type NotificationLogRelations = {
  relatedTaskId?: string | null;
  relatedLeadId?: string | null;
  relatedQuoteId?: string | null;
  relatedContactId?: string | null;
  relatedPropertyId?: string | null;
};

export type NotificationLogSummary = {
  id: string;
  status: NotificationStatus;
  providerKey: string;
  channel: string;
  recipientPhoneE164: string;
  renderedMessage: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
  retriedFromLogId: string | null;
  automationId: string | null;
  recipientId: string | null;
  // Projected from the sanitized provider_response jsonb so the admin UI
  // can show which adapter step failed and the HTTP status without
  // re-reading the column.
  providerStep: string | null;
  providerHttpStatus: number | null;
};
