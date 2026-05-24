import { describe, expect, it } from "vitest";
import { evaluateAutomationsForTaskCreated } from "./automation-engine";

// The DB-backed paths (load automations + assignments, send via the
// adapter) are exercised end-to-end through the public quote flow and
// the admin pages. Here we only assert that pre-flight branches return
// an empty no-op result without ever touching Supabase.

describe("evaluateAutomationsForTaskCreated — pre-flight", () => {
  it("returns matched=0 when businessId is missing", async () => {
    const r = await evaluateAutomationsForTaskCreated({
      businessId: "",
      taskId: "00000000-0000-0000-0000-000000000000",
      taskContext: { taskCategory: "schedule_request" },
      related: {},
    });
    expect(r.ok).toBe(true);
    expect(r.matched).toBe(0);
    expect(r.outcomes).toEqual([]);
  });
  it("returns matched=0 when taskId is missing", async () => {
    const r = await evaluateAutomationsForTaskCreated({
      businessId: "00000000-0000-0000-0000-000000000000",
      taskId: "",
      taskContext: { taskCategory: "schedule_request" },
      related: {},
    });
    expect(r.matched).toBe(0);
  });
  it("returns matched=0 when category is empty", async () => {
    const r = await evaluateAutomationsForTaskCreated({
      businessId: "00000000-0000-0000-0000-000000000000",
      taskId: "00000000-0000-0000-0000-000000000000",
      taskContext: { taskCategory: "" },
      related: {},
    });
    expect(r.matched).toBe(0);
  });
});
