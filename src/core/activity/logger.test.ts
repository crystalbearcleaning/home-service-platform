// Validation-only tests for the activity input schema. The DB write is
// exercised manually via /admin/activity and (later) the quote-flow
// integration test.
import { describe, it, expect } from "vitest";
import { createActivityInputSchema } from "./input-schema";

describe("createActivityInputSchema", () => {
  it("requires businessId, activityType, summary", () => {
    expect(createActivityInputSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a minimal valid input and defaults actorType to system", () => {
    const result = createActivityInputSchema.safeParse({
      businessId: "00000000-0000-0000-0000-000000000001",
      activityType: "test",
      summary: "hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actorType).toBe("system");
    }
  });

  it("rejects invalid uuid in eventId", () => {
    const result = createActivityInputSchema.safeParse({
      businessId: "00000000-0000-0000-0000-000000000001",
      activityType: "test",
      summary: "x",
      eventId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const result = createActivityInputSchema.safeParse({
      businessId: "00000000-0000-0000-0000-000000000001",
      activityType: "test",
      summary: "",
    });
    expect(result.success).toBe(false);
  });
});
