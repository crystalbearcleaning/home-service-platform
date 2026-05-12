import "server-only";
import { z } from "zod";
import type { ActionRegistry } from "./types";
import { publishEvent } from "@/core/events/bus";
import { phase1EventTypes, type PublishEventInput } from "@/core/events/types";
import { createActivity } from "@/core/activity/logger";
import type { CreateActivityInput } from "@/core/activity/input-schema";

const uuid = z.string().uuid();
const eventTypeEnum = z.enum(phase1EventTypes);

// ---------------------------------------------------------------------------
// core.events.publish
// ---------------------------------------------------------------------------
const publishEventActionInput = z.object({
  businessId: uuid,
  eventType: eventTypeEnum,
  schemaVersion: z.number().int().positive().optional(),
  payload: z.unknown(),
  sourceType: z.enum(["core", "plugin", "system"]),
  sourceKey: z.string().nullable().optional(),
  relatedObjectType: z.string().nullable().optional(),
  relatedObjectId: uuid.nullable().optional(),
});
const publishEventActionOutput = z.object({ eventId: uuid });

// ---------------------------------------------------------------------------
// core.activities.create
// ---------------------------------------------------------------------------
const createActivityActionInput = z.object({
  businessId: uuid,
  eventId: uuid.nullable().optional(),
  actorType: z.enum(["visitor", "user", "system", "plugin"]).optional(),
  actorUserId: uuid.nullable().optional(),
  sourcePluginKey: z.string().nullable().optional(),
  activityType: z.string().min(1),
  summary: z.string().min(1),
  details: z.unknown().nullable().optional(),
  relatedObjectType: z.string().nullable().optional(),
  relatedObjectId: uuid.nullable().optional(),
});
const createActivityActionOutput = z.object({ activityId: uuid });

// ---------------------------------------------------------------------------
// core.tasks.create — placeholder
// ---------------------------------------------------------------------------
const createTaskActionInput = z.object({
  businessId: uuid,
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  taskCategory: z.string().optional(),
  assignedRoleId: uuid.optional(),
  assignedUserId: uuid.optional(),
  relatedObjectType: z.string().optional(),
  relatedObjectId: uuid.optional(),
  sourcePluginKey: z.string().optional(),
  sourceEventId: uuid.optional(),
});
const createTaskActionOutput = z.object({ taskId: uuid });

// ---------------------------------------------------------------------------
// core.issues.create — placeholder
// ---------------------------------------------------------------------------
const createIssueActionInput = z.object({
  businessId: uuid,
  title: z.string().min(1),
  description: z.string().optional(),
  issueType: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  sourcePluginKey: z.string().optional(),
  appSurfaceId: uuid.optional(),
  relatedObjectType: z.string().optional(),
  relatedObjectId: uuid.optional(),
  pluginVersion: z.string().optional(),
});
const createIssueActionOutput = z.object({ issueId: uuid });

export function registerCoreActions(registry: ActionRegistry): void {
  registry.register({
    key: "core.events.publish",
    name: "Publish event",
    description: "Validates and writes a row to the events table.",
    riskLevel: "low",
    inputSchema: publishEventActionInput,
    outputSchema: publishEventActionOutput,
    handler: async (input) => {
      // Zod infers `payload: unknown` as optional (since `unknown` includes
      // undefined). At runtime the field is always present — safeParse keeps
      // it. Cast bridges the inference gap; publishEvent re-validates.
      const result = await publishEvent(input as PublishEventInput);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, data: { eventId: result.eventId } };
    },
  });

  registry.register({
    key: "core.activities.create",
    name: "Create activity",
    description:
      "Validates and writes a human-readable row to the activities table.",
    riskLevel: "low",
    inputSchema: createActivityActionInput,
    outputSchema: createActivityActionOutput,
    handler: async (input) => {
      const result = await createActivity(input as CreateActivityInput);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, data: { activityId: result.activityId } };
    },
  });

  registry.register({
    key: "core.tasks.create",
    name: "Create task",
    description:
      "Placeholder. Full implementation lands with the task queue step.",
    riskLevel: "medium",
    inputSchema: createTaskActionInput,
    outputSchema: createTaskActionOutput,
    handler: async () => ({
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "core.tasks.create is not implemented in B4.",
      },
    }),
  });

  registry.register({
    key: "core.issues.create",
    name: "Flag issue",
    description:
      "Placeholder. Full implementation lands with the issue tracking step.",
    riskLevel: "low",
    inputSchema: createIssueActionInput,
    outputSchema: createIssueActionOutput,
    handler: async () => ({
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "core.issues.create is not implemented in B4.",
      },
    }),
  });
}
