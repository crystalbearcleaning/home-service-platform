import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import {
  CUSTOMER_QUOTE_SALES_PAGE_KEY,
  QUOTE_FLOW_EVENT_TYPES,
  QUOTE_FLOW_PLUGIN_KEYS,
  QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS,
  WINDOW_CLEANING_AUTO_QUOTE_KEY,
  buildResetPlan,
  type ResetPlan,
} from "./plan";

// =========================================================================
// Execute the reset plan against Supabase via the service-role client.
// Never throws. Returns per-table deleted-row counts so the UI can show
// the operator exactly what landed.
// =========================================================================

export type ResetCounts = {
  quote_page_interactions: number;
  tasks: number;
  activities: number;
  events: number;
  issues: number;
  quotes: number;
  leads: number;
  properties: number;
  contacts: number;
  rate_limit_events: number;
};

export type ResetSuccess = {
  businessId: string;
  counts: ResetCounts;
  plan: ResetPlan;
};

export type ResetError = {
  code: "INVALID_INPUT" | "CLIENT_INIT_FAILED" | "DB_ERROR" | "INTERNAL";
  message: string;
  table?: keyof ResetCounts;
  details?: unknown;
};

export type ResetResult =
  | { ok: true; data: ResetSuccess }
  | { ok: false; error: ResetError };

// Small helper that wraps a Supabase delete-with-count call and returns
// either the count on success or an error result. We use `head: true`
// + `count: 'exact'` to get the deleted-row count back from PostgREST.
async function deleteAndCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: any,
  table: keyof ResetCounts,
): Promise<{ ok: true; count: number } | { ok: false; error: ResetError }> {
  const { error, count } = await builder.select("*", {
    count: "exact",
    head: true,
  });
  if (error) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: `Delete from ${table} failed: ${error.message}`,
        table,
        details: { hint: error.hint, code: error.code },
      },
    };
  }
  return { ok: true, count: count ?? 0 };
}

export async function executeStagingReset(input: {
  businessId: string;
}): Promise<ResetResult> {
  try {
    return await executeStagingResetInner(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[executeStagingReset] unhandled error:", message, stack);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Unexpected error during staging reset: ${message}`,
      },
    };
  }
}

async function executeStagingResetInner(input: {
  businessId: string;
}): Promise<ResetResult> {
  if (!input.businessId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "businessId is required." },
    };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Service-role Supabase client init failed.",
      },
    };
  }

  const businessId = input.businessId;
  const plan = buildResetPlan({ businessId });
  const counts: ResetCounts = {
    quote_page_interactions: 0,
    tasks: 0,
    activities: 0,
    events: 0,
    issues: 0,
    quotes: 0,
    leads: 0,
    properties: 0,
    contacts: 0,
    rate_limit_events: 0,
  };

  // 1. quote_page_interactions — all for this business.
  const qpi = await deleteAndCount(
    supabase
      .from("quote_page_interactions")
      .delete()
      .eq("business_id", businessId),
    "quote_page_interactions",
  );
  if (!qpi.ok) return { ok: false, error: qpi.error };
  counts.quote_page_interactions = qpi.count;

  // 2. tasks — scoped by source_plugin_key.
  const tasks = await deleteAndCount(
    supabase
      .from("tasks")
      .delete()
      .eq("business_id", businessId)
      .in("source_plugin_key", [...QUOTE_FLOW_PLUGIN_KEYS]),
    "tasks",
  );
  if (!tasks.ok) return { ok: false, error: tasks.error };
  counts.tasks = tasks.count;

  // 3. activities — same scoping rule.
  const activities = await deleteAndCount(
    supabase
      .from("activities")
      .delete()
      .eq("business_id", businessId)
      .in("source_plugin_key", [...QUOTE_FLOW_PLUGIN_KEYS]),
    "activities",
  );
  if (!activities.ok) return { ok: false, error: activities.error };
  counts.activities = activities.count;

  // 4. events — scoped by the explicit phase-1 event-type list.
  const events = await deleteAndCount(
    supabase
      .from("events")
      .delete()
      .eq("business_id", businessId)
      .in("event_type", [...QUOTE_FLOW_EVENT_TYPES]),
    "events",
  );
  if (!events.ok) return { ok: false, error: events.error };
  counts.events = events.count;

  // 5. issues — scoped by source_plugin_key (likely a no-op in Phase 1
  // but included so QA-flagged plugin issues are cleared on reset).
  const issues = await deleteAndCount(
    supabase
      .from("issues")
      .delete()
      .eq("business_id", businessId)
      .in("source_plugin_key", [...QUOTE_FLOW_PLUGIN_KEYS]),
    "issues",
  );
  if (!issues.ok) return { ok: false, error: issues.error };
  counts.issues = issues.count;

  // 6. quotes — scoped by source_plugin_key.
  const quotes = await deleteAndCount(
    supabase
      .from("quotes")
      .delete()
      .eq("business_id", businessId)
      .eq("source_plugin_key", WINDOW_CLEANING_AUTO_QUOTE_KEY),
    "quotes",
  );
  if (!quotes.ok) return { ok: false, error: quotes.error };
  counts.quotes = quotes.count;

  // 7. leads — scoped by created_from_plugin_key.
  const leads = await deleteAndCount(
    supabase
      .from("leads")
      .delete()
      .eq("business_id", businessId)
      .eq("created_from_plugin_key", CUSTOMER_QUOTE_SALES_PAGE_KEY),
    "leads",
  );
  if (!leads.ok) return { ok: false, error: leads.error };
  counts.leads = leads.count;

  // 8. properties — only those linked to quote_app contacts. Two-step:
  // resolve the quote_app contact ids first, then delete properties whose
  // contact_id is in that set. PostgREST doesn't support a true subselect
  // in DELETE, so we materialize the id list client-side.
  const quoteAppContacts = await supabase
    .from("contacts")
    .select("id")
    .eq("business_id", businessId)
    .eq("source", "quote_app");
  if (quoteAppContacts.error) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: `Reading quote_app contacts failed: ${quoteAppContacts.error.message}`,
        table: "contacts",
      },
    };
  }
  const quoteAppContactIds = (quoteAppContacts.data ?? []).map(
    (r) => r.id as string,
  );
  if (quoteAppContactIds.length > 0) {
    const props = await deleteAndCount(
      supabase
        .from("properties")
        .delete()
        .eq("business_id", businessId)
        .in("contact_id", quoteAppContactIds),
      "properties",
    );
    if (!props.ok) return { ok: false, error: props.error };
    counts.properties = props.count;
  }

  // 9. contacts — scoped by source='quote_app'.
  const contacts = await deleteAndCount(
    supabase
      .from("contacts")
      .delete()
      .eq("business_id", businessId)
      .eq("source", "quote_app"),
    "contacts",
  );
  if (!contacts.ok) return { ok: false, error: contacts.error };
  counts.contacts = contacts.count;

  // 10. rate_limit_events — global table, scoped by action_key only.
  // Phase 1 deploys one workspace per database; documented in plan.ts.
  const rle = await deleteAndCount(
    supabase
      .from("rate_limit_events")
      .delete()
      .in("action_key", [...QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS]),
    "rate_limit_events",
  );
  if (!rle.ok) return { ok: false, error: rle.error };
  counts.rate_limit_events = rle.count;

  return { ok: true, data: { businessId, counts, plan } };
}
