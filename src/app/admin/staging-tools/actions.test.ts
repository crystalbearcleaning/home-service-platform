import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the modules the action depends on. Each mock is reset between
// tests so individual cases can override behavior.
const supabaseGetUserMock = vi.fn();
vi.mock("@/core/auth/server", () => ({
  createClient: async () => ({
    auth: { getUser: supabaseGetUserMock },
  }),
}));

const activeBusinessMock = vi.fn();
vi.mock("@/core/business/active-business", () => ({
  getActiveBusinessForUser: (...args: unknown[]) =>
    activeBusinessMock(...args),
}));

const executeStagingResetMock = vi.fn();
vi.mock("@/core/staging-tools/reset", () => ({
  executeStagingReset: (...args: unknown[]) =>
    executeStagingResetMock(...args),
}));

import { resetStagingDataAction } from "./actions";

const VALID_CONFIRMATION = "RESET QUOTE FLOW DATA";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseGetUserMock.mockResolvedValue({
    data: { user: { id: "00000000-0000-0000-0000-000000000001" } },
  });
  activeBusinessMock.mockResolvedValue({
    id: "11111111-1111-1111-1111-111111111111",
    name: "Crystal Bear",
    slug: "crystal-bear",
  });
  executeStagingResetMock.mockResolvedValue({
    ok: true,
    data: {
      businessId: "11111111-1111-1111-1111-111111111111",
      counts: {
        quote_page_interactions: 0,
        tasks: 0,
        activities: 0,
        events: 0,
        issues: 0,
        quotes: 0,
        leads: 0,
        properties: 0,
        contacts: 0,
        rate_limit_events: 0,
      },
      plan: { businessId: "x", steps: [], notes: [] },
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resetStagingDataAction — env gate", () => {
  it("refuses when ENABLE_STAGING_TOOLS is unset", async () => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "");
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGING_TOOLS_DISABLED");
    expect(executeStagingResetMock).not.toHaveBeenCalled();
  });

  it("refuses when ENABLE_STAGING_TOOLS is 'false'", async () => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "false");
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGING_TOOLS_DISABLED");
  });

  it("refuses when only the public flag is true", async () => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "false");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_STAGING_TOOLS", "true");
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STAGING_TOOLS_DISABLED");
  });
});

describe("resetStagingDataAction — confirmation", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "true");
  });

  it("refuses when the confirmation string does not match", async () => {
    const result = await resetStagingDataAction({
      confirmation: "yes please",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIRMATION_MISMATCH");
    expect(executeStagingResetMock).not.toHaveBeenCalled();
  });

  it("trims whitespace before comparing", async () => {
    const result = await resetStagingDataAction({
      confirmation: `  ${VALID_CONFIRMATION}  `,
    });
    expect(result.ok).toBe(true);
  });
});

describe("resetStagingDataAction — auth", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "true");
  });

  it("refuses when the user is not authenticated", async () => {
    supabaseGetUserMock.mockResolvedValueOnce({ data: { user: null } });
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
    expect(executeStagingResetMock).not.toHaveBeenCalled();
  });

  it("refuses when the user has no active business membership", async () => {
    activeBusinessMock.mockResolvedValueOnce(null);
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ACTIVE_BUSINESS");
    expect(executeStagingResetMock).not.toHaveBeenCalled();
  });
});

describe("resetStagingDataAction — happy path", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_STAGING_TOOLS", "true");
  });

  it("scopes the reset to the active business id", async () => {
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(true);
    expect(executeStagingResetMock).toHaveBeenCalledTimes(1);
    expect(executeStagingResetMock).toHaveBeenCalledWith({
      businessId: "11111111-1111-1111-1111-111111111111",
    });
    if (result.ok) {
      expect(result.data.businessId).toBe(
        "11111111-1111-1111-1111-111111111111",
      );
      expect(result.data.counts).toHaveProperty("contacts");
      expect(result.data.counts).toHaveProperty("quote_page_interactions");
    }
  });

  it("forwards executor errors through to the caller", async () => {
    executeStagingResetMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "DB_ERROR", message: "boom" },
    });
    const result = await resetStagingDataAction({
      confirmation: VALID_CONFIRMATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DB_ERROR");
      expect(result.error.message).toBe("boom");
    }
  });
});
