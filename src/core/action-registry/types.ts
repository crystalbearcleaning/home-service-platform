import type { z } from "zod";

export type ActionRiskLevel = "low" | "medium" | "high" | "critical";

export type ActionSourceType = "core" | "plugin" | "system";

export type ActionContext = {
  businessId: string;
  userId: string | null;
  sourceType: ActionSourceType;
  sourceKey: string | null;
  requestId: string | null;
};

// Open-ended union so handlers can return domain-specific codes
// (DB_ERROR, NOT_IMPLEMENTED, etc.) without us having to widen the union
// every time.
export type ActionErrorCode =
  | "NOT_REGISTERED"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "HANDLER_EXCEPTION"
  | "NOT_IMPLEMENTED"
  | "DB_ERROR"
  | "UNAUTHORIZED"
  | (string & {});

export type ActionError = {
  code: ActionErrorCode;
  message: string;
  details?: unknown;
};

export type ActionResult<TOutput = unknown> =
  | { ok: true; data: TOutput }
  | { ok: false; error: ActionError };

export type ActionHandler<TInput, TOutput> = (
  input: TInput,
  context: ActionContext,
) => Promise<ActionResult<TOutput>>;

export type ActionDefinition<TInput = unknown, TOutput = unknown> = {
  key: string;
  name: string;
  description?: string;
  riskLevel: ActionRiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler: ActionHandler<TInput, TOutput>;
};

export type AnyActionDefinition = ActionDefinition<unknown, unknown>;

export type ActionRegistry = {
  register<TInput, TOutput>(def: ActionDefinition<TInput, TOutput>): void;
  has(key: string): boolean;
  get(key: string): AnyActionDefinition | undefined;
  list(): ReadonlyArray<AnyActionDefinition>;
  execute<TOutput = unknown>(
    key: string,
    input: unknown,
    context: ActionContext,
  ): Promise<ActionResult<TOutput>>;
};
