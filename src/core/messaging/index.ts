// Public barrel for the Phase 3 messaging system. Re-exports the pure
// types + helpers; server-only modules (provider, notification-logs,
// send-internal-sms) are re-exported here too — Next.js respects each
// module's "server-only" directive independently, so importing from
// this barrel inside a Client Component will fail at build time exactly
// as if the offending module had been imported directly. Server
// Components and server actions can use whichever import path is
// clearest.

export type {
  NotificationStatus,
  MessageChannel,
  ProviderKey,
  TemplateKey,
  TemplateContext,
  RenderedMessage,
  SmsSendInput,
  SmsSendResult,
  SmsSendOk,
  SmsSendErr,
  SmsSendErrorCode,
  SafeProviderResponse,
  ProviderConfigStatus,
  NotificationLogRelations,
  NotificationLogSummary,
} from "./types";
export {
  NOTIFICATION_STATUSES,
  MESSAGE_CHANNELS,
  PROVIDER_KEYS,
  TEMPLATE_KEYS,
} from "./types";

export {
  GHL_ENV_KEYS,
  GHL_REQUIRED_ENV_KEYS,
  GHL_DEFAULT_BASE_URL,
  readGhlConfigStatus,
  resolveGhlConfig,
  type GhlConfig,
} from "./config";

export {
  renderScheduleRequest,
  renderManualQuoteNeeded,
  renderServiceAreaReview,
  renderMessage,
  SAMPLE_TEMPLATE_CONTEXT,
} from "./templates";

export { renderByTemplateKey, isTemplateKey, type RenderResult } from "./render";

export { sanitizeProviderResponse } from "./sanitize";

export { getSmsProviderAdapter, type SmsProviderAdapter } from "./provider";

export {
  createPendingNotificationLog,
  markNotificationLogSent,
  markNotificationLogFailed,
  createSkippedNotificationLog,
  listRecentNotificationLogs,
  type CreatePendingInput,
  type MarkSentInput,
  type MarkFailedInput,
  type CreateSkippedInput,
  type LogResult,
} from "./notification-logs";

export {
  sendInternalSmsNotification,
  type SendInternalSmsInput,
  type SendInternalSmsResult,
} from "./send-internal-sms";
