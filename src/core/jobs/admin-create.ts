import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

import {
  parseQuoteLineItemsSnapshot,
  buildQuoteJobTitle,
  type ParsedQuoteLineItem,
} from "./quote-snapshot";
import { computeJobEstimatedTotal } from "./totals";
import {
  validateJobForm,
  validateJobLineItemForm,
  validateSchedulingFields,
  type JobFormInput,
  type JobLineItemFormInput,
  type SchedulingFieldsInput,
} from "./validation";
import {
  isJobStatus,
  type JobLineItemSource,
  type JobStatus,
} from "./constants";

// =========================================================================
// Phase 9B — server-only create / update helpers for jobs.
//
// Atomicity: ordered writes (Phase 5B / 7D-1 / 8 pattern). Each helper
// that touches line items recomputes jobs.estimated_total_cents from
// the row's current line items and updates the parent row in the same
// handler. The DB CHECKs (`unit_price_cents >= 0`,
// `total_cents >= 0`, `estimated_total_cents >= 0`) are the safety
// net.
//
// No CRM side effects beyond the rows owned by this module. No
// message-engine calls. No events / activities writes in Phase 9B
// (those land in Phase 9F).
// =========================================================================

export type CreateResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

function fail<T>(
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): CreateResult<T> {
  return { ok: false, error: { code, message, fieldErrors } };
}

function validationFail<T>(
  errors: { field: string; message: string }[],
): CreateResult<T> {
  const fe: Record<string, string> = {};
  for (const e of errors) fe[e.field] = e.message;
  return fail("VALIDATION_FAILED", "One or more fields are invalid.", fe);
}

// -------------------------------------------------------------------------
// FK ownership checks (shared across helpers)
// -------------------------------------------------------------------------

async function verifyOwnership(input: {
  businessId: string;
  contactId?: string | null;
  propertyId?: string | null;
  quoteId?: string | null;
  serviceId?: string | null;
}): Promise<{ ok: true } | CreateResult<never>> {
  const sb = createServiceRoleClient();

  if (input.contactId) {
    const { data, error } = await sb
      .from("contacts")
      .select("id,business_id")
      .eq("id", input.contactId)
      .maybeSingle();
    if (error)
      return fail("DB_ERROR", error.message);
    if (!data || data.business_id !== input.businessId) {
      return fail("FOREIGN_BUSINESS", "Contact not found for this business.", {
        contactId: "Contact not found.",
      });
    }
  }

  if (input.propertyId) {
    const { data, error } = await sb
      .from("properties")
      .select("id,business_id")
      .eq("id", input.propertyId)
      .maybeSingle();
    if (error) return fail("DB_ERROR", error.message);
    if (!data || data.business_id !== input.businessId) {
      return fail("FOREIGN_BUSINESS", "Property not found for this business.", {
        propertyId: "Property not found.",
      });
    }
  }

  if (input.quoteId) {
    const { data, error } = await sb
      .from("quotes")
      .select("id,business_id")
      .eq("id", input.quoteId)
      .maybeSingle();
    if (error) return fail("DB_ERROR", error.message);
    if (!data || data.business_id !== input.businessId) {
      return fail("FOREIGN_BUSINESS", "Quote not found for this business.", {
        quoteId: "Quote not found.",
      });
    }
  }

  if (input.serviceId) {
    const { data, error } = await sb
      .from("services")
      .select("id,business_id")
      .eq("id", input.serviceId)
      .maybeSingle();
    if (error) return fail("DB_ERROR", error.message);
    if (!data || data.business_id !== input.businessId) {
      return fail("FOREIGN_BUSINESS", "Service not found for this business.", {
        serviceId: "Service not found.",
      });
    }
  }

  return { ok: true };
}

// -------------------------------------------------------------------------
// Create manual job (with line items)
// -------------------------------------------------------------------------

export type ManualJobInput = {
  businessId: string;
  form: JobFormInput;
  lineItems: ReadonlyArray<JobLineItemFormInput>;
};

export async function createManualJob(
  input: ManualJobInput,
): Promise<
  CreateResult<{
    jobId: string;
    estimatedTotalCents: number;
    lineItemCount: number;
  }>
> {
  // Status / source defaults for the manual path: §9 of the Phase 9 doc
  // pins draft + manual for the manual creation flow.
  const v = validateJobForm(input.form, {
    status: "draft",
    source: "manual",
  });
  if (!v.ok) return validationFail(v.errors);
  if (v.data.source !== "manual") {
    return fail("INVALID_SOURCE", "Manual jobs must use source='manual'.", {
      source: "Manual jobs must use source='manual'.",
    });
  }

  // Validate line items first so the operator sees every error at once.
  type Line = Extract<
    ReturnType<typeof validateJobLineItemForm>,
    { ok: true }
  >["data"];
  const lines: Line[] = [];
  const lineErrors: { field: string; message: string }[] = [];
  input.lineItems.forEach((raw, idx) => {
    const r = validateJobLineItemForm(raw);
    if (!r.ok) {
      for (const e of r.errors) {
        lineErrors.push({
          field: `lineItems[${idx}].${e.field}`,
          message: e.message,
        });
      }
    } else {
      lines.push(r.data);
    }
  });
  if (lineErrors.length > 0) return validationFail(lineErrors);

  const own = await verifyOwnership({
    businessId: input.businessId,
    contactId: v.data.contactId,
    propertyId: v.data.propertyId,
    quoteId: v.data.quoteId,
  });
  if (!own.ok) return own;

  // Verify each service_id (when set) belongs to this business.
  for (let i = 0; i < lines.length; i++) {
    const li = lines[i]!;
    if (!li.serviceId) continue;
    const svc = await verifyOwnership({
      businessId: input.businessId,
      serviceId: li.serviceId,
    });
    if (!svc.ok) {
      return fail(
        svc.error.code,
        svc.error.message,
        Object.fromEntries(
          Object.entries(svc.error.fieldErrors ?? {}).map(([k, v2]) => [
            `lineItems[${i}].${k}`,
            v2,
          ]),
        ),
      );
    }
  }

  return insertJobWithLineItems({
    businessId: input.businessId,
    job: {
      contactId: v.data.contactId,
      propertyId: v.data.propertyId,
      quoteId: v.data.quoteId,
      title: v.data.title,
      summary: v.data.summary,
      status: v.data.status,
      source: "manual",
      scheduledStartAt: v.data.scheduledStartAt,
      scheduledEndAt: v.data.scheduledEndAt,
      arrivalWindowLabel: v.data.arrivalWindowLabel,
    },
    lineItems: lines,
  });
}

// -------------------------------------------------------------------------
// Create job from quote (snapshot)
// -------------------------------------------------------------------------

export type CreateJobFromQuoteInput = {
  businessId: string;
  quoteId: string;
  // Optional overrides; if absent the helper derives from the quote.
  title?: string | null;
  summary?: string | null;
};

export async function createJobFromQuote(
  input: CreateJobFromQuoteInput,
): Promise<
  CreateResult<{
    jobId: string;
    estimatedTotalCents: number;
    lineItemCount: number;
    snapshotSource: "line_items_snapshot" | "selected_total_fallback" | "empty";
    warnings: string[];
  }>
> {
  if (!input.businessId || !input.quoteId) {
    return fail("INVALID_INPUT", "Missing businessId or quoteId.");
  }

  const sb = createServiceRoleClient();

  const { data: quote, error: qErr } = await sb
    .from("quotes")
    .select(
      "id,business_id,contact_id,property_id,selected_option_key,selected_total,options_snapshot,line_items_snapshot",
    )
    .eq("id", input.quoteId)
    .maybeSingle();
  if (qErr) return fail("DB_ERROR", qErr.message);
  if (!quote || quote.business_id !== input.businessId) {
    return fail("FOREIGN_BUSINESS", "Quote not found for this business.");
  }

  let contactFullName: string | null = null;
  if (quote.contact_id) {
    const { data: c } = await sb
      .from("contacts")
      .select("full_name")
      .eq("id", quote.contact_id)
      .maybeSingle();
    if (c && typeof c.full_name === "string") contactFullName = c.full_name;
  }

  const parsed = parseQuoteLineItemsSnapshot({
    lineItemsSnapshot: quote.line_items_snapshot,
    optionsSnapshot: quote.options_snapshot,
    selectedOptionKey: quote.selected_option_key ?? null,
    selectedTotalDollars: quote.selected_total ?? null,
  });

  const title =
    (input.title ?? "").trim() ||
    buildQuoteJobTitle({
      selectedOptionKey: quote.selected_option_key ?? null,
      optionsSnapshot: quote.options_snapshot,
      contactFullName,
    });

  const summary =
    typeof input.summary === "string" && input.summary.trim().length > 0
      ? input.summary.trim()
      : null;

  const linesAsValidated = parsed.lineItems.map(parsedLineToLineItem);

  const insertRes = await insertJobWithLineItems({
    businessId: input.businessId,
    job: {
      contactId: quote.contact_id,
      propertyId: quote.property_id ?? null,
      quoteId: quote.id,
      title,
      summary,
      // From-quote default per §9: unscheduled.
      status: "unscheduled",
      source: "quote",
      scheduledStartAt: null,
      scheduledEndAt: null,
      arrivalWindowLabel: null,
    },
    lineItems: linesAsValidated,
    parserMeta: {
      snapshotSource: parsed.source,
      warnings: parsed.warnings,
    },
  });

  if (!insertRes.ok) return insertRes;
  return {
    ok: true,
    data: {
      jobId: insertRes.data.jobId,
      estimatedTotalCents: insertRes.data.estimatedTotalCents,
      lineItemCount: insertRes.data.lineItemCount,
      // Narrowing the shared insert result's optional fields to the
      // required shape this caller advertises. Always set on the
      // quote path because we always pass parserMeta above.
      snapshotSource: insertRes.data.snapshotSource ?? parsed.source,
      warnings: insertRes.data.warnings ?? parsed.warnings,
    },
  };
}

// -------------------------------------------------------------------------
// Add / update / remove line item
// -------------------------------------------------------------------------

export async function addJobLineItem(input: {
  businessId: string;
  jobId: string;
  form: JobLineItemFormInput;
}): Promise<CreateResult<{ lineItemId: string; estimatedTotalCents: number }>> {
  const v = validateJobLineItemForm(input.form);
  if (!v.ok) return validationFail(v.errors);

  const own = await verifyOwnership({
    businessId: input.businessId,
    serviceId: v.data.serviceId,
  });
  if (!own.ok) return own;

  const job = await ensureJobOwned(input.businessId, input.jobId);
  if (!job.ok) return job;

  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("job_line_items")
    .insert({
      business_id: input.businessId,
      job_id: input.jobId,
      service_id: v.data.serviceId,
      name: v.data.name,
      description: v.data.description,
      quantity: v.data.quantity,
      unit_price_cents: v.data.unitPriceCents,
      total_cents: v.data.totalCents,
      sort_order: v.data.sortOrder,
      source: v.data.source,
    })
    .select("id")
    .single();
  if (error || !data) {
    return fail("DB_ERROR", error?.message ?? "Insert failed.");
  }

  const updated = await recomputeJobEstimatedTotal(
    input.businessId,
    input.jobId,
  );
  if (!updated.ok) return updated;

  return {
    ok: true,
    data: { lineItemId: data.id, estimatedTotalCents: updated.total },
  };
}

export async function updateJobLineItem(input: {
  businessId: string;
  jobId: string;
  lineItemId: string;
  form: JobLineItemFormInput;
}): Promise<CreateResult<{ estimatedTotalCents: number }>> {
  const v = validateJobLineItemForm(input.form);
  if (!v.ok) return validationFail(v.errors);

  const own = await verifyOwnership({
    businessId: input.businessId,
    serviceId: v.data.serviceId,
  });
  if (!own.ok) return own;

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("job_line_items")
    .update({
      service_id: v.data.serviceId,
      name: v.data.name,
      description: v.data.description,
      quantity: v.data.quantity,
      unit_price_cents: v.data.unitPriceCents,
      total_cents: v.data.totalCents,
      sort_order: v.data.sortOrder,
      source: v.data.source,
    })
    .eq("id", input.lineItemId)
    .eq("business_id", input.businessId)
    .eq("job_id", input.jobId);
  if (error) return fail("DB_ERROR", error.message);

  const updated = await recomputeJobEstimatedTotal(
    input.businessId,
    input.jobId,
  );
  if (!updated.ok) return updated;

  return { ok: true, data: { estimatedTotalCents: updated.total } };
}

export async function removeJobLineItem(input: {
  businessId: string;
  jobId: string;
  lineItemId: string;
}): Promise<CreateResult<{ estimatedTotalCents: number }>> {
  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("job_line_items")
    .delete()
    .eq("id", input.lineItemId)
    .eq("business_id", input.businessId)
    .eq("job_id", input.jobId);
  if (error) return fail("DB_ERROR", error.message);

  const updated = await recomputeJobEstimatedTotal(
    input.businessId,
    input.jobId,
  );
  if (!updated.ok) return updated;
  return { ok: true, data: { estimatedTotalCents: updated.total } };
}

// -------------------------------------------------------------------------
// Status / scheduling updates
// -------------------------------------------------------------------------

export async function updateJobStatus(input: {
  businessId: string;
  jobId: string;
  status: string;
}): Promise<CreateResult<{ status: JobStatus }>> {
  if (!isJobStatus(input.status)) {
    return fail("VALIDATION_FAILED", "Unknown job status.", {
      status: "Unknown job status.",
    });
  }
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .update({ status: input.status })
    .eq("id", input.jobId)
    .eq("business_id", input.businessId)
    .select("status")
    .single();
  if (error || !data) {
    return fail("DB_ERROR", error?.message ?? "Update failed.");
  }
  return { ok: true, data: { status: data.status as JobStatus } };
}

export async function updateJobScheduling(input: {
  businessId: string;
  jobId: string;
  fields: SchedulingFieldsInput;
}): Promise<
  CreateResult<{
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    arrivalWindowLabel: string | null;
  }>
> {
  const v = validateSchedulingFields(input.fields);
  if (!v.ok) return validationFail(v.errors);

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("jobs")
    .update({
      scheduled_start_at: v.data.scheduledStartAt,
      scheduled_end_at: v.data.scheduledEndAt,
      arrival_window_label: v.data.arrivalWindowLabel,
    })
    .eq("id", input.jobId)
    .eq("business_id", input.businessId);
  if (error) return fail("DB_ERROR", error.message);

  return { ok: true, data: v.data };
}

// -------------------------------------------------------------------------
// Shared insert path
// -------------------------------------------------------------------------

type InsertJobInput = {
  contactId: string;
  propertyId: string | null;
  quoteId: string | null;
  title: string;
  summary: string | null;
  status: JobStatus;
  source: "manual" | "quote";
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
};

type InsertLineInput = {
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number | null;
  source: JobLineItemSource;
};

async function insertJobWithLineItems(input: {
  businessId: string;
  job: InsertJobInput;
  lineItems: ReadonlyArray<InsertLineInput>;
  parserMeta?: {
    snapshotSource: "line_items_snapshot" | "selected_total_fallback" | "empty";
    warnings: string[];
  };
}): Promise<
  CreateResult<{
    jobId: string;
    estimatedTotalCents: number;
    lineItemCount: number;
    snapshotSource?: "line_items_snapshot" | "selected_total_fallback" | "empty";
    warnings?: string[];
  }>
> {
  const sb = createServiceRoleClient();

  // 1) Insert the parent row with estimated_total_cents = 0; we'll
  // recompute after the children land.
  const { data: jobRow, error: jobErr } = await sb
    .from("jobs")
    .insert({
      business_id: input.businessId,
      contact_id: input.job.contactId,
      property_id: input.job.propertyId,
      quote_id: input.job.quoteId,
      title: input.job.title,
      summary: input.job.summary,
      status: input.job.status,
      source: input.job.source,
      scheduled_start_at: input.job.scheduledStartAt,
      scheduled_end_at: input.job.scheduledEndAt,
      arrival_window_label: input.job.arrivalWindowLabel,
      estimated_total_cents: 0,
    })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    return fail("DB_ERROR", jobErr?.message ?? "Job insert failed.");
  }
  const jobId = jobRow.id as string;

  // 2) Bulk-insert line items (when any).
  if (input.lineItems.length > 0) {
    const rows = input.lineItems.map((li, idx) => ({
      business_id: input.businessId,
      job_id: jobId,
      service_id: li.serviceId,
      name: li.name,
      description: li.description,
      quantity: li.quantity,
      unit_price_cents: li.unitPriceCents,
      total_cents: li.totalCents,
      sort_order: li.sortOrder ?? idx,
      source: li.source,
    }));
    const { error: liErr } = await sb.from("job_line_items").insert(rows);
    if (liErr) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: `Job ${jobId} was created but line item insert failed: ${liErr.message}`,
        },
      };
    }
  }

  // 3) Recompute snapshot total from the actual inserted rows.
  const totalRes = await recomputeJobEstimatedTotal(input.businessId, jobId);
  if (!totalRes.ok) return totalRes;

  return {
    ok: true,
    data: {
      jobId,
      estimatedTotalCents: totalRes.total,
      lineItemCount: input.lineItems.length,
      snapshotSource: input.parserMeta?.snapshotSource,
      warnings: input.parserMeta?.warnings,
    },
  };
}

type RecomputeResult =
  | { ok: true; total: number }
  | {
      ok: false;
      error: { code: string; message: string };
    };

async function recomputeJobEstimatedTotal(
  businessId: string,
  jobId: string,
): Promise<RecomputeResult> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("job_line_items")
    .select("total_cents")
    .eq("business_id", businessId)
    .eq("job_id", jobId);
  if (error) {
    return { ok: false, error: { code: "DB_ERROR", message: error.message } };
  }

  const total = computeJobEstimatedTotal(
    (data ?? []).map((r) => ({ totalCents: Number(r.total_cents ?? 0) })),
  );

  const { error: updErr } = await sb
    .from("jobs")
    .update({ estimated_total_cents: total })
    .eq("id", jobId)
    .eq("business_id", businessId);
  if (updErr) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: updErr.message },
    };
  }

  return { ok: true, total };
}

async function ensureJobOwned(
  businessId: string,
  jobId: string,
): Promise<{ ok: true } | CreateResult<never>> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("jobs")
    .select("id,business_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return fail("DB_ERROR", error.message);
  if (!data || data.business_id !== businessId) {
    return fail("FOREIGN_BUSINESS", "Job not found for this business.");
  }
  return { ok: true };
}

// Coerce a `ParsedQuoteLineItem` into the same shape `insertJobWithLineItems`
// uses internally. The parser already validated the values; this is
// just a structural rename.
function parsedLineToLineItem(p: ParsedQuoteLineItem): InsertLineInput {
  return {
    serviceId: p.serviceId,
    name: p.name,
    description: p.description,
    quantity: p.quantity,
    unitPriceCents: p.unitPriceCents,
    totalCents: p.totalCents,
    sortOrder: p.sortOrder,
    source: p.source,
  };
}
