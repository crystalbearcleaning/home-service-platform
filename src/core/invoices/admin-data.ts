import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

import type {
  InvoiceLineItemSource,
  InvoiceSource,
  InvoiceStatus,
  PaymentMethod,
} from "./constants";

// =========================================================================
// Phase 11B — server-only read helpers for invoices +
// invoice_line_items + invoice_payments.
//
// Strictly read-only. No CRM writes. No external API calls. No
// message-engine calls. Every call site (future Server Components
// on /admin/invoices) has already verified business membership
// through the active-business resolver, so service-role reads are
// safe here.
// =========================================================================

export type InvoiceRow = {
  id: string;
  businessId: string;
  contactId: string;
  contactFullName: string | null;
  propertyId: string | null;
  propertyAddressLine: string | null;
  jobId: string;
  jobTitle: string | null;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  source: InvoiceSource;
  subtotalCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  paidAt: string | null;
  receiptSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLineItemRow = {
  id: string;
  businessId: string;
  invoiceId: string;
  jobLineItemId: string | null;
  serviceId: string | null;
  serviceName: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number | null;
  source: InvoiceLineItemSource;
  createdAt: string;
  updatedAt: string;
};

export type InvoicePaymentRow = {
  id: string;
  businessId: string;
  invoiceId: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  notes: string | null;
  createdAt: string;
};

export type ListInvoicesFilters = {
  status?: InvoiceStatus | "all";
};

const INVOICE_SELECT =
  "id,business_id,contact_id,property_id,job_id,invoice_number,status,source," +
  "subtotal_cents,total_cents,amount_paid_cents,balance_cents," +
  "paid_at,receipt_sent_at,created_at,updated_at," +
  "contacts!invoices_contact_id_fkey(full_name)," +
  "properties!invoices_property_id_fkey(address_line_1,city,state)," +
  "jobs!invoices_job_id_fkey(title)";

const LINE_ITEM_SELECT =
  "id,business_id,invoice_id,job_line_item_id,service_id," +
  "name,description,quantity,unit_price_cents,total_cents," +
  "sort_order,source,created_at,updated_at," +
  "services!invoice_line_items_service_id_fkey(name)";

const PAYMENT_SELECT =
  "id,business_id,invoice_id,amount_cents,payment_method,paid_at,notes,created_at";

const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;

export async function listInvoices(input: {
  businessId: string;
  filters?: ListInvoicesFilters;
  limit?: number;
}): Promise<InvoiceRow[]> {
  if (!input.businessId) return [];
  const sb = createServiceRoleClient();
  let q = sb
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("business_id", input.businessId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (input.filters?.status && input.filters.status !== "all") {
    q = q.eq("status", input.filters.status);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToInvoice);
}

export async function getInvoice(input: {
  businessId: string;
  invoiceId: string;
}): Promise<InvoiceRow | null> {
  if (!input.businessId || !input.invoiceId) return null;
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("business_id", input.businessId)
    .eq("id", input.invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToInvoice(data);
}

export async function getInvoiceLineItems(input: {
  businessId: string;
  invoiceId: string;
}): Promise<InvoiceLineItemRow[]> {
  if (!input.businessId || !input.invoiceId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoice_line_items")
    .select(LINE_ITEM_SELECT)
    .eq("business_id", input.businessId)
    .eq("invoice_id", input.invoiceId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToLineItem);
}

export async function getInvoicePayments(input: {
  businessId: string;
  invoiceId: string;
}): Promise<InvoicePaymentRow[]> {
  if (!input.businessId || !input.invoiceId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoice_payments")
    .select(PAYMENT_SELECT)
    .eq("business_id", input.businessId)
    .eq("invoice_id", input.invoiceId)
    .order("paid_at", { ascending: false });
  if (error || !data) return [];
  return data.map(rowToPayment);
}

export async function listInvoicesForJob(input: {
  businessId: string;
  jobId: string;
  limit?: number;
}): Promise<InvoiceRow[]> {
  if (!input.businessId || !input.jobId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("business_id", input.businessId)
    .eq("job_id", input.jobId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToInvoice);
}

export async function listInvoicesForContact(input: {
  businessId: string;
  contactId: string;
  limit?: number;
}): Promise<InvoiceRow[]> {
  if (!input.businessId || !input.contactId) return [];
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("business_id", input.businessId)
    .eq("contact_id", input.contactId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(input.limit));
  if (error || !data) return [];
  return data.map(rowToInvoice);
}

// -------------------------------------------------------------------------
// Row mappers
// -------------------------------------------------------------------------

function rowToInvoice(raw: unknown): InvoiceRow {
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

  const jobRaw = (r as { jobs?: unknown }).jobs;
  const jobObj = Array.isArray(jobRaw) ? jobRaw[0] : jobRaw;
  const jobTitle =
    jobObj && typeof jobObj === "object" && "title" in jobObj
      ? String(((jobObj as { title: unknown }).title) ?? "")
      : "";

  return {
    id: String(r.id),
    businessId: String(r.business_id),
    contactId: String(r.contact_id),
    contactFullName: contactFullName.length > 0 ? contactFullName : null,
    propertyId: r.property_id ? String(r.property_id) : null,
    propertyAddressLine,
    jobId: String(r.job_id),
    jobTitle: jobTitle.length > 0 ? jobTitle : null,
    invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
    status: String(r.status ?? "unpaid") as InvoiceStatus,
    source: String(r.source ?? "job_completion") as InvoiceSource,
    subtotalCents: Number(r.subtotal_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
    amountPaidCents: Number(r.amount_paid_cents ?? 0),
    balanceCents: Number(r.balance_cents ?? 0),
    paidAt: r.paid_at ? String(r.paid_at) : null,
    receiptSentAt: r.receipt_sent_at ? String(r.receipt_sent_at) : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function rowToLineItem(raw: unknown): InvoiceLineItemRow {
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
    invoiceId: String(r.invoice_id),
    jobLineItemId: r.job_line_item_id ? String(r.job_line_item_id) : null,
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
    source: (r.source as InvoiceLineItemSource) ?? "job",
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

function rowToPayment(raw: unknown): InvoicePaymentRow {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    invoiceId: String(r.invoice_id),
    amountCents: Number(r.amount_cents ?? 0),
    paymentMethod: (r.payment_method as PaymentMethod) ?? "other",
    paidAt: String(r.paid_at ?? ""),
    notes: r.notes ? String(r.notes) : null,
    createdAt: String(r.created_at ?? ""),
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
