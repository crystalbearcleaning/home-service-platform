"use client";

import { useEffect } from "react";
import { AdminIcon } from "./icons";
import { AdminSidebar } from "./admin-sidebar";
import type { AdminNavGroup } from "./nav-config";

// Slide-in drawer used on small screens. Renders the same AdminSidebar
// content; the trigger lives in AdminTopbar (the hamburger button).

type Props = {
  open: boolean;
  onClose: () => void;
  groups: AdminNavGroup[];
  workspaceName: string;
};

export function AdminMobileNav({ open, onClose, groups, workspaceName }: Props) {
  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Admin navigation"
    >
      {/* Overlay — click anywhere outside the drawer to dismiss. */}
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] transition"
      />
      <div className="relative h-full w-72 max-w-[80vw] shadow-floating">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-2 top-2 z-10 rounded-control p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <AdminIcon name="close" size={20} />
        </button>
        <AdminSidebar
          groups={groups}
          workspaceName={workspaceName}
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}
