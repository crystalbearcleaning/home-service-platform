import { describe, expect, it } from "vitest";
import {
  CUSTOMER_QUOTE_SALES_PAGE_KEY,
  PRESERVED_TABLES,
  QUOTE_FLOW_EVENT_TYPES,
  QUOTE_FLOW_PLUGIN_KEYS,
  QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS,
  WINDOW_CLEANING_AUTO_QUOTE_KEY,
  buildResetPlan,
} from "./plan";

const BUSINESS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("buildResetPlan", () => {
  it("includes every quote-flow table exactly once, in dependency-safe order", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    expect(plan.businessId).toBe(BUSINESS);

    const tables = plan.steps.map((s) => s.table);
    // Each table appears exactly once.
    expect(new Set(tables).size).toBe(tables.length);

    // The full set of quote-flow tables.
    expect(tables).toEqual([
      "quote_page_interactions",
      "tasks",
      "activities",
      "events",
      "issues",
      "quotes",
      "leads",
      "properties",
      "contacts",
      "rate_limit_events",
    ]);

    // contacts MUST come after properties (properties FK contact_id is
    // set-null on delete, but we still want properties cleared first so
    // the contact delete leaves no dangling rows for the test workspace).
    const propsIdx = tables.indexOf("properties");
    const contactsIdx = tables.indexOf("contacts");
    expect(propsIdx).toBeLessThan(contactsIdx);

    // quotes and leads must come before contacts (their FK cascades from
    // contacts could widen the blast radius if reversed).
    expect(tables.indexOf("quotes")).toBeLessThan(contactsIdx);
    expect(tables.indexOf("leads")).toBeLessThan(contactsIdx);
  });

  it("never names a preserved table", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    const planTables = new Set(plan.steps.map((s) => s.table));
    for (const preserved of PRESERVED_TABLES) {
      expect(planTables.has(preserved as never)).toBe(false);
    }
  });

  it("scopes per-business tables by businessId in their description", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    for (const step of plan.steps) {
      if (step.table === "rate_limit_events") continue;
      expect(step.description).toContain(BUSINESS);
    }
  });

  it("scopes leaf tables by their plugin / source filter", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    const byTable = new Map(plan.steps.map((s) => [s.table, s]));
    const desc = (t: string): string => {
      const step = byTable.get(t as never);
      if (!step) throw new Error(`expected plan step for ${t}`);
      return step.description;
    };

    expect(desc("tasks")).toContain(CUSTOMER_QUOTE_SALES_PAGE_KEY);
    expect(desc("activities")).toContain(CUSTOMER_QUOTE_SALES_PAGE_KEY);
    expect(desc("issues")).toContain(CUSTOMER_QUOTE_SALES_PAGE_KEY);
    expect(desc("leads")).toContain(CUSTOMER_QUOTE_SALES_PAGE_KEY);
    expect(desc("quotes")).toContain(WINDOW_CLEANING_AUTO_QUOTE_KEY);
    expect(desc("contacts")).toContain("quote_app");
    for (const ev of QUOTE_FLOW_EVENT_TYPES) {
      expect(desc("events")).toContain(ev);
    }
    for (const k of QUOTE_FLOW_RATE_LIMIT_ACTION_KEYS) {
      expect(desc("rate_limit_events")).toContain(k);
    }
  });

  it("documents the rate_limit_events single-tenant caveat", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    expect(plan.notes.some((n) => n.includes("rate_limit_events"))).toBe(true);
  });

  it("plugin key constants match the manifests", () => {
    expect(QUOTE_FLOW_PLUGIN_KEYS).toContain(CUSTOMER_QUOTE_SALES_PAGE_KEY);
    expect(QUOTE_FLOW_PLUGIN_KEYS).toContain(WINDOW_CLEANING_AUTO_QUOTE_KEY);
  });
});

// Pin the Phase 1 Do-Not-Build invariant: jobs / appointments / invoices
// / payments tables must NEVER appear in the reset plan, even by accident.
describe("Phase 1 Do-Not-Build invariant", () => {
  it("never references job / appointment / invoice / payment tables", () => {
    const plan = buildResetPlan({ businessId: BUSINESS });
    const flat = plan.steps.map((s) => s.table).join(" ");
    expect(flat).not.toContain("job");
    expect(flat).not.toContain("appointment");
    expect(flat).not.toContain("invoice");
    expect(flat).not.toContain("payment");
    expect(flat).not.toContain("recurring");
  });
});
