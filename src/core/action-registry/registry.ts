import type {
  ActionContext,
  ActionDefinition,
  ActionRegistry,
  ActionResult,
  AnyActionDefinition,
} from "./types";

class ActionRegistryImpl implements ActionRegistry {
  private actions = new Map<string, AnyActionDefinition>();

  register<TInput, TOutput>(def: ActionDefinition<TInput, TOutput>): void {
    if (this.actions.has(def.key)) {
      throw new Error(`Action "${def.key}" is already registered.`);
    }
    this.actions.set(def.key, def as unknown as AnyActionDefinition);
  }

  has(key: string): boolean {
    return this.actions.has(key);
  }

  get(key: string): AnyActionDefinition | undefined {
    return this.actions.get(key);
  }

  list(): ReadonlyArray<AnyActionDefinition> {
    return Array.from(this.actions.values());
  }

  async execute<TOutput = unknown>(
    key: string,
    input: unknown,
    context: ActionContext,
  ): Promise<ActionResult<TOutput>> {
    const action = this.actions.get(key);
    if (!action) {
      return {
        ok: false,
        error: {
          code: "NOT_REGISTERED",
          message: `No action registered with key "${key}".`,
        },
      };
    }

    const inputParse = action.inputSchema.safeParse(input);
    if (!inputParse.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: `Invalid input for action "${key}".`,
          details: inputParse.error.issues,
        },
      };
    }

    let handlerResult: ActionResult<unknown>;
    try {
      handlerResult = await action.handler(inputParse.data, context);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "HANDLER_EXCEPTION",
          message:
            err instanceof Error ? err.message : "Action handler threw.",
          details:
            err instanceof Error
              ? { name: err.name, stack: err.stack }
              : err,
        },
      };
    }

    if (!handlerResult.ok) {
      return handlerResult as ActionResult<TOutput>;
    }

    const outputParse = action.outputSchema.safeParse(handlerResult.data);
    if (!outputParse.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_OUTPUT",
          message: `Action "${key}" returned invalid output.`,
          details: outputParse.error.issues,
        },
      };
    }

    return { ok: true, data: outputParse.data as TOutput };
  }
}

export function createActionRegistry(): ActionRegistry {
  return new ActionRegistryImpl();
}
