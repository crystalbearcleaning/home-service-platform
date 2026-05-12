import { z } from "zod";
import type { Phase1EventType } from "./types";

const uuid = z.string().uuid();

const addressEnteredSchema = z
  .object({
    appSurfaceId: uuid,
    interactionId: uuid.optional(),
    addressInput: z.string().optional(),
    normalizedCity: z.string().optional(),
    googlePlaceId: z.string().optional(),
    serviceAreaStatus: z.enum(["in_area", "out_of_area", "unknown"]).optional(),
  })
  .passthrough();

const quoteGeneratedSchema = z
  .object({
    appSurfaceId: uuid.optional(),
    interactionId: uuid.optional(),
    squareFootage: z.number().int().positive(),
    optionCount: z.number().int().nonnegative(),
    pluginKey: z.string().optional(),
    pluginVersion: z.string().optional(),
  })
  .passthrough();

const contactSubmittedSchema = z
  .object({
    appSurfaceId: uuid,
    interactionId: uuid.optional(),
    contactId: uuid.optional(),
  })
  .passthrough();

const scheduleRequestedSchema = z
  .object({
    appSurfaceId: uuid,
    interactionId: uuid.optional(),
    selectedOptionKey: z.string().optional(),
    selectedTotal: z.number().nonnegative().optional(),
  })
  .passthrough();

const leadCreatedSchema = z
  .object({
    leadId: uuid,
    contactId: uuid,
    propertyId: uuid,
    leadStatus: z.string().min(1),
  })
  .passthrough();

const quoteCreatedSchema = z
  .object({
    quoteId: uuid,
    leadId: uuid,
    contactId: uuid,
    selectedTotal: z.number().nonnegative().optional(),
  })
  .passthrough();

const taskCreatedSchema = z
  .object({
    taskId: uuid,
    taskCategory: z.string().min(1),
    title: z.string().min(1),
  })
  .passthrough();

const issueFlaggedSchema = z
  .object({
    issueId: uuid,
    issueType: z.string().min(1),
    title: z.string().min(1),
    severity: z.string().optional(),
  })
  .passthrough();

export const phase1EventPayloadSchemas: Record<Phase1EventType, z.ZodTypeAny> = {
  "quote_app.address_entered": addressEnteredSchema,
  "auto_quote.quote_generated": quoteGeneratedSchema,
  "quote_app.contact_submitted": contactSubmittedSchema,
  "quote_app.schedule_requested": scheduleRequestedSchema,
  "lead.created": leadCreatedSchema,
  "quote.created": quoteCreatedSchema,
  "task.created": taskCreatedSchema,
  "issue.flagged": issueFlaggedSchema,
};

export function getEventPayloadSchema(
  eventType: Phase1EventType,
): z.ZodTypeAny {
  return phase1EventPayloadSchemas[eventType];
}
