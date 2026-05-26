"use client";

import { AdminIcon } from "./icons";

// Topbar — sits above the content area on every admin page. Holds the
// workspace name (visible on mobile where the sidebar is hidden), the
// hamburger trigger, the staging-tools warning pill, the user email, and
// a sign-out slot provided by the consumer.

type Props = {
  workspaceName: string;
  userEmail: string;
  signOutSlot?: React.ReactNode;
  stagingToolsEnabled?: boolean;
  workspaceSwitcherSlot?: React.ReactNode;
  onOpenMobileNav: () => void;
};

export function AdminTopbar({
  workspaceName,
  userEmail,
  signOutSlot,
  stagingToolsEnabled,
  workspaceSwitcherSlot,
  onOpenMobileNav,
}: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="rounded-control p-1.5 text-ink-muted hover:bg-surface-muted md:hidden"
      >
        <AdminIcon name="menu" size={20} />
      </button>

      <div className="md:hidden text-sm font-medium text-ink truncate">
        {workspaceName}
      </div>

      <div className="hidden md:flex items-baseline gap-2 min-w-0">
        <span className="text-sm font-medium text-ink truncate">
          {workspaceName}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          Admin
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {workspaceSwitcherSlot}
        {stagingToolsEnabled && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 rounded-pill bg-warning-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-warning-strong"
            title="Staging tools are enabled. Never enable in production."
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-warning" />
            Staging mode
          </span>
        )}
        <span className="hidden sm:inline text-xs text-ink-muted truncate max-w-[12rem]">
          {userEmail}
        </span>
        {signOutSlot}
      </div>
    </header>
  );
}
