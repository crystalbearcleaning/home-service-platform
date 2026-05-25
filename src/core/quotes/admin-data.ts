import "server-only";

import { createServiceRoleClient } from "@/core/auth/service-role";

// =========================================================================
// Server-only quote detail loader for Phase 4D.
// Read-only by design — Phase 4 does not edit quotes, change status,
// or trigger downstream actions.
// =========================================================================

export type AdminQuoteDetail = {
  quote: {
    id: string;
    status: string;
    customerIntent: string;
    selectedOptionKey: string | null;
    selectedTotal: number | null;
    selectedAddOns: unknown;
    selectedServicePlanId: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    sourcePluginKey: string;
    sourcePluginVersion: string;
    source: string | null;
    trackingCode: string | null;
    quotePageInteractionId: string | null;
    optionsSnapshot: unknown;
    lineItemsSnapshot: unknown;
    priceSnapshot: unknown;
    calculationSnapshot: unknown;
    propertySnapshot: unknown;
  };
  contact: {
    id: string;
    fullName: string;
    phone: string;
    email: string;
  } | null;
  property: {
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
  } | null;
  lead: {
    id: string;
    status: string;
    customerIntent: string;
    createdAt: string;
  } | null;
  tasks: Array<{
    id: string;
    status: string;
    title: string;
    taskCategory: string;
    completedAt: string | null;
    createdAt: string;
    relatedObjectId: string | null;
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

export async function getAdminQuoteDetail(input: {
  businessId: string;
  quoteId: string;
}): Promise<AdminQuoteDetail | null> {
  const sb = createServiceRoleClient();

  const { data: quoteRow } = await sb
    .from("quotes")
    .select(
      "id,business_id,status,customer_intent,selected_option_key,selected_total,selected_add_ons,selected_service_plan_id,expires_at,created_at,updated_at,source_plugin_key,source_plugin_version,source,tracking_code,quote_page_interaction_id,options_snapshot,line_items_snapshot,price_snapshot,calculation_snapshot,property_snapshot,contact_id,property_id,lead_id",
    )
    .eq("id", input.quoteId)
    .maybeSingle();

  if (!quoteRow) return null;
  if (quoteRow.business_id !== input.businessId) return null;

  const [contactRes, propertyRes, leadRes, taskRes] = await Promise.all([
    sb
      .from("contacts")
      .select("id,full_name,phone,email")
      .eq("id", quoteRow.contact_id)
      .maybeSingle(),
    sb
      .from("properties")
      .select(
        "id,formatted_address,address_line_1,city,state,postal_code,service_area_status,square_footage,property_type,property_data_status",
      )
      .eq("id", quoteRow.property_id)
      .maybeSingle(),
    sb
      .from("leads")
      .select("id,status,customer_intent,created_at")
      .eq("id", quoteRow.lead_id)
      .maybeSingle(),
    sb
      .from("tasks")
      .select(
        "id,status,title,task_category,completed_at,created_at,related_object_id",
      )
      .eq("business_id", input.businessId)
      .eq("related_object_type", "lead")
      .eq("related_object_id", quoteRow.lead_id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const relatedIds = [quoteRow.id, quoteRow.lead_id, quoteRow.contact_id];
  const { data: activityRows } = await sb
    .from("activities")
    .select(
      "id,activity_type,summary,created_at,related_object_type,related_object_id",
    )
    .eq("business_id", input.businessId)
    .in("related_object_id", relatedIds)
    .order("created_at", { ascending: false })
    .limit(15);

  return {
    quote: {
      id: quoteRow.id,
      status: quoteRow.status,
      customerIntent: quoteRow.customer_intent,
      selectedOptionKey: quoteRow.selected_option_key,
      selectedTotal: quoteRow.selected_total,
      selectedAddOns: quoteRow.selected_add_ons,
      selectedServicePlanId: quoteRow.selected_service_plan_id,
      expiresAt: quoteRow.expires_at,
      createdAt: quoteRow.created_at,
      updatedAt: quoteRow.updated_at,
      sourcePluginKey: quoteRow.source_plugin_key,
      sourcePluginVersion: quoteRow.source_plugin_version,
      source: quoteRow.source,
      trackingCode: quoteRow.tracking_code,
      quotePageInteractionId: quoteRow.quote_page_interaction_id,
      optionsSnapshot: quoteRow.options_snapshot,
      lineItemsSnapshot: quoteRow.line_items_snapshot,
      priceSnapshot: quoteRow.price_snapshot,
      calculationSnapshot: quoteRow.calculation_snapshot,
      propertySnapshot: quoteRow.property_snapshot,
    },
    contact: contactRes.data
      ? {
          id: contactRes.data.id,
          fullName: contactRes.data.full_name,
          phone: contactRes.data.phone,
          email: contactRes.data.email,
        }
      : null,
    property: propertyRes.data
      ? {
          id: propertyRes.data.id,
          formattedAddress: propertyRes.data.formatted_address,
          addressLine1: propertyRes.data.address_line_1,
          city: propertyRes.data.city,
          state: propertyRes.data.state,
          postalCode: propertyRes.data.postal_code,
          serviceAreaStatus: propertyRes.data.service_area_status,
          squareFootage: propertyRes.data.square_footage,
          propertyType: propertyRes.data.property_type,
          propertyDataStatus: propertyRes.data.property_data_status,
        }
      : null,
    lead: leadRes.data
      ? {
          id: leadRes.data.id,
          status: leadRes.data.status,
          customerIntent: leadRes.data.customer_intent,
          createdAt: leadRes.data.created_at,
        }
      : null,
    tasks: (taskRes.data ?? []).map((t) => ({
      id: t.id,
      status: t.status,
      title: t.title,
      taskCategory: t.task_category,
      completedAt: t.completed_at,
      createdAt: t.created_at,
      relatedObjectId: t.related_object_id,
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
