// Phase 9B — pure validation for jobs + job_line_items create / update.
//
// Mirrors the CHECK constraints in
// `supabase/migrations/20260603120000_phase_9_jobs.sql` so the
// operator gets field-level errors before any DB round-trip. The
// server-only create / update helpers re-validate before inserting.
//
// No DB, no env, no `server-only`. Safe to import from anywhere.

import {
  isJobLineItemSource,
  isJobSource,
  isJobStatus,
  type JobLineItemSource,
  type JobSource,
  type JobStatus,
} from "./constants";

const JOB_TITLE_MAX = 200;
const JOB_SUMMARY_MAX = 2000;
const ARRIVAL_WINDOW_MAX = 120;
const LINE_NAME_MAX = 200;
const LINE_DESCRIPTION_MAX = 2000;

export type FieldError = { field: string; message: string };

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldError[] };

// -------------------------------------------------------------------------
// Job form
// -------------------------------------------------------------------------

export type JobFormInput = {
  contactId: string | null | undefined;
  propertyId?: string | null;
  quoteId?: string | null;
  title: string | null | undefined;
  summary?: string | null;
  status?: string | null;
  source?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  arrivalWindowLabel?: string | null;
};

export type JobValidated = {
  contactId: string;
  propertyId: string | null;
  quoteId: string | null;
  title: string;
  summary: string | null;
  status: JobStatus;
  source: JobSource;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
};

export function validateJobForm(
  input: JobFormInput,
  defaults: { status?: JobStatus; source?: JobSource } = {},
): ValidationResult<JobValidated> {
  const errors: FieldError[] = [];

  const contactId = (input.contactId ?? "").trim();
  if (contactId.length === 0) {
    errors.push({ field: "contactId", message: "Contact is required." });
  }

  const title = (input.title ?? "").trim();
  if (title.length === 0) {
    errors.push({ field: "title", message: "Job title is required." });
  } else if (title.length > JOB_TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Title must be ${JOB_TITLE_MAX} characters or fewer.`,
    });
  }

  const summary = trimOrNull(input.summary, JOB_SUMMARY_MAX, "summary", errors);

  const status: JobStatus = isJobStatus(input.status)
    ? input.status
    : (defaults.status ?? "draft");
  if (input.status && !isJobStatus(input.status)) {
    errors.push({ field: "status", message: "Unknown job status." });
  }

  const source: JobSource = isJobSource(input.source)
    ? input.source
    : (defaults.source ?? "manual");
  if (input.source && !isJobSource(input.source)) {
    errors.push({ field: "source", message: "Unknown job source." });
  }

  const sched = validateSchedulingFields({
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
    arrivalWindowLabel: input.arrivalWindowLabel,
  });
  if (!sched.ok) {
    errors.push(...sched.errors);
  }

  const propertyId = nullableId(input.propertyId);
  const quoteId = nullableId(input.quoteId);

  if (errors.length > 0) return { ok: false, errors };
  if (!sched.ok) return { ok: false, errors };

  return {
    ok: true,
    data: {
      contactId,
      propertyId,
      quoteId,
      title,
      summary,
      status,
      source,
      scheduledStartAt: sched.data.scheduledStartAt,
      scheduledEndAt: sched.data.scheduledEndAt,
      arrivalWindowLabel: sched.data.arrivalWindowLabel,
    },
  };
}

// -------------------------------------------------------------------------
// Scheduling fields (standalone — used by the dedicated "edit schedule"
// server helper as well as inside validateJobForm).
// -------------------------------------------------------------------------

export type SchedulingFieldsInput = {
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  arrivalWindowLabel?: string | null;
};

export type SchedulingFieldsValidated = {
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  arrivalWindowLabel: string | null;
};

export function validateSchedulingFields(
  input: SchedulingFieldsInput,
): ValidationResult<SchedulingFieldsValidated> {
  const errors: FieldError[] = [];

  const start = parseOptionalIso(input.scheduledStartAt);
  if (!start.ok) {
    errors.push({
      field: "scheduledStartAt",
      message: "Scheduled start is not a valid date/time.",
    });
  }
  const end = parseOptionalIso(input.scheduledEndAt);
  if (!end.ok) {
    errors.push({
      field: "scheduledEndAt",
      message: "Scheduled end is not a valid date/time.",
    });
  }
  if (
    start.ok &&
    end.ok &&
    start.iso !== null &&
    end.iso !== null &&
    new Date(end.iso).getTime() < new Date(start.iso).getTime()
  ) {
    errors.push({
      field: "scheduledEndAt",
      message: "Scheduled end must be on or after scheduled start.",
    });
  }

  const arrivalWindowLabel = trimOrNull(
    input.arrivalWindowLabel,
    ARRIVAL_WINDOW_MAX,
    "arrivalWindowLabel",
    errors,
  );

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      scheduledStartAt: start.ok ? start.iso : null,
      scheduledEndAt: end.ok ? end.iso : null,
      arrivalWindowLabel,
    },
  };
}

// -------------------------------------------------------------------------
// Job line item form
// -------------------------------------------------------------------------

export type JobLineItemFormInput = {
  serviceId?: string | null;
  name: string | null | undefined;
  description?: string | null;
  quantity: number | null | undefined;
  unitPriceCents: number | null | undefined;
  sortOrder?: number | null;
  source: string | null | undefined;
};

export type JobLineItemValidated = {
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number | null;
  source: JobLineItemSource;
};

export function validateJobLineItemForm(
  input: JobLineItemFormInput,
): ValidationResult<JobLineItemValidated> {
  const errors: FieldError[] = [];

  const serviceId = nullableId(input.serviceId);

  const name = (input.name ?? "").trim();
  if (name.length === 0) {
    errors.push({ field: "name", message: "Line item name is required." });
  } else if (name.length > LINE_NAME_MAX) {
    errors.push({
      field: "name",
      message: `Name must be ${LINE_NAME_MAX} characters or fewer.`,
    });
  }

  const description = trimOrNull(
    input.description,
    LINE_DESCRIPTION_MAX,
    "description",
    errors,
  );

  const qRaw = input.quantity;
  let quantity = 0;
  if (qRaw === null || qRaw === undefined || !Number.isFinite(Number(qRaw))) {
    errors.push({ field: "quantity", message: "Quantity is required." });
  } else if (Number(qRaw) <= 0) {
    errors.push({ field: "quantity", message: "Quantity must be greater than zero." });
  } else {
    quantity = Math.round(Number(qRaw) * 100) / 100;
  }

  const pRaw = input.unitPriceCents;
  let unitPriceCents = 0;
  if (
    pRaw === null ||
    pRaw === undefined ||
    !Number.isFinite(Number(pRaw))
  ) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price is required.",
    });
  } else if (Number(pRaw) < 0) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price cannot be negative.",
    });
  } else if (!Number.isInteger(Number(pRaw))) {
    errors.push({
      field: "unitPriceCents",
      message: "Unit price must be a whole number of cents.",
    });
  } else {
    unitPriceCents = Math.floor(Number(pRaw));
  }

  let source: JobLineItemSource = "custom";
  if (!isJobLineItemSource(input.source)) {
    errors.push({ field: "source", message: "Unknown line item source." });
  } else {
    source = input.source;
  }

  let sortOrder: number | null = null;
  if (input.sortOrder !== null && input.sortOrder !== undefined) {
    const s = Number(input.sortOrder);
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 0) {
      errors.push({
        field: "sortOrder",
        message: "Sort order must be a non-negative integer.",
      });
    } else {
      sortOrder = s;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // total recompute at validation time so the data passed forward
  // already has the snapshot the row will be inserted with.
  const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

  return {
    ok: true,
    data: {
      serviceId,
      name,
      description,
      quantity,
      unitPriceCents,
      totalCents,
      sortOrder,
      source,
    },
  };
}

// -------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------

function trimOrNull(
  v: string | null | undefined,
  max: number,
  field: string,
  errors: FieldError[],
): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  if (s.length > max) {
    errors.push({
      field,
      message: `${field} must be ${max} characters or fewer.`,
    });
  }
  return s;
}

function nullableId(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function parseOptionalIso(
  v: string | null | undefined,
): { ok: true; iso: string | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, iso: null };
  const s = String(v).trim();
  if (s.length === 0) return { ok: true, iso: null };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, iso: d.toISOString() };
}
