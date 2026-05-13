// Plugin identity. Kept in sync with the seeded plugin_definitions row
// and used by the calculation to stamp source_plugin_key and
// source_plugin_version into every quote output.

export const WINDOW_CLEANING_AUTO_QUOTE = {
  pluginKey: "window_cleaning_auto_quote" as const,
  version: "0.1.0",
  actionKey: "window_cleaning_auto_quote.calculate_quote" as const,
} as const;
