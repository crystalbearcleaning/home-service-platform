"use server";

import { revalidatePath } from "next/cache";

import { createActivity } from "@/core/activity/logger";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { parseDollarsToCents } from "@/core/door-hanger/calculations";
import {
  addJobLineItem,
  createJobFromQuote,
  createManualJob,
  removeJobLineItem,
  updateJobLineItem,
  updateJobScheduling,
  updateJobStatus,
} from "@/core/jobs/admin-create";
import { getJob } from "@/core/jobs/admin-data";
import type { JobLineItemSource } from "@/core/jobs/constants";
import { createInvoiceFromJob } from "@/core/invoices/admin-create";
import { isJobCompletionEligibleStatus } from "@/core/invoices/job-completion";

// =========================================================================
// Phase 9D — /admin/jobs server actions.
//
// Six actions: create manual job, update status, update scheduling,
// add line item, update line item, remove line item.
//
// All actions resolve auth + active business, then delegate to the
// Phase 9B server-only helpers (which re-validate + recompute the
// estimated_total_cents snapshot in the same handler). No CRM
// notifications, no message-engine calls, no public /q changes.
// =========================================================================

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

async function requireBusiness(): Promise<
  | { ok: true; userId: string; businessId: string }
  | { ok: false; error: { code: string; message: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Sign-in required." },
    };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

function revalidateAfterJobMutation(jobId?: string) {
  revalidatePath("/admin/jobs");
  if (jobId) revalidatePath(`/admin/jobs/${jobId}`);
}

// =========================================================================
// Create manual job
// =========================================================================

export type CreateManualJobLineItemFormInput = {
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: string | number;
  unitPriceDollars: string;
  sortOrder?: number | null;
  source: JobLineItemSource;
};

export type CreateManualJobFormInput = {
  contactId: string;
  propertyId: string | null;
  title: string;
  summary: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
  lineItems: ReadonlyArray<CreateManualJobLineItemFormInput>;
};

export async function createManualJobAction(
  input: CreateManualJobFormInput,
): Promise<ActionResult<{ jobId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  // Boundary: dollars → cents. Surface as a field error per line.
  const lineItems: Array<{
    serviceId: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    sortOrder?: number | null;
    source: JobLineItemSource;
  }> = [];
  const fieldErrors: Record<string, string> = {};

  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    fieldErrors["lineItems"] = "Add at least one line item.";
  } else {
    input.lineItems.forEach((li, idx) => {
      const cents = parseDollarsToCents(li.unitPriceDollars);
      if (!cents.ok) {
        fieldErrors[`lineItems[${idx}].unitPriceDollars`] =
          cents.reason === "NEGATIVE"
            ? "Unit price cannot be negative."
            : "Unit price must be a number.";
        return;
      }
      lineItems.push({
        serviceId: li.serviceId,
        name: li.name,
        description: li.description,
        quantity: Number(li.quantity),
        unitPriceCents: cents.cents ?? 0,
        sortOrder: li.sortOrder ?? idx,
        source: li.source,
      });
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more line items are invalid.",
        fieldErrors,
      },
    };
  }

  const result = await createManualJob({
    businessId: auth.businessId,
    form: {
      contactId: input.contactId,
      propertyId: input.propertyId,
      title: input.title,
      summary: input.summary,
      scheduledStartAt: input.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt,
      arrivalWindowLabel: input.arrivalWindowLabel,
    },
    lineItems,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Soft-fail activity row for the manual creation path (Phase 9F).
  // Pattern matches Phase 9E's `job.created_from_quote` write.
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.created_manually",
    summary: `Job created manually: ${input.title.trim()}`,
    relatedObjectType: "job",
    relatedObjectId: result.data.jobId,
    details: {
      contact_id: input.contactId,
      property_id: input.propertyId,
      line_item_count: result.data.lineItemCount,
      estimated_total_cents: result.data.estimatedTotalCents,
    },
  });

  revalidateAfterJobMutation(result.data.jobId);
  return { ok: true, data: { jobId: result.data.jobId } };
}

// =========================================================================
// Status update
// =========================================================================

export async function updateJobStatusAction(input: {
  jobId: string;
  status: string;
}): Promise<ActionResult<{ status: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const r = await updateJobStatus({
    businessId: auth.businessId,
    jobId: input.jobId,
    status: input.status,
  });
  if (!r.ok) return { ok: false, error: r.error };

  // Soft-fail status-change activity (Phase 9F). No message-automation
  // trigger — the Phase 6D GHL guardrail is not reached.
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.status_changed",
    summary: `Job status changed to ${r.data.status}`,
    relatedObjectType: "job",
    relatedObjectId: input.jobId,
    details: { status: r.data.status },
  });

  revalidateAfterJobMutation(input.jobId);
  return { ok: true, data: { status: r.data.status } };
}

// =========================================================================
// Scheduling update
// =========================================================================

export async function updateJobSchedulingAction(input: {
  jobId: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
}): Promise<
  ActionResult<{
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    arrivalWindowLabel: string | null;
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const r = await updateJobScheduling({
    businessId: auth.businessId,
    jobId: input.jobId,
    fields: {
      scheduledStartAt: input.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt,
      arrivalWindowLabel: input.arrivalWindowLabel,
    },
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidateAfterJobMutation(input.jobId);
  return { ok: true, data: r.data };
}

// =========================================================================
// Line item add / update / remove
// =========================================================================

export type LineItemFormInput = {
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: string | number;
  unitPriceDollars: string;
  sortOrder?: number | null;
  source: JobLineItemSource;
};

function parseLineItemForBackend(
  form: LineItemFormInput,
):
  | {
      ok: true;
      data: {
        serviceId: string | null;
        name: string;
        description: string | null;
        quantity: number;
        unitPriceCents: number;
        sortOrder?: number | null;
        source: JobLineItemSource;
      };
    }
  | { ok: false; error: ActionResult<never>["error"] } {
  const cents = parseDollarsToCents(form.unitPriceDollars);
  if (!cents.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Unit price is invalid.",
        fieldErrors: {
          unitPriceDollars:
            cents.reason === "NEGATIVE"
              ? "Unit price cannot be negative."
              : "Unit price must be a number.",
        },
      },
    };
  }
  return {
    ok: true,
    data: {
      serviceId: form.serviceId,
      name: form.name,
      description: form.description,
      quantity: Number(form.quantity),
      unitPriceCents: cents.cents ?? 0,
      sortOrder: form.sortOrder ?? null,
      source: form.source,
    },
  };
}

export async function addJobLineItemAction(input: {
  jobId: string;
  form: LineItemFormInput;
}): Promise<ActionResult<{ lineItemId: string; estimatedTotalCents: number }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const parsed = parseLineItemForBackend(input.form);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const r = await addJobLineItem({
    businessId: auth.businessId,
    jobId: input.jobId,
    form: parsed.data,
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidateAfterJobMutation(input.jobId);
  return { ok: true, data: r.data };
}

export async function updateJobLineItemAction(input: {
  jobId: string;
  lineItemId: string;
  form: LineItemFormInput;
}): Promise<ActionResult<{ estimatedTotalCents: number }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const parsed = parseLineItemForBackend(input.form);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const r = await updateJobLineItem({
    businessId: auth.businessId,
    jobId: input.jobId,
    lineItemId: input.lineItemId,
    form: parsed.data,
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidateAfterJobMutation(input.jobId);
  return { ok: true, data: r.data };
}

export async function removeJobLineItemAction(input: {
  jobId: string;
  lineItemId: string;
}): Promise<ActionResult<{ estimatedTotalCents: number }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const r = await removeJobLineItem({
    businessId: auth.businessId,
    jobId: input.jobId,
    lineItemId: input.lineItemId,
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidateAfterJobMutation(input.jobId);
  return { ok: true, data: r.data };
}

// =========================================================================
// Quote → Job conversion (Phase 9E)
// =========================================================================

export type CreateJobFromQuotePayload = {
  jobId: string;
  estimatedTotalCents: number;
  lineItemCount: number;
  snapshotSource: "line_items_snapshot" | "selected_total_fallback" | "empty";
  warnings: string[];
};

export async function createJobFromQuoteAction(input: {
  quoteId: string;
  title?: string | null;
  summary?: string | null;
}): Promise<ActionResult<CreateJobFromQuotePayload>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const result = await createJobFromQuote({
    businessId: auth.businessId,
    quoteId: input.quoteId,
    title: input.title ?? null,
    summary: input.summary ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Soft-write a single "job.created_from_quote" activity row. Failure
  // is non-blocking — the job is real; the activity is a feed entry.
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.created_from_quote",
    summary: "Job created from quote",
    relatedObjectType: "job",
    relatedObjectId: result.data.jobId,
    details: {
      quote_id: input.quoteId,
      line_item_count: result.data.lineItemCount,
      snapshot_source: result.data.snapshotSource,
      warnings: result.data.warnings,
    },
  });

  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${result.data.jobId}`);
  revalidatePath(`/admin/quotes/${input.quoteId}`);

  return { ok: true, data: result.data };
}

// =========================================================================
// Phase 11D — Complete Job → Create Invoice + Manual Create Invoice
// =========================================================================

export type CompleteJobAndCreateInvoicePayload = {
  jobId: string;
  invoiceId: string;
  lineItemCount: number;
  totalCents: number;
  balanceCents: number;
};

function revalidateAfterInvoiceCreate(jobId: string, invoiceId: string) {
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  // The Phase 10 schedule surface filters out completed jobs from
  // the unscheduled panel and adds them as visually-distinct cards
  // on the calendar; revalidate to keep both views fresh after a
  // completion + invoice.
  revalidatePath("/admin/schedule");
}

export async function completeJobAndCreateInvoiceAction(input: {
  jobId: string;
}): Promise<ActionResult<CompleteJobAndCreateInvoicePayload>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const jobId = input.jobId?.trim();
  if (!jobId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing jobId." },
    };
  }

  // Re-verify job ownership + status eligibility server-side.
  const job = await getJob({ businessId: auth.businessId, jobId });
  if (!job) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    };
  }
  if (!isJobCompletionEligibleStatus(job.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS",
        message: `Cannot complete a ${job.status} job.`,
      },
    };
  }

  // Flip job status to completed via the Phase 9B helper.
  const statusRes = await updateJobStatus({
    businessId: auth.businessId,
    jobId,
    status: "completed",
  });
  if (!statusRes.ok) {
    return { ok: false, error: statusRes.error };
  }

  // Create the invoice from the now-completed job. Source =
  // job_completion (default). Status = unpaid (default). Phase 11
  // doc §5: copies job_line_items → invoice_line_items as a
  // snapshot.
  const invRes = await createInvoiceFromJob({
    businessId: auth.businessId,
    jobId,
    source: "job_completion",
  });
  if (!invRes.ok) {
    // Job status is already `completed` at this point. We do NOT
    // attempt to roll the job status back — ordered writes posture
    // matches Phase 9B/10D. Surface the error so the operator can
    // retry the manual fallback.
    return { ok: false, error: invRes.error };
  }

  // Soft-fail activity rows (Phase 11 doc §18). Failures are
  // non-blocking — the job is completed and the invoice is real.
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "job.completed_with_invoice",
    summary: `Job completed: ${job.title}`,
    relatedObjectType: "job",
    relatedObjectId: jobId,
    details: {
      invoice_id: invRes.data.invoiceId,
      line_item_count: invRes.data.lineItemCount,
      total_cents: invRes.data.totalCents,
    },
  });
  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "invoice.created_from_job",
    summary: `Invoice created from completed job: ${job.title}`,
    relatedObjectType: "invoice",
    relatedObjectId: invRes.data.invoiceId,
    details: {
      job_id: jobId,
      line_item_count: invRes.data.lineItemCount,
      total_cents: invRes.data.totalCents,
      source: "job_completion",
    },
  });

  revalidateAfterInvoiceCreate(jobId, invRes.data.invoiceId);

  return {
    ok: true,
    data: {
      jobId,
      invoiceId: invRes.data.invoiceId,
      lineItemCount: invRes.data.lineItemCount,
      totalCents: invRes.data.totalCents,
      balanceCents: invRes.data.balanceCents,
    },
  };
}

// Manual fallback (§4B): creates an invoice from a job without
// touching job status. Allowed on any status — operator may want
// to re-invoice a completed job, or invoice a canceled job's
// partial work. UI surfaces existing invoices first (Phase 11C
// already renders the list); this action does not hard-block
// duplicates per §16.
export async function createInvoiceFromJobAction(input: {
  jobId: string;
}): Promise<
  ActionResult<{
    jobId: string;
    invoiceId: string;
    lineItemCount: number;
    totalCents: number;
    balanceCents: number;
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const jobId = input.jobId?.trim();
  if (!jobId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing jobId." },
    };
  }

  const job = await getJob({ businessId: auth.businessId, jobId });
  if (!job) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Job not found." },
    };
  }

  const invRes = await createInvoiceFromJob({
    businessId: auth.businessId,
    jobId,
    source: "manual",
  });
  if (!invRes.ok) {
    return { ok: false, error: invRes.error };
  }

  void createActivity({
    businessId: auth.businessId,
    actorType: "user",
    actorUserId: auth.userId,
    activityType: "invoice.created_from_job",
    summary: `Invoice created from job: ${job.title}`,
    relatedObjectType: "invoice",
    relatedObjectId: invRes.data.invoiceId,
    details: {
      job_id: jobId,
      line_item_count: invRes.data.lineItemCount,
      total_cents: invRes.data.totalCents,
      source: "manual",
    },
  });

  revalidateAfterInvoiceCreate(jobId, invRes.data.invoiceId);

  return {
    ok: true,
    data: {
      jobId,
      invoiceId: invRes.data.invoiceId,
      lineItemCount: invRes.data.lineItemCount,
      totalCents: invRes.data.totalCents,
      balanceCents: invRes.data.balanceCents,
    },
  };
}
