// Pure description of the staging reset plan. No DB, no env vars — the
// executor (reset.ts) reads this plan to know which tables to delete from
// and with which filters. Splitting it out keeps the plan unit-testable
// and makes it trivial to verify (in tests and reviews) which tables are
// touched and which are preserved.
//
// Filter scoping principles:
//   - Per-business tables are always scoped by businessId.
//   - Quote-flow-only rows are identified by:
//       * contacts.source = 'quote_app'
//       * properties.contact_id linked to a quote_app contact
//       * leads.created_from_plugin_key = 'customer_quote_sales_page'
//       * tasks/activities/issues.source_plugin_key = plugin keys
//       * quotes.source_plugin_key = 'window_cleaning_auto_quote'
//       * events.event_type in the quote-flow event-type list
//       * quote_page_interactions: all rows for the business (the table
//         is exclusively owned by the customer-quote-sales-page plugin).
//   - rate_limit_events has no business_id; it is scoped by action_key.
//     With a single Phase 1 workspace this is safe; the comment in the
//     orchestrator notes the caveat for any future multi-tenant deploy.

export const CUSTOMER_QUOTE_SALES_PAGE_KEY = "customer_quote_sales_page";
export const WINDOW_CLEANING_AUTO_QUOTE_KEY = "window_cleaning_auto_quote";

// The phase-1 event types created by the quote flow (C2 + C3). Listed
// explicitly so a future generic event-type addition doesn't accidentally
// fall into the reset blast radius.
export const QUOTE_FLOW_EVENT_TYPES = [
  "quote_app.address_entered",
  "auto_quote.quote_generated",
  "quote_app.contact_submitted",
  "quote_app.schedule_requested",
  "lead.created",
  "quote.created",
  "task.created",
] as const;

// rate_limit_events action_keys that the quote flow + the admin rate-limit
// test page produce. Anything outside this list is left alone.
export const QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS = [
  "quote.address_lookup",
  "quote.submit_contact",
  "geo.autocomplete_server",
] as const;

export const QUOTE_FLOW_PLUGIN_KEYS = [
  CUSTOMER_QUOTE_SALES_PAGE_KEY,
  WINDOW_CLEANING_AUTO_QUOTE_KEY,
] as const;

// Tables the reset is forbidden to touch. Listed for the test below and
// for human reviewers — the executor never names these tables, but
// pinning them here makes accidental regression impossible to ship.
export const PRESERVED_TABLES = [
  "businesses",
  "user_profiles",
  "business_memberships",
  "business_roles",
  "membership_roles",
  "role_permissions",
  "user_permission_overrides",
  "role_blueprints",
  "app_surfaces",
  "app_surface_blueprints",
  "app_surface_domains",
  "role_app_surface_access",
  "user_app_surface_overrides",
  "plugin_definitions",
  "installed_plugins",
  "plugin_ui_registrations",
  "plugin_action_registrations",
  "data_dictionary_fields",
  "business_settings",
  "service_areas",
  "services",
  "service_plans",
  "price_rules",
] as const;

export type ResetPlanStep =
  | {
      kind: "delete";
      table:
        | "quote_page_interactions"
        | "tasks"
        | "activities"
        | "events"
        | "issues"
        | "quotes"
        | "leads"
        | "properties"
        | "contacts"
        | "rate_limit_events";
      // Human-friendly description of the WHERE clause used. The executor
      // implements the filter; this string is for logs/tests/UI.
      description: string;
    };

export type ResetPlan = {
  businessId: string;
  steps: ResetPlanStep[];
  notes: string[];
};

// Build the ordered plan. The executor runs steps in this order so FK
// cascades never widen the blast radius — by the time CASCADE could
// fire, the dependent rows are already gone.
export function buildResetPlan(input: { businessId: string }): ResetPlan {
  const b = input.businessId;
  return {
    businessId: b,
    steps: [
      {
        kind: "delete",
        table: "quote_page_interactions",
        description: `business_id = ${b}`,
      },
      {
        kind: "delete",
        table: "tasks",
        description: `business_id = ${b} AND source_plugin_key IN (${QUOTE_FLOW_PLUGIN_KEYS.join(", ")})`,
      },
      {
        kind: "delete",
        table: "activities",
        description: `business_id = ${b} AND source_plugin_key IN (${QUOTE_FLOW_PLUGIN_KEYS.join(", ")})`,
      },
      {
        kind: "delete",
        table: "events",
        description: `business_id = ${b} AND event_type IN (${QUOTE_FLOW_EVENT_TYPES.join(", ")})`,
      },
      {
        kind: "delete",
        table: "issues",
        description: `business_id = ${b} AND source_plugin_key IN (${QUOTE_FLOW_PLUGIN_KEYS.join(", ")})`,
      },
      {
        kind: "delete",
        table: "quotes",
        description: `business_id = ${b} AND source_plugin_key = ${WINDOW_CLEANING_AUTO_QUOTE_KEY}`,
      },
      {
        kind: "delete",
        table: "leads",
        description: `business_id = ${b} AND created_from_plugin_key = ${CUSTOMER_QUOTE_SALES_PAGE_KEY}`,
      },
      {
        kind: "delete",
        table: "properties",
        description: `business_id = ${b} AND contact_id IN (contacts where business_id = ${b} AND source = 'quote_app')`,
      },
      {
        kind: "delete",
        table: "contacts",
        description: `business_id = ${b} AND source = 'quote_app'`,
      },
      {
        kind: "delete",
        table: "rate_limit_events",
        description: `action_key IN (${QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS.join(", ")})`,
      },
    ],
    notes: [
      "rate_limit_events has no business_id and is shared across workspaces;" +
        " deleting by action_key is safe in Phase 1 single-tenant deploys only.",
      "Preserved tables: " + PRESERVED_TABLES.join(", "),
    ],
  };
}
