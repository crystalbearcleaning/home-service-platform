import { z } from "zod";

const uuid = z.string().uuid();

export const createActivityInputSchema = z.object({
  businessId: uuid,
  eventId: uuid.nullable().optional(),
  actorType: z
    .enum(["visitor", "user", "system", "plugin"])
    .default("system"),
  actorUserId: uuid.nullable().optional(),
  sourcePluginKey: z.string().nullable().optional(),
  activityType: z.string().min(1),
  summary: z.string().min(1),
  details: z.unknown().nullable().optional(),
  relatedObjectType: z.string().nullable().optional(),
  relatedObjectId: uuid.nullable().optional(),
});

export type CreateActivityInput = z.input<typeof createActivityInputSchema>;
export type CreateActivityValidated = z.output<typeof createActivityInputSchema>;
