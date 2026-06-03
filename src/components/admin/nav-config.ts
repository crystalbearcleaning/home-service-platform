import type { AdminIconKey } from "./icons";

// =========================================================================
// Admin navigation source-of-truth.
//
// Phase 4B reorganisation: CRM (Contacts + Quotes) is the primary
// records area; Tasks lives in its own group; Quote interactions moves
// under Observability. Leads list stays reachable for now (secondary
// CRM entry — primary navigation to leads is via contact detail).
//
// Mirrors §3 of docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md.
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

export type AdminNavGate = {
  stagingToolsEnabled: boolean;
};

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
    label: "CRM",
    items: [
      {
        label: "Contacts",
        href: "/admin/contacts",
        icon: "users",
      },
      {
        label: "Quotes",
        href: "/admin/quotes",
        icon: "document",
      },
      {
        label: "Jobs",
        href: "/admin/jobs",
        icon: "briefcase",
      },
      {
        label: "Invoices",
        href: "/admin/invoices",
        icon: "receipt",
      },
    ],
  },
  {
    label: "Tasks",
    items: [
      {
        label: "Tasks",
        href: "/admin/tasks",
        icon: "tasks",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Schedule",
        href: "/admin/schedule",
        icon: "calendar",
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      {
        label: "Door Hangers",
        href: "/admin/marketing/door-hangers",
        icon: "megaphone",
      },
    ],
  },
  {
    label: "Simulation",
    items: [
      {
        label: "Saves",
        href: "/admin/simulation",
        icon: "flask",
      },
      {
        label: "Play",
        href: "/admin/simulation/play",
        icon: "flask",
      },
    ],
  },
  {
    label: "Automations",
    items: [
      {
        label: "Message Automations",
        href: "/admin/message-automations",
        icon: "broadcast",
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
    label: "Observability",
    items: [
      {
        label: "Quote interactions",
        href: "/admin/quote-interactions",
        icon: "inbox",
      },
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

// /admin/leads is intentionally NOT in the sidebar (Phase 4 treats
// leads as related request/opportunity records accessed via contact
// detail). The route is still reachable via direct URL and via every
// link sweep target (contact detail, quote interactions, etc.).
//
// Individual test routes (/admin/geo-test, /admin/property-data-test,
// /admin/auto-quote-test, /admin/rate-limit-test) are also not in the
// sidebar; they live behind /admin/testing.

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

export function isActiveNavItem(
  itemHref: string,
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  if (itemHref === "/admin") return pathname === "/admin";
  if (pathname === itemHref) return true;
  return pathname.startsWith(itemHref + "/");
}

// Resolves the single best-matching nav item for a pathname across all
// groups. "Best" = the longest `item.href` that `isActiveNavItem`
// considers active. This is the rule the sidebar uses to highlight
// exactly one item — without it, `/admin/simulation/play` would
// highlight both `/admin/simulation` (prefix match) and
// `/admin/simulation/play` (exact match).
//
// Returns null when no item matches (e.g. unrelated path).
export function resolveActiveNavHref(
  groups: ReadonlyArray<AdminNavGroup>,
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (!isActiveNavItem(item.href, pathname)) continue;
      if (best === null || item.href.length > best.length) {
        best = item.href;
      }
    }
  }
  return best;
}
