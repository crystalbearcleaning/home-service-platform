// Plugin identity. Kept in sync with the seeded plugin_definitions row.
// Used to stamp quote_page_interactions.plugin_version.

export const CUSTOMER_QUOTE_SALES_PAGE = {
  pluginKey: "customer_quote_sales_page" as const,
  version: "0.1.0",
} as const;
