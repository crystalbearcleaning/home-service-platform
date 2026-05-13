// Public surface for the Phase 2 admin shell + shared components.
//
// IMPORTANT: this barrel re-exports several Client Components
// (`"use client"`). Server Components can still import named symbols
// from here — Next.js treats each module's directive independently.
// Importing from a single barrel keeps consumer imports tidy.

export { AdminShell, type AdminShellProps } from "./admin-shell";
export {
  resolveAdminShellContext,
  type AdminShellContext,
} from "./admin-shell-props";
export { AdminSidebar } from "./admin-sidebar";
export { AdminTopbar } from "./admin-topbar";
export { AdminMobileNav } from "./admin-mobile-nav";
export { AdminIcon, type AdminIconKey } from "./icons";

export {
  resolveAdminNav,
  isActiveNavItem,
  type AdminNavGroup,
  type AdminNavItem,
  type AdminNavGate,
} from "./nav-config";

export { PageHeader, type PageHeaderProps } from "./page-header";
export { SectionCard, type SectionCardProps } from "./section-card";
export { StatCard, type StatCardProps } from "./stat-card";
export {
  StatusBadge,
  type StatusBadgeProps,
  type StatusTone,
} from "./status-badge";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
  DetailGrid,
  type DetailGridItem,
  type DetailGridProps,
} from "./detail-grid";
