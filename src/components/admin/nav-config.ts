import type { AdminIconKey } from "./icons";

// =========================================================================
// Admin navigation source-of-truth (Phase 2A).
//
// Mirrors `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md` §3. Edits to
// this file change the sidebar / mobile drawer everywhere.
//
// Phase 2A only DEFINES the structure — no admin pages are migrated to
// the shell yet. Step 2B wraps every route in <AdminShell> and removes
// inline "← Admin" links so this becomes the single source of truth.
// =========================================================================

export type AdminNavItem = {
  label: string;
  href: string;
  icon: AdminIconKey;
  description?: string;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

// Inputs the nav uses to decide whether a gated item appears.
export type AdminNavGate = {
  stagingToolsEnabled: boolean;
};

// Static structure. Resolve via `resolveAdminNav(gate)` to get the
// final list with gated items filtered out.
const RAW_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: "home",
      },
    ],
  },
  {
    label: "Plugins",
    items: [
      {
        label: "Installed plugins",
        href: "/admin/plugins",
        icon: "puzzle",
      },
    ],
  },
  {
    label: "Business Records",
    items: [
      {
        label: "Quote interactions",
        href: "/admin/quote-interactions",
        icon: "inbox",
      },
      {
        label: "Leads",
        href: "/admin/leads",
        icon: "users",
      },
      {
        label: "Quotes",
        href: "/admin/quotes",
        icon: "document",
      },
      {
        label: "Tasks",
        href: "/admin/tasks",
        icon: "tasks",
      },
    ],
  },
  {
    label: "Observability",
    items: [
      {
        label: "Activity",
        href: "/admin/activity",
        icon: "activity",
      },
      {
        label: "Events",
        href: "/admin/events",
        icon: "pulse",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        label: "Testing tools",
        href: "/admin/testing",
        icon: "wrench",
      },
      {
        label: "Staging tools",
        href: "/admin/staging-tools",
        icon: "shield",
      },
    ],
  },
];

// IMPORTANT — the individual test routes
//   /admin/geo-test
//   /admin/property-data-test
//   /admin/auto-quote-test
//   /admin/rate-limit-test
// are NOT in the sidebar. They live behind /admin/testing (created in
// Step 2B). Direct URLs still work; the hub is just the canonical entry.

// Hrefs that require the staging-tools gate to be enabled.
const STAGING_GATED_HREFS = new Set(["/admin/staging-tools"]);

export function resolveAdminNav(gate: AdminNavGate): AdminNavGroup[] {
  return RAW_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (STAGING_GATED_HREFS.has(item.href)) {
        return gate.stagingToolsEnabled;
      }
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}

// Used by the sidebar's active-state logic. The pathname matches an item
// when it equals the href exactly OR when it's a child path (so
// `/admin/plugins/some-key` highlights `/admin/plugins`). The root
// `/admin` item only matches the exact pathname so we don't permanently
// highlight Dashboard on every page.
export function isActiveNavItem(
  itemHref: string,
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  if (itemHref === "/admin") return pathname === "/admin";
  if (pathname === itemHref) return true;
  return pathname.startsWith(itemHref + "/");
}
