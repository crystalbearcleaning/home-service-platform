import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createActionRegistry } from "./registry";
import type { ActionContext, ActionResult } from "./types";

const baseContext: ActionContext = {
  businessId: "00000000-0000-0000-0000-000000000001",
  userId: null,
  sourceType: "system",
  sourceKey: null,
  requestId: null,
};

const inputSchema = z.object({ value: z.number().int() });
const outputSchema = z.object({ doubled: z.number().int() });

describe("action registry", () => {
  it("registers and lists actions", () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.double",
      name: "Double",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async (input) => ({
        ok: true,
        data: { doubled: input.value * 2 },
      }),
    });
    expect(registry.has("test.double")).toBe(true);
    expect(registry.list().map((a) => a.key)).toEqual(["test.double"]);
  });

  it("rejects duplicate registration", () => {
    const registry = createActionRegistry();
    const def = {
      key: "test.dup",
      name: "Dup",
      riskLevel: "low" as const,
      inputSchema,
      outputSchema,
      handler: async () => ({ ok: true as const, data: { doubled: 0 } }),
    };
    registry.register(def);
    expect(() => registry.register(def)).toThrow();
  });

  it("returns NOT_REGISTERED for unknown action", async () => {
    const registry = createActionRegistry();
    const result = await registry.execute("nope", {}, baseContext);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_REGISTERED");
  });

  it("returns INVALID_INPUT for invalid input", async () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.double",
      name: "Double",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async (input) => ({
        ok: true,
        data: { doubled: input.value * 2 },
      }),
    });

    const result = await registry.execute(
      "test.double",
      { value: "not a number" },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("returns INVALID_OUTPUT when handler returns wrong shape", async () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.broken",
      name: "Broken",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async () =>
        ({ ok: true, data: { wrong: "shape" } }) as ActionResult<unknown>,
    });

    const result = await registry.execute(
      "test.broken",
      { value: 1 },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_OUTPUT");
  });

  it("returns HANDLER_EXCEPTION when handler throws", async () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.throws",
      name: "Throws",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async () => {
        throw new Error("boom");
      },
    });

    const result = await registry.execute(
      "test.throws",
      { value: 1 },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HANDLER_EXCEPTION");
      expect(result.error.message).toContain("boom");
    }
  });

  it("passes through structured handler errors", async () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.err",
      name: "Err",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async () => ({
        ok: false,
        error: { code: "CUSTOM", message: "custom error" },
      }),
    });

    const result = await registry.execute(
      "test.err",
      { value: 1 },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CUSTOM");
  });

  it("executes ok with valid input/output", async () => {
    const registry = createActionRegistry();
    registry.register({
      key: "test.double",
      name: "Double",
      riskLevel: "low",
      inputSchema,
      outputSchema,
      handler: async (input) => ({
        ok: true,
        data: { doubled: input.value * 2 },
      }),
    });

    const result = await registry.execute(
      "test.double",
      { value: 21 },
      baseContext,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ doubled: 42 });
  });
});
