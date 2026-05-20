// Thin orchestration wrapper around the pure template renderers. Exists
// so the engine and the admin test page can render messages by template
// key without each importing the individual renderer functions.

import { renderMessage } from "./templates";
import type { RenderedMessage, TemplateContext, TemplateKey } from "./types";
import { TEMPLATE_KEYS } from "./types";

export type RenderResult =
  | { ok: true; rendered: RenderedMessage }
  | { ok: false; error: { code: "UNKNOWN_TEMPLATE"; message: string } };

export function renderByTemplateKey(
  templateKey: string,
  context: TemplateContext,
): RenderResult {
  if (!isTemplateKey(templateKey)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_TEMPLATE",
        message: `Unknown template_key "${templateKey}". Known keys: ${TEMPLATE_KEYS.join(", ")}.`,
      },
    };
  }
  return { ok: true, rendered: renderMessage(templateKey, context) };
}

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}
