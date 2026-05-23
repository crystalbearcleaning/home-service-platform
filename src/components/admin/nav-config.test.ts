import { describe, expect, it } from "vitest";
import { isActiveNavItem, resolveAdminNav } from "./nav-config";

describe("resolveAdminNav", () => {
  it("includes Staging tools only when the gate is enabled", () => {
    const withGate = resolveAdminNav({ stagingToolsEnabled: true });
    const withoutGate = resolveAdminNav({ stagingToolsEnabled: false });

    const withHrefs = withGate
      .flatMap((g) => g.items.map((i) => i.href));
    const withoutHrefs = withoutGate
      .flatMap((g) => g.items.map((i) => i.href));

    expect(withHrefs).toContain("/admin/staging-tools");
    expect(withoutHrefs).not.toContain("/admin/staging-tools");
  });

  it("always exposes the core groups in the expected order", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    expect(groups.map((g) => g.label)).toEqual([
      "Overview",
      "Plugins",
      "Business Records",
      "Automations",
      "Observability",
      "Tools",
    ]);
  });

  it("includes Message Automations under the Automations group", () => {
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    const automations = groups.find((g) => g.label === "Automations");
    expect(automations).toBeDefined();
    expect(automations?.items.map((i) => i.href)).toEqual([
      "/admin/message-automations",
    ]);
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
    // Tools group has Testing + Staging; with the gate off, Testing
    // alone keeps the group visible. Even if a future edit removes the
    // testing hub, the filter should never emit an empty group.
    const groups = resolveAdminNav({ stagingToolsEnabled: false });
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
    }
  });
});

describe("isActiveNavItem", () => {
  it("matches the dashboard only on the exact root path", () => {
    expect(isActiveNavItem("/admin", "/admin")).toBe(true);
    expect(isActiveNavItem("/admin", "/admin/leads")).toBe(false);
    expect(isActiveNavItem("/admin", "/admin/plugins/foo")).toBe(false);
  });

  it("matches exact and nested paths for non-root items", () => {
    expect(isActiveNavItem("/admin/plugins", "/admin/plugins")).toBe(true);
    expect(isActiveNavItem("/admin/plugins", "/admin/plugins/customer_quote_sales_page")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isActiveNavItem("/admin/leads", "/admin/quotes")).toBe(false);
    expect(isActiveNavItem("/admin/leads", "/admin/leadspersonas")).toBe(false);
  });

  it("returns false when pathname is null / undefined", () => {
    expect(isActiveNavItem("/admin/leads", null)).toBe(false);
    expect(isActiveNavItem("/admin/leads", undefined)).toBe(false);
  });
});
