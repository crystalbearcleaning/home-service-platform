"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { AdminIcon } from "./icons";
import {
  isActiveNavItem,
  type AdminNavGroup,
} from "./nav-config";

// Desktop sidebar — rendered at md+ breakpoints inside AdminShell.
// Mobile uses AdminMobileNav (same nav config; different chrome).

type Props = {
  groups: AdminNavGroup[];
  workspaceName: string;
  // Optional handler so the mobile drawer can close itself after a
  // navigation click. Desktop sidebar passes nothing.
  onNavigate?: () => void;
};

export function AdminSidebar({ groups, workspaceName, onNavigate }: Props) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin navigation"
      className="flex h-full w-64 flex-col border-r border-line bg-surface"
    >
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <div
          aria-hidden="true"
          className="grid h-7 w-7 place-items-center rounded-control bg-brand text-surface text-xs font-semibold"
        >
          {workspaceName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">
            {workspaceName}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">
            Admin
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        {groups.map((group, gi) => (
          <div
            key={group.label}
            className={cn(gi === 0 ? "" : "mt-5", "last:mb-0")}
          >
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActiveNavItem(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-control px-2 py-2 text-sm transition",
                        active
                          ? "bg-brand/10 text-brand font-medium"
                          : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                      )}
                    >
                      <AdminIcon
                        name={item.icon}
                        size={16}
                        className={cn(
                          active
                            ? "text-brand"
                            : "text-ink-faint group-hover:text-ink-muted",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
        <span className="font-medium text-ink-muted">Friendly Business OS</span>
        <span className="ml-1">· Phase 2</span>
      </div>
    </nav>
  );
}
