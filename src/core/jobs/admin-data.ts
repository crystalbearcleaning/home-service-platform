import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

import type { JobSource, JobStatus } from "./constants";

// =========================================================================
// Phase 9B — server-only read helpers for jobs + job_line_items.
//
// Strictly read-only. No CRM writes. No external API calls. No
// message-engine calls. Every call site (future Server Components on
// /admin/jobs) has already verified business membership through the
// active-business resolver, so service-role reads are safe here.
// =========================================================================

export type JobRow = {
  id: string;
  businessId: string;
  contactId: string;
  contactFullName: string | null;
  propertyId: string | null;
  propertyAddressLine: string | null;
  quoteId: string | null;
  title: string;
  summary: string | null;
  status: JobStatus;
  source: JobSource;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
  estimatedTotalCents: number;
  createdAt: string;
  updatedAt: string;
};

export type JobLineItemRow = {
  id: string;
  businessId: string;
  jobId: string;
  serviceId: string | null;
  serviceName: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number | null;
  source: "quote" | "service" | "custom";
  createdAt: string;
  updatedAt: string;
};

export type ListJobsFilters = {
  status?: JobStatus | "all";
  // Future: search / contact filter / scheduling-range filter.
};

const JOB_SELECT =
  "id,business_id,contact_id,property_id,quote_id,title,summary,status,source," +
  "scheduled_start_at,scheduled_end_at,arrival_window_label," +
  "estimated_total_cents,created_at,updated_at," +
  "contacts!jobs_contact_id_fkey(full_name)," +
  "properties!jobs_property_id_fkey(address_line_1,city,state)";

const LINE_ITEM_SELECT =
  "id,business_id,job_id,service_id,name,description,quantity," +
  "unit_price_cents,total_cents,sort_order,source,created_at,updated_at," +
  "services!job_line_items_service_id_fkey(name)";

const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;

export async function listJobs(input: {
  businessId: string;
  filters?: ListJobsFilters;
  limit?: number;
}): Promise<JobRow[]> {
  if (!input.businessId) return [];
  const sb = createServiceRoleClient();
  let q = sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (input.filters?.status && input.filters.status !== "all") {
    q = q.eq("status", input.filters.status);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToJob);
}

export async function getJob(input: {
  businessId: string;
  jobId: string;
}): Promise<JobRow | null> {
  if (!input.businessId || !input.jobId) return null;
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .eq("id", input.jobId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToJob(data);
}

export async function getJobLineItems(input: {
  businessId: string;
  jobId: string;
}): Promise<JobLineItemRow[]> {
  if (!input.businessId || !input.jobId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("job_line_items")
    .select(LINE_ITEM_SELECT)
    .eq("business_id", input.businessId)
    .eq("job_id", input.jobId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToLineItem);
}

export async function listJobsForQuote(input: {
  businessId: string;
  quoteId: string;
  limit?: number;
}): Promise<JobRow[]> {
  if (!input.businessId || !input.quoteId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .eq("quote_id", input.quoteId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToJob);
}

// -------------------------------------------------------------------------
// Phase 10B — schedule-page loaders
// -------------------------------------------------------------------------

// Returns scheduled / in-progress / completed jobs whose
// `scheduled_start_at` falls in `[weekStart, weekEnd)`. The status
// filter mirrors §10 of `docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`:
// draft + unscheduled live in the unscheduled panel, canceled is
// hidden everywhere on the schedule page.
export async function listScheduledJobsForWeek(input: {
  businessId: string;
  weekStart: Date | string;
  weekEnd: Date | string;
  limit?: number;
}): Promise<JobRow[]> {
  if (!input.businessId) return [];
  const startIso = coerceIso(input.weekStart);
  const endIso = coerceIso(input.weekEnd);
  if (!startIso || !endIso) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .not("scheduled_start_at", "is", null)
    .gte("scheduled_start_at", startIso)
    .lt("scheduled_start_at", endIso)
    .in("status", ["scheduled", "in_progress", "completed"])
    .order("scheduled_start_at", { ascending: true })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToJob);
}

// Returns unscheduled-panel candidates: jobs with no
// `scheduled_start_at` and a `draft` / `unscheduled` status. Most-
// recent-first. Same default-100 / max-500 cap as `listJobs`.
export async function listUnscheduledJobs(input: {
  businessId: string;
  limit?: number;
}): Promise<JobRow[]> {
  if (!input.businessId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .is("scheduled_start_at", null)
    .in("status", ["draft", "unscheduled"])
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToJob);
}

export async function listJobsForContact(input: {
  businessId: string;
  contactId: string;
  limit?: number;
}): Promise<JobRow[]> {
  if (!input.businessId || !input.contactId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select(JOB_SELECT)
    .eq("business_id", input.businessId)
    .eq("contact_id", input.contactId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToJob);
}

// -------------------------------------------------------------------------
// Row mappers
// -------------------------------------------------------------------------

function rowToJob(raw: unknown): JobRow {
  const r = raw as Record<string, unknown>;
  const contactRaw = (r as { contacts?: unknown }).contacts;
  const contactObj = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
  const contactFullName =
    contactObj && typeof contactObj === "object" && "full_name" in contactObj
      ? String(((contactObj as { full_name: unknown }).full_name) ?? "")
      : "";

  const propRaw = (r as { properties?: unknown }).properties;
  const propObj = Array.isArray(propRaw) ? propRaw[0] : propRaw;
  const propertyAddressLine = buildAddressLine(propObj);

  return {
    id: String(r.id),
    businessId: String(r.business_id),
    contactId: String(r.contact_id),
    contactFullName: contactFullName.length > 0 ? contactFullName : null,
    propertyId: r.property_id ? String(r.property_id) : null,
    propertyAddressLine,
    quoteId: r.quote_id ? String(r.quote_id) : null,
    title: String(r.title ?? ""),
    summary: r.summary ? String(r.summary) : null,
    status: String(r.status ?? "draft") as JobStatus,
    source: String(r.source ?? "manual") as JobSource,
    scheduledStartAt: r.scheduled_start_at
      ? String(r.scheduled_start_at)
      : null,
    scheduledEndAt: r.scheduled_end_at ? String(r.scheduled_end_at) : null,
    arrivalWindowLabel: r.arrival_window_label
      ? String(r.arrival_window_label)
      : null,
    estimatedTotalCents: Number(r.estimated_total_cents ?? 0),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function rowToLineItem(raw: unknown): JobLineItemRow {
  const r = raw as Record<string, unknown>;
  const svcRaw = (r as { services?: unknown }).services;
  const svcObj = Array.isArray(svcRaw) ? svcRaw[0] : svcRaw;
  const serviceName =
    svcObj && typeof svcObj === "object" && "name" in svcObj
      ? String(((svcObj as { name: unknown }).name) ?? "")
      : "";

  return {
    id: String(r.id),
    businessId: String(r.business_id),
    jobId: String(r.job_id),
    serviceId: r.service_id ? String(r.service_id) : null,
    serviceName: serviceName.length > 0 ? serviceName : null,
    name: String(r.name ?? ""),
    description: r.description ? String(r.description) : null,
    quantity: Number(r.quantity ?? 0),
    unitPriceCents: Number(r.unit_price_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
    sortOrder:
      r.sort_order === null || r.sort_order === undefined
        ? null
        : Number(r.sort_order),
    source: (r.source as "quote" | "service" | "custom") ?? "custom",
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function buildAddressLine(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as Record<string, unknown>;
  const line1 = typeof p.address_line_1 === "string" ? p.address_line_1 : null;
  const city = typeof p.city === "string" ? p.city : null;
  const state = typeof p.state === "string" ? p.state : null;
  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (city) parts.push(city);
  if (state) parts.push(state);
  return parts.length > 0 ? parts.join(", ") : null;
}

function clampLimit(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return LIST_DEFAULT_LIMIT;
  if (!Number.isFinite(raw)) return LIST_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n <= 0) return LIST_DEFAULT_LIMIT;
  if (n > LIST_MAX_LIMIT) return LIST_MAX_LIMIT;
  return n;
}

function coerceIso(v: Date | string | null | undefined): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString();
  }
  if (typeof v === "string" && v.length > 0) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
}
