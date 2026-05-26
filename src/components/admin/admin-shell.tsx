"use client";

import { useState } from "react";
import { AdminMobileNav } from "./admin-mobile-nav";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";
import { resolveAdminNav } from "./nav-config";

// =========================================================================
// AdminShell — the single layout every /admin/* page wraps its body in.
//
// Client Component because of the mobile drawer state + active-nav
// highlighting via usePathname. Server-rendered admin pages pass in:
//   - workspaceName / userEmail (resolved from auth + active business)
//   - signOutSlot (the existing <SignOutButton />)
//   - stagingToolsEnabled (from resolveAdminShellContext)
//
// Layout shape (per docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md §6):
//   ┌───────────────────────────────────────┐
//   │ sidebar │  topbar                     │
//   │  (md+)  │─────────────────────────────│
//   │         │  page content (max-w-6xl)   │
//   └─────────┴─────────────────────────────┘
// =========================================================================

export type AdminShellProps = {
  workspaceName: string;
  userEmail: string;
  signOutSlot?: React.ReactNode;
  stagingToolsEnabled?: boolean;
  workspaceSwitcherSlot?: React.ReactNode;
  simulationBannerSlot?: React.ReactNode;
  children: React.ReactNode;
};

export function AdminShell({
  workspaceName,
  userEmail,
  signOutSlot,
  stagingToolsEnabled = false,
  workspaceSwitcherSlot,
  simulationBannerSlot,
  children,
}: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const groups = resolveAdminNav({ stagingToolsEnabled });

  return (
    <div className="min-h-screen bg-app text-ink">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen md:block">
          <AdminSidebar groups={groups} workspaceName={workspaceName} />
        </aside>

        {/* Content column */}
        <div className="flex min-h-screen flex-1 flex-col">
          <AdminTopbar
            workspaceName={workspaceName}
            userEmail={userEmail}
            signOutSlot={signOutSlot}
            stagingToolsEnabled={stagingToolsEnabled}
            workspaceSwitcherSlot={workspaceSwitcherSlot}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          {simulationBannerSlot}
          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AdminMobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        groups={groups}
        workspaceName={workspaceName}
      />
    </div>
  );
}
