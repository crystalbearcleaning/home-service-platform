import { describe, expect, it } from "vitest";
import { isActiveNavItem, resolveAdminNav } from "./nav-config";

describe("resolveAdminNav", () => {
  it("includes Staging tools only when the gate is enabled", () => {
    const withGate = resolveAdminNav({ stagingToolsEnabled: true });
    const withoutGate = resolveAdminNav({ stagingToolsEnabled: false });

    const withHrefs = withGate.flatMap((g) => g.items.map((i) => i.href));
    const withoutHrefs = withoutGate.flatMap((g) =>
      g.items.map((i) => i.href),
    );

    expect(withHrefs).toContain("/admin/staging-tools");
    expect(withoutHrefs).not.toContain("/admin/staging-tools");
  });

  it("exposes the Phase 6 group order (Simulation inserted between Marketing and Automations)", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    expect(groups.map((g) => g.label)).toEqual([
      "Overview",
      "CRM",
      "Tasks",
      "Marketing",
      "Simulation",
      "Automations",
      "Plugins",
      "Observability",
      "Tools",
    ]);
  });

  it("Simulation group contains exactly Saves", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const sim = groups.find((g) => g.label === "Simulation");
    expect(sim).toBeDefined();
    expect(sim?.items.map((i) => i.href)).toEqual(["/admin/simulation"]);
  });

  it("Marketing group contains exactly Door Hangers", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const marketing = groups.find((g) => g.label === "Marketing");
    expect(marketing).toBeDefined();
    expect(marketing?.items.map((i) => i.href)).toEqual([
      "/admin/marketing/door-hangers",
    ]);
  });

  it("does not include Facebook Ads / Google Ads / Referrals / SEO placeholders", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: true });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/marketing/facebook-ads");
    expect(hrefs).not.toContain("/admin/marketing/google-ads");
    expect(hrefs).not.toContain("/admin/marketing/referrals");
    expect(hrefs).not.toContain("/admin/marketing/seo");
  });

  it("CRM group contains exactly Contacts + Quotes (in that order)", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const crm = groups.find((g) => g.label === "CRM");
    expect(crm).toBeDefined();
    expect(crm?.items.map((i) => i.href)).toEqual([
      "/admin/contacts",
      "/admin/quotes",
    ]);
  });

  it("Tasks has its own group with one entry", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const tasks = groups.find((g) => g.label === "Tasks");
    expect(tasks?.items.map((i) => i.href)).toEqual(["/admin/tasks"]);
  });

  it("Observability includes Quote interactions, Activity, Events in that order", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const obs = groups.find((g) => g.label === "Observability");
    expect(obs?.items.map((i) => i.href)).toEqual([
      "/admin/quote-interactions",
      "/admin/activity",
      "/admin/events",
    ]);
  });

  it("does not include Leads as a top-level sidebar entry", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: true });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/leads");
  });

  it("does not include Jobs / Invoices / top-level Properties placeholders", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: true });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/jobs");
    expect(hrefs).not.toContain("/admin/invoices");
    expect(hrefs).not.toContain("/admin/properties");
  });

  it("never surfaces individual test routes as sidebar links", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: true });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/geo-test");
    expect(hrefs).not.toContain("/admin/property-data-test");
    expect(hrefs).not.toContain("/admin/auto-quote-test");
    expect(hrefs).not.toContain("/admin/rate-limit-test");
  });

  it("includes the testing hub even when staging tools are hidden", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/admin/testing");
  });

  it("drops empty groups (defensive)", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
    }
  });
});

describe("isActiveNavItem", () => {
  it("matches the dashboard only on the exact root path", () => {
    expect(isActiveNavItem("/admin", "/admin")).toBe(true);
    expect(isActiveNavItem("/admin", "/admin/contacts")).toBe(false);
  });

  it("matches exact and nested paths for non-root items", () => {
    expect(isActiveNavItem("/admin/contacts", "/admin/contacts")).toBe(true);
    expect(
      isActiveNavItem("/admin/contacts", "/admin/contacts/abc-123"),
    ).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isActiveNavItem("/admin/contacts", "/admin/quotes")).toBe(false);
    expect(isActiveNavItem("/admin/contacts", "/admin/contactspersonas")).toBe(
      false,
    );
  });

  it("returns false when pathname is null / undefined", () => {
    expect(isActiveNavItem("/admin/contacts", null)).toBe(false);
    expect(isActiveNavItem("/admin/contacts", undefined)).toBe(false);
  });
});
