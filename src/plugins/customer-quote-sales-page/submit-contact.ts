import "server-only";
import { createOrReuseContact } from "@/core/contacts/create";
import { createPropertyForSubmission } from "@/core/properties/create";
import { createLeadFromInteraction } from "@/core/leads/create";
import { createQuoteFromInteraction } from "@/core/quotes/create";
import { createTask } from "@/core/tasks/create";
import { publishEvent } from "@/core/events/bus";
import { createActivity } from "@/core/activity/logger";
import { loadQuoteExpirationSetting } from "@/core/business/quote-settings";
import { WINDOW_CLEANING_AUTO_QUOTE } from "@/plugins/window-cleaning-auto-quote/manifest";
import { CUSTOMER_QUOTE_SALES_PAGE } from "./manifest";
import {
  loadInteractionForSubmission,
  markInteractionConverted,
} from "./load-interaction";
import {
  computeExpiresAtIso,
  kindFromInteractionStatus,
  leadStatusForKind,
  resolveExpirationDays,
  taskCategoryForKind,
  taskTitleForKind,
  validateContactForm,
  validateSelectionAgainstQuote,
  type ContactFormInput,
  type SelectionInput,
  type SubmitContactResult,
  type SubmitKind,
  type ValidatedSelection,
} from "./submit-mapping";
import type { OptionKey } from "@/plugins/window-cleaning-auto-quote/types";

// Re-export the public result types so the barrel and consumers can
// still import them from this orchestrator path. They are defined in
// `submit-mapping.ts` (no server-only) so the client bundle is safe.
export type {
  SubmitContactSuccess,
  SubmitContactError,
  SubmitContactErrorCode,
  SubmitContactResult,
} from "./submit-mapping";

// =========================================================================
// C3 orchestrator: convert a quote_page_interaction into core records.
//
// Never throws. Returns SubmitContactResult.
// Execution order matters because later inserts FK-reference earlier ones:
//   1. validate inputs
//   2. load + verify the interaction
//   3. resolve quote-expiration setting (for quote_generated path)
//   4. create-or-reuse Contact
//   5. create Property
//   6. create Lead
//   7. create Quote (only on quote_generated)
//   8. mark interaction converted
//   9. create admin task
//  10. publish events + activities
//  11. return success
// =========================================================================

export type SubmitContactInput = {
  businessId: string;
  appSurfaceId: string;
  interactionId: string;
  contact: ContactFormInput;
  selection: SelectionInput;
};

const PLUGIN_KEY = CUSTOMER_QUOTE_SALES_PAGE.pluginKey;

export async function submitContactAndConvert(
  input: SubmitContactInput,
): Promise<SubmitContactResult> {
  try {
    return await submitContactAndConvertInner(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[submitContactAndConvert] unhandled error:", message, stack);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Unexpected error during contact submission: ${message}`,
      },
    };
  }
}

async function submitContactAndConvertInner(
  input: SubmitContactInput,
): Promise<SubmitContactResult> {
  // ---- 1. Validate top-level shape ----
  if (!input.businessId || !input.appSurfaceId || !input.interactionId) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          "businessId, appSurfaceId, and interactionId are required.",
      },
    };
  }

  const contactValidation = validateContactForm(input.contact);
  if (!contactValidation.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: contactValidation.error.message,
        field: contactValidation.error.field,
      },
    };
  }
  const contact = contactValidation.data;

  // ---- 2. Load + verify interaction ----
  const loaded = await loadInteractionForSubmission({
    interactionId: input.interactionId,
    businessId: input.businessId,
    appSurfaceId: input.appSurfaceId,
  });
  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        code:
          loaded.error.code === "INTERACTION_NOT_FOUND"
            ? "INTERACTION_NOT_FOUND"
            : "INTERNAL",
        message: loaded.error.message,
      },
    };
  }
  const interaction = loaded.data;

  if (
    interaction.convertedAt ||
    interaction.convertedContactId ||
    interaction.convertedLeadId
  ) {
    return {
      ok: false,
      error: {
        code: "ALREADY_CONVERTED",
        message: "This quote request has already been submitted.",
      },
    };
  }

  const kind = kindFromInteractionStatus(interaction.interactionStatus);
  if (!kind) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_INTERACTION_STATUS",
        message: `Interaction status "${interaction.interactionStatus}" cannot be converted to a lead.`,
      },
    };
  }

  if (!interaction.normalizedAddress) {
    return {
      ok: false,
      error: {
        code: "MISSING_PROPERTY_DATA",
        message: "Interaction is missing a normalized address.",
      },
    };
  }

  // ---- 3. Selection validation (only for quote_generated) ----
  let validatedSelection: ValidatedSelection | null = null;

  if (kind === "quote_generated") {
    if (!interaction.quotePreviewData) {
      return {
        ok: false,
        error: {
          code: "MISSING_QUOTE_PREVIEW",
          message:
            "Interaction marked quote_generated but quote_preview_data is missing.",
        },
      };
    }
    const selResult = validateSelectionAgainstQuote(
      input.selection,
      interaction.quotePreviewData,
    );
    if (!selResult.ok) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: selResult.error.message,
          field: selResult.error.field,
        },
      };
    }
    validatedSelection = selResult.data;
  }

  // ---- 4. Create or reuse Contact ----
  const contactResult = await createOrReuseContact({
    businessId: interaction.businessId,
    fullName: contact.fullName,
    phone: contact.phone,
    email: contact.email,
    source: "quote_app",
    createdFromAppSurfaceId: interaction.appSurfaceId,
    createdFromPluginKey: PLUGIN_KEY,
  });
  if (!contactResult.ok) {
    return {
      ok: false,
      error: {
        code: "CONTACT_WRITE_FAILED",
        message: contactResult.error.message,
        details: contactResult.error.details,
      },
    };
  }

  // ---- 5. Create Property ----
  const propertyData = interaction.propertyDataSummary
    ? {
        squareFootage: interaction.propertyDataSummary.squareFootage ?? null,
        propertyType: interaction.propertyDataSummary.propertyType ?? null,
        lotSizeSqft: interaction.propertyDataSummary.lotSize ?? null,
        yearBuilt: interaction.propertyDataSummary.yearBuilt ?? null,
        bedrooms: interaction.propertyDataSummary.bedrooms ?? null,
        bathrooms: interaction.propertyDataSummary.bathrooms ?? null,
        dataConfidence: null,
        dataStatus: interaction.propertyDataStatus,
        providerPropertyId: interaction.propertyDataSummary.id ?? null,
        providerSnapshot: interaction.propertyDataSummary,
      }
    : null;

  const propertyResult = await createPropertyForSubmission({
    businessId: interaction.businessId,
    contactId: contactResult.contactId,
    normalizedAddress: interaction.normalizedAddress,
    serviceAreaId: interaction.serviceAreaId,
    serviceAreaStatus: interaction.serviceAreaStatus,
    propertyData,
  });
  if (!propertyResult.ok) {
    return {
      ok: false,
      error: {
        code: "PROPERTY_WRITE_FAILED",
        message: propertyResult.error.message,
        details: propertyResult.error.details,
      },
    };
  }

  // ---- 6. Create Lead ----
  const leadResult = await createLeadFromInteraction({
    businessId: interaction.businessId,
    contactId: contactResult.contactId,
    propertyId: propertyResult.propertyId,
    status: leadStatusForKind(kind),
    source: interaction.source,
    trackingCode: interaction.trackingCode,
    utmSource: interaction.utmSource,
    utmMedium: interaction.utmMedium,
    utmCampaign: interaction.utmCampaign,
    referrer: interaction.referrer,
    createdFromAppSurfaceId: interaction.appSurfaceId,
    createdFromPluginKey: PLUGIN_KEY,
    quotePageInteractionId: interaction.id,
  });
  if (!leadResult.ok) {
    return {
      ok: false,
      error: {
        code: "LEAD_WRITE_FAILED",
        message: leadResult.error.message,
        details: leadResult.error.details,
      },
    };
  }

  // ---- 7. Create Quote (only quote_generated) ----
  let quoteId: string | null = null;
  let quoteValidDays = 0;
  if (kind === "quote_generated" && validatedSelection) {
    const setting = await loadQuoteExpirationSetting(interaction.businessId);
    quoteValidDays = resolveExpirationDays(
      setting.ok ? setting.rawValue : null,
    );
    const expiresAt = computeExpiresAtIso(new Date(), quoteValidDays);

    const quoteResult = await createQuoteFromInteraction({
      businessId: interaction.businessId,
      contactId: contactResult.contactId,
      propertyId: propertyResult.propertyId,
      leadId: leadResult.leadId,
      expiresAt,
      sourcePluginKey: WINDOW_CLEANING_AUTO_QUOTE.pluginKey,
      sourcePluginVersion:
        interaction.quotePreviewData?.source_plugin_version ??
        WINDOW_CLEANING_AUTO_QUOTE.version,
      selectedServicePlanId: validatedSelection.selectedServicePlanId,
      selectedOptionKey: validatedSelection.selectedOptionKey,
      selectedAddOns: validatedSelection.selectedAddOns,
      selectedTotal: validatedSelection.selectedTotal,
      quoteSnapshot: interaction.quotePreviewData!,
      propertySnapshot: interaction.propertyDataSummary,
      source: interaction.source,
      trackingCode: interaction.trackingCode,
      createdFromAppSurfaceId: interaction.appSurfaceId,
      quotePageInteractionId: interaction.id,
    });
    if (!quoteResult.ok) {
      return {
        ok: false,
        error: {
          code: "QUOTE_WRITE_FAILED",
          message: quoteResult.error.message,
          details: quoteResult.error.details,
        },
      };
    }
    quoteId = quoteResult.quoteId;
  }

  // ---- 8. Mark interaction converted ----
  const selectedOptionKeyForRow: OptionKey | null =
    validatedSelection?.selectedOptionKey ?? null;
  const selectedTotalForRow = validatedSelection?.selectedTotal ?? null;
  const selectedAddOnsForRow = validatedSelection?.selectedAddOns ?? null;

  const updateResult = await markInteractionConverted({
    interactionId: interaction.id,
    businessId: interaction.businessId,
    contactId: contactResult.contactId,
    propertyId: propertyResult.propertyId,
    leadId: leadResult.leadId,
    quoteId,
    selectedOptionKey: selectedOptionKeyForRow,
    selectedAddOns: selectedAddOnsForRow,
    selectedTotal: selectedTotalForRow,
    newStatus: "converted",
  });
  if (!updateResult.ok) {
    return {
      ok: false,
      error: {
        code: "INTERACTION_UPDATE_FAILED",
        message: updateResult.error.message,
      },
    };
  }

  // ---- 9. Create admin task ----
  const taskResult = await createTask({
    businessId: interaction.businessId,
    title: taskTitleForKind(kind),
    description: buildTaskDescription({
      kind,
      formattedAddress: interaction.normalizedAddress.formatted_address,
      contactName: contact.fullName,
      selectedOptionKey: selectedOptionKeyForRow,
      selectedTotal: selectedTotalForRow,
    }),
    taskCategory: taskCategoryForKind(kind),
    priority: "normal",
    status: "open",
    relatedObjectType: "lead",
    relatedObjectId: leadResult.leadId,
    sourcePluginKey: PLUGIN_KEY,
  });
  if (!taskResult.ok) {
    return {
      ok: false,
      error: {
        code: "TASK_WRITE_FAILED",
        message: taskResult.error.message,
        details: taskResult.error.details,
      },
    };
  }

  // ---- 10. Publish events + activities (best-effort; failures logged) ----
  await emitTrailingEventsAndActivities({
    businessId: interaction.businessId,
    appSurfaceId: interaction.appSurfaceId,
    interactionId: interaction.id,
    kind,
    contactId: contactResult.contactId,
    propertyId: propertyResult.propertyId,
    leadId: leadResult.leadId,
    leadStatus: leadStatusForKind(kind),
    quoteId,
    quoteTotal: selectedTotalForRow,
    taskId: taskResult.taskId,
    taskCategory: taskCategoryForKind(kind),
    taskTitle: taskTitleForKind(kind),
    selectedOptionKey: selectedOptionKeyForRow,
    contactName: contact.fullName,
  });

  return {
    ok: true,
    data: {
      kind,
      contactId: contactResult.contactId,
      propertyId: propertyResult.propertyId,
      leadId: leadResult.leadId,
      quoteId,
      taskId: taskResult.taskId,
      selectedOptionKey: selectedOptionKeyForRow,
      selectedTotal: selectedTotalForRow,
      quoteValidDays,
      formattedAddress: interaction.normalizedAddress.formatted_address,
    },
  };
}

function buildTaskDescription(input: {
  kind: SubmitKind;
  formattedAddress: string;
  contactName: string;
  selectedOptionKey: OptionKey | null;
  selectedTotal: number | null;
}): string {
  const lines = [`Address: ${input.formattedAddress}`, `Contact: ${input.contactName}`];
  if (input.kind === "quote_generated") {
    lines.push(`Selected option: ${input.selectedOptionKey ?? "—"}`);
    lines.push(
      `Selected total: ${
        input.selectedTotal !== null ? `$${input.selectedTotal}` : "—"
      }`,
    );
  } else if (input.kind === "property_data_missing") {
    lines.push("Property data missing — prepare a manual quote.");
  } else {
    lines.push("Address is outside the seeded service areas.");
  }
  return lines.join("\n");
}

async function emitTrailingEventsAndActivities(input: {
  businessId: string;
  appSurfaceId: string;
  interactionId: string;
  kind: SubmitKind;
  contactId: string;
  propertyId: string;
  leadId: string;
  leadStatus: string;
  quoteId: string | null;
  quoteTotal: number | null;
  taskId: string;
  taskCategory: string;
  taskTitle: string;
  selectedOptionKey: OptionKey | null;
  contactName: string;
}): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];

  // quote_app.contact_submitted
  tasks.push(
    publishEvent({
      businessId: input.businessId,
      eventType: "quote_app.contact_submitted",
      payload: {
        appSurfaceId: input.appSurfaceId,
        interactionId: input.interactionId,
        contactId: input.contactId,
      },
      sourceType: "plugin",
      sourceKey: PLUGIN_KEY,
      relatedObjectType: "quote_page_interaction",
      relatedObjectId: input.interactionId,
    }),
  );

  // schedule_requested only when the customer actually picked a plan
  if (input.kind === "quote_generated") {
    tasks.push(
      publishEvent({
        businessId: input.businessId,
        eventType: "quote_app.schedule_requested",
        payload: {
          appSurfaceId: input.appSurfaceId,
          interactionId: input.interactionId,
          selectedOptionKey: input.selectedOptionKey ?? undefined,
          selectedTotal: input.quoteTotal ?? undefined,
        },
        sourceType: "plugin",
        sourceKey: PLUGIN_KEY,
        relatedObjectType: "lead",
        relatedObjectId: input.leadId,
      }),
    );
  }

  // lead.created
  tasks.push(
    publishEvent({
      businessId: input.businessId,
      eventType: "lead.created",
      payload: {
        leadId: input.leadId,
        contactId: input.contactId,
        propertyId: input.propertyId,
        leadStatus: input.leadStatus,
      },
      sourceType: "core",
      sourceKey: "core.leads",
      relatedObjectType: "lead",
      relatedObjectId: input.leadId,
    }),
  );

  if (input.quoteId) {
    tasks.push(
      publishEvent({
        businessId: input.businessId,
        eventType: "quote.created",
        payload: {
          quoteId: input.quoteId,
          leadId: input.leadId,
          contactId: input.contactId,
          selectedTotal: input.quoteTotal ?? undefined,
        },
        sourceType: "core",
        sourceKey: "core.quotes",
        relatedObjectType: "quote",
        relatedObjectId: input.quoteId,
      }),
    );
  }

  // task.created
  tasks.push(
    publishEvent({
      businessId: input.businessId,
      eventType: "task.created",
      payload: {
        taskId: input.taskId,
        taskCategory: input.taskCategory,
        title: input.taskTitle,
      },
      sourceType: "core",
      sourceKey: "core.tasks",
      relatedObjectType: "task",
      relatedObjectId: input.taskId,
    }),
  );

  // Activities (human-readable mirrors of the major events).
  tasks.push(
    createActivity({
      businessId: input.businessId,
      actorType: "visitor",
      sourcePluginKey: PLUGIN_KEY,
      activityType: "quote_app.contact_submitted",
      summary: `Quote request submitted by ${input.contactName}.`,
      relatedObjectType: "lead",
      relatedObjectId: input.leadId,
    }),
  );
  tasks.push(
    createActivity({
      businessId: input.businessId,
      actorType: "system",
      sourcePluginKey: PLUGIN_KEY,
      activityType: "lead.created",
      summary: `Lead created (${input.leadStatus}).`,
      relatedObjectType: "lead",
      relatedObjectId: input.leadId,
    }),
  );
  if (input.quoteId) {
    tasks.push(
      createActivity({
        businessId: input.businessId,
        actorType: "system",
        sourcePluginKey: PLUGIN_KEY,
        activityType: "quote.created",
        summary:
          input.quoteTotal !== null
            ? `Quote created at $${input.quoteTotal}.`
            : "Quote created.",
        relatedObjectType: "quote",
        relatedObjectId: input.quoteId,
      }),
    );
  }
  tasks.push(
    createActivity({
      businessId: input.businessId,
      actorType: "system",
      sourcePluginKey: PLUGIN_KEY,
      activityType: "task.created",
      summary: `Admin task created: ${input.taskTitle}.`,
      relatedObjectType: "task",
      relatedObjectId: input.taskId,
    }),
  );

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[submitContactAndConvert] trailing emit failed:", r.reason);
    } else if (
      typeof r.value === "object" &&
      r.value !== null &&
      "ok" in r.value &&
      (r.value as { ok: unknown }).ok === false
    ) {
      console.error(
        "[submitContactAndConvert] trailing emit returned error:",
        (r.value as unknown as { error: unknown }).error,
      );
    }
  }
}
