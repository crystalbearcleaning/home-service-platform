import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Phase 9D — server-only read helpers that feed the Create Job form
// (`/admin/jobs/new`) and the line-item editor on the detail page.
//
// Read-only; business-scoped. No external API calls. No CRM writes.
// =========================================================================

export type JobFormContactOption = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
};

export type JobFormPropertyOption = {
  id: string;
  contactId: string;
  formattedAddress: string;
  city: string | null;
  state: string | null;
};

export type JobFormServiceOption = {
  id: string;
  name: string;
  serviceCode: string;
  isAddOn: boolean;
};

const CONTACT_LIMIT = 500;
const PROPERTY_LIMIT = 1000;
const SERVICE_LIMIT = 200;

export async function listContactsForJobForm(
  businessId: string,
): Promise<JobFormContactOption[]> {
  if (!businessId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("contacts")
    .select("id,full_name,email,phone,status,created_at")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(CONTACT_LIMIT);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    fullName: typeof r.full_name === "string" ? r.full_name : "",
    email: typeof r.email === "string" && r.email.length > 0 ? r.email : null,
    phone: typeof r.phone === "string" && r.phone.length > 0 ? r.phone : null,
  }));
}

// Returns every property for the business, with `contactId` carried
// through so the client form can filter the property select down to
// the currently-selected contact's properties in one render pass.
export async function listPropertiesForJobForm(
  businessId: string,
): Promise<JobFormPropertyOption[]> {
  if (!businessId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("properties")
    .select("id,contact_id,formatted_address,city,state,created_at")
    .eq("business_id", businessId)
    .not("contact_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(PROPERTY_LIMIT);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    contactId: String(r.contact_id),
    formattedAddress:
      typeof r.formatted_address === "string" ? r.formatted_address : "",
    city: typeof r.city === "string" && r.city.length > 0 ? r.city : null,
    state: typeof r.state === "string" && r.state.length > 0 ? r.state : null,
  }));
}

export async function listPropertiesForContact(input: {
  businessId: string;
  contactId: string;
}): Promise<JobFormPropertyOption[]> {
  if (!input.businessId || !input.contactId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("properties")
    .select("id,contact_id,formatted_address,city,state,created_at")
    .eq("business_id", input.businessId)
    .eq("contact_id", input.contactId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    contactId: String(r.contact_id),
    formattedAddress:
      typeof r.formatted_address === "string" ? r.formatted_address : "",
    city: typeof r.city === "string" && r.city.length > 0 ? r.city : null,
    state: typeof r.state === "string" && r.state.length > 0 ? r.state : null,
  }));
}

export async function listServicesForJobForm(
  businessId: string,
): Promise<JobFormServiceOption[]> {
  if (!businessId) return [];
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("services")
    .select("id,name,service_code,is_add_on,is_active,sort_order")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(SERVICE_LIMIT);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    serviceCode: typeof r.service_code === "string" ? r.service_code : "",
    isAddOn: r.is_add_on === true,
  }));
}
