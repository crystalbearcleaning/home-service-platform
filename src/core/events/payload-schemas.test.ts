import { describe, it, expect } from "vitest";
import {
  getEventPayloadSchema,
  phase1EventPayloadSchemas,
} from "./payload-schemas";
import { phase1EventTypes } from "./types";

describe("phase 1 event payload schemas", () => {
  it("has a schema for every phase 1 event type", () => {
    for (const type of phase1EventTypes) {
      expect(phase1EventPayloadSchemas[type]).toBeDefined();
    }
  });

  it("quote_app.address_entered requires appSurfaceId", () => {
    const schema = getEventPayloadSchema("quote_app.address_entered");
    expect(schema.safeParse({}).success).toBe(false);
    expect(
      schema.safeParse({
        appSurfaceId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("lead.created requires leadId / contactId / propertyId / leadStatus", () => {
    const schema = getEventPayloadSchema("lead.created");
    expect(schema.safeParse({ leadStatus: "open" }).success).toBe(false);
    expect(
      schema.safeParse({
        leadId: "00000000-0000-0000-0000-000000000001",
        contactId: "00000000-0000-0000-0000-000000000002",
        propertyId: "00000000-0000-0000-0000-000000000003",
        leadStatus: "scheduling_requested",
      }).success,
    ).toBe(true);
  });

  it("rejects non-UUID id fields", () => {
    const schema = getEventPayloadSchema("quote.created");
    const result = schema.safeParse({
      quoteId: "not-a-uuid",
      leadId: "00000000-0000-0000-0000-000000000001",
      contactId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const schema = getEventPayloadSchema("auto_quote.quote_generated");
    const result = schema.safeParse({
      squareFootage: 1500,
      optionCount: 3,
      extraField: "kept",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extraField).toBe("kept");
    }
  });
});
