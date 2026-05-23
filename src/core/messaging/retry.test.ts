import { describe, expect, it } from "vitest";
import { retryFailedNotificationLog } from "./retry";

// Live DB-backed paths (LOG_NOT_FOUND / LOG_NOT_FAILED / FOREIGN_BUSINESS /
// success) are exercised manually via /admin/message-automations. Here
// we only assert the pre-flight argument checks so a malformed call
// never reaches Supabase.

describe("retryFailedNotificationLog — input validation", () => {
  it("rejects missing businessId", async () => {
    const r = await retryFailedNotificationLog({
      businessId: "",
      logId: "00000000-0000-0000-0000-000000000000",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_ROW");
  });
  it("rejects missing logId", async () => {
    const r = await retryFailedNotificationLog({
      businessId: "00000000-0000-0000-0000-000000000000",
      logId: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_ROW");
  });
});
