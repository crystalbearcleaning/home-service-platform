import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Server-only data loaders for the Phase 4B Contacts admin pages.
//
// Each loader fans out a small number of batched queries (no N+1
// per-contact reads) and returns plain objects shaped for the UI.
// =========================================================================

export type AdminContactSummary = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  primaryProperty: {
    id: string;
    formattedAddress: string;
    city: string;
  } | null;
  latestLeadStatus: string | null;
  latestQuoteStatus: string | null;
  openTaskCount: number;
  lastActivityAt: string | null;
  addressesJoined: string;
};

export type AdminContactDetail = {
  contact: {
    id: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    phone: string;
    email: string;
    status: string;
    source: string | null;
    createdAt: string;
    updatedAt: string;
  };
  properties: Array<{
    id: string;
    formattedAddress: string;
    addressLine1: string | null;
    city: string;
    state: string;
    postalCode: string | null;
    serviceAreaStatus: string;
    squareFootage: number | null;
    propertyType: string | null;
    propertyDataStatus: string;
    lastEnrichedAt: string | null;
  }>;
  leads: Array<{
    id: string;
    status: string;
    customerIntent: string;
    createdAt: string;
    quotePageInteractionId: string | null;
  }>;
  quotes: Array<{
    id: string;
    status: string;
    selectedOptionKey: string | null;
    selectedTotal: number | null;
    expiresAt: string;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    status: string;
    title: string;
    taskCategory: string;
    completedAt: string | null;
    createdAt: string;
    relatedObjectId: string | null;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    relatedObjectType: string;
    relatedObjectId: string;
  }>;
  activity: Array<{
    id: string;
    activityType: string;
    summary: string;
    createdAt: string;
    relatedObjectType: string | null;
    relatedObjectId: string | null;
  }>;
};

// -------------------------------------------------------------------------
// listAdminContacts — list-page rows with enrichment in 5 batched queries.
// -------------------------------------------------------------------------
export async function listAdminContacts(
  businessId: string,
): Promise<AdminContactSummary[]> {
  const sb = createServiceRoleClient();

  const { data: contactRows } = await sb
    .from("contacts")
    .select("id,full_name,phone,email,status,updated_at,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (!contactRows || contactRows.length === 0) return [];

  const contactIds = contactRows.map((c) => c.id);

  const [propsRes, leadsRes, quotesRes] = await Promise.all([
    sb
      .from("properties")
      .select("id,contact_id,formatted_address,city,created_at")
      .eq("business_id", businessId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false }),
    sb
      .from("leads")
      .select("id,contact_id,status,created_at")
      .eq("business_id", businessId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false }),
    sb
      .from("quotes")
      .select("id,contact_id,status,created_at")
      .eq("business_id", businessId)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false }),
  ]);

  // Build per-contact lookups (first row encountered is the most recent
  // because we ordered desc).
  const primaryPropertyByContact = new Map<
    string,
    { id: string; formattedAddress: string; city: string }
  >();
  const addressesByContact = new Map<string, string[]>();
  for (const p of propsRes.data ?? []) {
    if (!primaryPropertyByContact.has(p.contact_id)) {
      primaryPropertyByContact.set(p.contact_id, {
        id: p.id,
        formattedAddress: p.formatted_address,
        city: p.city,
      });
    }
    const list = addressesByContact.get(p.contact_id) ?? [];
    list.push(p.formatted_address);
    addressesByContact.set(p.contact_id, list);
  }

  const latestLeadStatusByContact = new Map<string, string>();
  const leadIdsByContact = new Map<string, string[]>();
  const leadIdToContactId = new Map<string, string>();
  const latestLeadCreatedByContact = new Map<string, string>();
  for (const l of leadsRes.data ?? []) {
    if (!latestLeadStatusByContact.has(l.contact_id)) {
      latestLeadStatusByContact.set(l.contact_id, l.status);
      latestLeadCreatedByContact.set(l.contact_id, l.created_at);
    }
    const list = leadIdsByContact.get(l.contact_id) ?? [];
    list.push(l.id);
    leadIdsByContact.set(l.contact_id, list);
    leadIdToContactId.set(l.id, l.contact_id);
  }

  const latestQuoteStatusByContact = new Map<string, string>();
  const latestQuoteCreatedByContact = new Map<string, string>();
  for (const q of quotesRes.data ?? []) {
    if (!latestQuoteStatusByContact.has(q.contact_id)) {
      latestQuoteStatusByContact.set(q.contact_id, q.status);
      latestQuoteCreatedByContact.set(q.contact_id, q.created_at);
    }
  }

  // Open task count via the contact's lead ids.
  const allLeadIds = [...leadIdToContactId.keys()];
  const openTaskByContact = new Map<string, number>();
  if (allLeadIds.length > 0) {
    const { data: taskRows } = await sb
      .from("tasks")
      .select("id,related_object_id,related_object_type,status")
      .eq("business_id", businessId)
      .eq("status", "open")
      .eq("related_object_type", "lead")
      .in("related_object_id", allLeadIds);
    for (const t of taskRows ?? []) {
      const leadId = t.related_object_id;
      if (!leadId) continue;
      const contactId = leadIdToContactId.get(leadId);
      if (!contactId) continue;
      openTaskByContact.set(
        contactId,
        (openTaskByContact.get(contactId) ?? 0) + 1,
      );
    }
  }

  return contactRows.map((c) => {
    const lastActivityAt = maxIso([
      c.updated_at,
      latestLeadCreatedByContact.get(c.id) ?? null,
      latestQuoteCreatedByContact.get(c.id) ?? null,
    ]);
    return {
      id: c.id,
      fullName: c.full_name,
      phone: c.phone,
      email: c.email,
      primaryProperty: primaryPropertyByContact.get(c.id) ?? null,
      latestLeadStatus: latestLeadStatusByContact.get(c.id) ?? null,
      latestQuoteStatus: latestQuoteStatusByContact.get(c.id) ?? null,
      openTaskCount: openTaskByContact.get(c.id) ?? 0,
      lastActivityAt,
      addressesJoined: (addressesByContact.get(c.id) ?? []).join(" "),
    };
  });
}

function maxIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

// -------------------------------------------------------------------------
// getAdminContactDetail — customer hub: contact + properties + leads +
// quotes + tasks + notes + activity. Returns null when not found / not
// for the active business.
// -------------------------------------------------------------------------
export async function getAdminContactDetail(input: {
  businessId: string;
  contactId: string;
}): Promise<AdminContactDetail | null> {
  const sb = createServiceRoleClient();

  const { data: contactRow } = await sb
    .from("contacts")
    .select(
      "id,business_id,full_name,first_name,last_name,phone,email,status,source,created_at,updated_at",
    )
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contactRow) return null;
  if (contactRow.business_id !== input.businessId) return null;

  const [propsRes, leadsRes, quotesRes, notesRes] = await Promise.all([
    sb
      .from("properties")
      .select(
        "id,formatted_address,address_line_1,city,state,postal_code,service_area_status,square_footage,property_type,property_data_status,last_enriched_at,created_at",
      )
      .eq("business_id", input.businessId)
      .eq("contact_id", input.contactId)
      .order("created_at", { ascending: false }),
    sb
      .from("leads")
      .select("id,status,customer_intent,created_at,quote_page_interaction_id")
      .eq("business_id", input.businessId)
      .eq("contact_id", input.contactId)
      .order("created_at", { ascending: false }),
    sb
      .from("quotes")
      .select(
        "id,status,selected_option_key,selected_total,expires_at,created_at",
      )
      .eq("business_id", input.businessId)
      .eq("contact_id", input.contactId)
      .order("created_at", { ascending: false }),
    sb
      .from("notes")
      .select("id,body,created_at,related_object_type,related_object_id")
      .eq("business_id", input.businessId)
      .eq("related_object_type", "contact")
      .eq("related_object_id", input.contactId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const leadIds = (leadsRes.data ?? []).map((l) => l.id);
  const quoteIds = (quotesRes.data ?? []).map((q) => q.id);

  // Tasks linked via lead.
  let tasks: AdminContactDetail["tasks"] = [];
  if (leadIds.length > 0) {
    const { data: taskRows } = await sb
      .from("tasks")
      .select(
        "id,status,title,task_category,completed_at,created_at,related_object_id",
      )
      .eq("business_id", input.businessId)
      .eq("related_object_type", "lead")
      .in("related_object_id", leadIds)
      .order("created_at", { ascending: false });
    tasks = (taskRows ?? []).map((t) => ({
      id: t.id,
      status: t.status,
      title: t.title,
      taskCategory: t.task_category,
      completedAt: t.completed_at,
      createdAt: t.created_at,
      relatedObjectId: t.related_object_id,
    }));
  }

  // Activity across contact, leads, quotes, tasks.
  const relatedIds = [
    input.contactId,
    ...leadIds,
    ...quoteIds,
    ...tasks.map((t) => t.id),
  ];
  const { data: activityRows } = await sb
    .from("activities")
    .select(
      "id,activity_type,summary,created_at,related_object_type,related_object_id",
    )
    .eq("business_id", input.businessId)
    .in("related_object_id", relatedIds)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    contact: {
      id: contactRow.id,
      fullName: contactRow.full_name,
      firstName: contactRow.first_name,
      lastName: contactRow.last_name,
      phone: contactRow.phone,
      email: contactRow.email,
      status: contactRow.status,
      source: contactRow.source,
      createdAt: contactRow.created_at,
      updatedAt: contactRow.updated_at,
    },
    properties: (propsRes.data ?? []).map((p) => ({
      id: p.id,
      formattedAddress: p.formatted_address,
      addressLine1: p.address_line_1,
      city: p.city,
      state: p.state,
      postalCode: p.postal_code,
      serviceAreaStatus: p.service_area_status,
      squareFootage: p.square_footage,
      propertyType: p.property_type,
      propertyDataStatus: p.property_data_status,
      lastEnrichedAt: p.last_enriched_at,
    })),
    leads: (leadsRes.data ?? []).map((l) => ({
      id: l.id,
      status: l.status,
      customerIntent: l.customer_intent,
      createdAt: l.created_at,
      quotePageInteractionId: l.quote_page_interaction_id,
    })),
    quotes: (quotesRes.data ?? []).map((q) => ({
      id: q.id,
      status: q.status,
      selectedOptionKey: q.selected_option_key,
      selectedTotal: q.selected_total,
      expiresAt: q.expires_at,
      createdAt: q.created_at,
    })),
    tasks,
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
      relatedObjectType: n.related_object_type,
      relatedObjectId: n.related_object_id,
    })),
    activity: (activityRows ?? []).map((a) => ({
      id: a.id,
      activityType: a.activity_type,
      summary: a.summary,
      createdAt: a.created_at,
      relatedObjectType: a.related_object_type,
      relatedObjectId: a.related_object_id,
    })),
  };
}

