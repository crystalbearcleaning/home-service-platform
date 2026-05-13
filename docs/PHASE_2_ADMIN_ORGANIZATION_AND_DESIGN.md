# Phase 2 — Admin Organization & Design Direction

**Status:** source-of-truth design doc for Phase 2.
**Created:** 2026-05-13.
**Scope:** docs only. No app code, business logic, or schema changes.

This document defines how the Admin app should be reorganized and styled
in Phase 2 — *before* any new code is written. Phase 2 is intentionally
**not** a new business-feature phase; it is a structural and visual
polish phase that prepares the codebase for the future surface model
(CEO/Owner, CRM, role apps, plugin apps).

> Required reading before starting Phase 2 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_1_QA_REPORT.md`
> - existing `src/app/admin/*` pages

---

## 1. Phase 2 Purpose

Phase 2 is not a new business-feature phase.

Phase 2 goal:

- **Reorganize what already exists.** Move scattered Phase 1 admin pages
  into a coherent navigation structure.
- **Improve the Admin app shell.** One shared layout (sidebar + header +
  page header + content area) instead of every page rolling its own.
- **Establish a future mental model for app surfaces.** Codify the
  distinction between Admin / CEO / CRM / Role / Customer / Plugin apps
  so we stop overloading "admin" with everything.
- **Create a theme-ready UI foundation.** Shared components, design
  tokens, semantic colors, separation of business logic from presentation.
- **Keep business logic unchanged.** No new endpoints, no new tables, no
  new server actions.

If a Phase 2 task would change business behavior, add a feature, or
touch the database schema — stop and ask first.

---

## 2. App Surface Mental Model

The platform will eventually expose multiple distinct *app surfaces*,
each with its own purpose and primary user. We codify the mental model
now so the Phase 2 Admin reorganization doesn't accidentally absorb
work that belongs elsewhere.

### Admin App (current focus)

- **Purpose:** configure, maintain, and improve the *system*.
- **Primary user:** the operator (today: the business owner wearing the
  admin hat).
- **Focus areas:**
  - system health
  - installed plugins (status, errors, version, permissions)
  - observability (events + activity)
  - staging / testing utilities
  - Phase 1 record views (leads / quotes / tasks / quote interactions)
- **Future admin tasks should be system-focused:**
  plugin errors, provider issues (Google / RentCast outages), context-engine
  setup, configuration drift. *Not* "follow up with a customer."

### CEO / Owner App (future surface)

- **Purpose:** run the *business*, prioritize work, review opportunities,
  make strategic decisions.
- **Primary user:** the owner wearing the CEO hat.
- **Focus areas:**
  - customer follow-up
  - business priorities (top 3 leads, top 3 quotes to chase)
  - revenue / pipeline summaries
  - strategic decisions
- **Not built in Phase 2.** Customer follow-up work should not be
  bolted onto Admin just because it's the only surface we have today.

### CRM Surface (future surface)

- **Purpose:** structured business-record management.
- **Focus areas:**
  - contacts / properties / leads / quotes
  - jobs / schedules (future Phase)
  - imports / exports
  - manual lead/quote creation
- **Not built in Phase 2.** Phase 1's read-only `/admin/leads`,
  `/admin/quotes`, `/admin/tasks` are temporary debug views, not a
  CRM. They live under "Business Records" in Admin for now and will
  migrate to the CRM surface later.

### Role Apps (future surfaces)

- **Purpose:** task-first execution for specific employee roles
  (technician, dispatcher, etc.).
- **Always focused on priority and next action**, not browsing tables.

### Customer Apps (existing pattern)

- **Purpose:** public, no-login customer-facing flows.
- **Current example:** `/q` — the customer quote app from Phase 1.

### Plugin Apps (future surface category)

- **Purpose:** full-screen plugin experiences.
- Some plugins will be small widgets / actions inside other surfaces;
  others will eventually have their own full app surface
  (e.g. a job-simulation plugin).
- **Not built in Phase 2.** The plugin registry stays Phase-1 shaped.

### Implication for Phase 2

Anything in the Phase 1 admin that *feels* like CEO / CRM / Role work
stays in Admin for now, but the nav grouping ("Business Records") makes
it visible that these are records-on-loan, not Admin's permanent home.
This avoids designing Admin around CRM ergonomics that we'll regret
later.

---

## 3. Phase 2 Navigation

**Rule:** only show real, useful, existing areas. No empty placeholder
pages. No fake future pages. No AI / Context / Providers / Domains / Users
nav items yet.

### Sidebar groups (in this order)

```
Overview
  ├── Dashboard                      → /admin

Plugins
  ├── Installed plugins              → /admin/plugins

Business Records
  ├── Quote interactions             → /admin/quote-interactions
  ├── Leads                          → /admin/leads
  ├── Quotes                         → /admin/quotes
  └── Tasks                          → /admin/tasks

Observability
  ├── Activity                       → /admin/activity
  └── Events                         → /admin/events

Tools
  ├── Testing tools                  → /admin/testing
  └── Staging tools                  → /admin/staging-tools  (gated)
```

### Testing tools hub (new in Phase 2)

- Create a new route `/admin/testing` that acts as a **hub page**, not
  a feature.
- The hub lists the existing individual test routes as cards:
  - `/admin/geo-test`
  - `/admin/property-data-test`
  - `/admin/auto-quote-test`
  - `/admin/rate-limit-test`
- **Keep the direct test routes** — do not delete or rewrite them.
  Linking from the hub is enough; deep-link bookmarks still work.
- Each individual test route is **removed from the top-level sidebar**.
  They are reachable via the Testing tools hub and via the existing
  cross-links inside admin pages.

### Staging tools

- Stays separate from Testing tools because it performs **destructive**
  reset actions.
- Keep the existing double-gate rules (`NEXT_PUBLIC_ENABLE_STAGING_TOOLS`
  for visibility, `ENABLE_STAGING_TOOLS` for the action). If the public
  flag is false, the Tools group hides the Staging tools link entirely
  but still shows Testing tools.

### Out of scope for Phase 2 navigation

The following pages are deliberately **not** in the sidebar:

- AI / Context engine
- Providers (Google, RentCast configuration)
- Domains management
- Users / Members
- Business settings editor
- Pricing editor
- Onboarding / setup checklist
- Any "coming soon" placeholder

If we genuinely need any of these later, add them then — not as
placeholders now.

---

## 4. Existing Page Meanings

These short definitions go into the page headers of each route so
operators know what they're looking at without a tour.

### Business Records group

| Route                       | Page title          | One-line description shown under the title |
| --------------------------- | ------------------- | ------------------------------------------ |
| `/admin/quote-interactions` | Quote interactions  | Source / debug view of public quote app submissions. One row per `/q` address lookup, including out-of-area and missing-data attempts. |
| `/admin/leads`              | Leads               | Business request records created when a quote-page visitor submits the contact form. Read-only in Phase 2. |
| `/admin/quotes`             | Quotes              | Immutable price snapshots. Each row preserves the options, line items, calculation, and property data as they existed when the customer submitted. |
| `/admin/tasks`              | Tasks               | Admin follow-up and system tasks. Each /q submission creates one task (schedule / manual quote / out-of-area review). Read-only in Phase 2. |

### Observability group

| Route             | Page title | One-line description |
| ----------------- | ---------- | -------------------- |
| `/admin/activity` | Activity   | Human-readable history of what happened — submissions, lead creations, plugin actions. |
| `/admin/events`   | Events     | Technical / system event log. Machine-readable counterpart to Activity. |

### Plugins group

| Route                  | Page title         | One-line description |
| ---------------------- | ------------------ | -------------------- |
| `/admin/plugins`       | Installed plugins  | Plugin status, version, declared permissions, settings, and link to the detail page. |
| `/admin/plugins/[key]` | (per-plugin)       | Plugin detail page. Status, version, permissions, basic analytics, and any issues. |

### Tools group

| Route                 | Page title    | One-line description |
| --------------------- | ------------- | -------------------- |
| `/admin/testing`      | Testing tools | Internal dev / test utilities for the platform's external providers and plugins. Useful when something looks wrong. |
| `/admin/staging-tools`| Staging tools | Destructive utilities for clearing quote-flow test data. Never enable in production. |

---

## 5. Dashboard Organization

The `/admin` dashboard becomes **hybrid** in Phase 2 — it speaks to the
operator (system health) but also surfaces the most useful Phase 1
business records so an owner can glance at it. We will split this back
out later when the CEO/Owner surface lands.

### Top — System / setup overview

Card grid:

- Workspace name (existing)
- Current user (existing)
- Installed plugins count + simple status pill (Phase 1 already counts)
- App surfaces count (existing)
- Public quote page status — green if the customer surface resolved its
  domain successfully; amber/grey otherwise. Only include if cheap to
  compute (no extra API calls).
- Staging tools warning — only renders when both env flags are true.

### Middle — Business records summary

Compact strip:

- Recent quote interactions (last N converted + total)
- Leads — open count
- Quotes — open count
- Tasks — open count

Counts come from the same RLS-scoped read each page already does. Do
not invent new aggregations or summary tables.

### Bottom — Quick links

Plain link list, one click each:

- View quote interactions
- View leads
- View tasks
- View plugins
- Open testing tools

### What the dashboard does **not** have in Phase 2

- Onboarding / setup checklist (lives with onboarding later)
- Revenue / pipeline widgets
- AI / Context engine status
- "What's next" recommendations
- Gamified progress indicators

If the dashboard feels empty after these rules, that's fine. An empty
dashboard with three real numbers is better than a busy one with five
fake ones.

---

## 6. Admin Shell Rules

**Every `/admin/*` page must use one consistent layout.** No more
one-off page chrome.

### Layout building blocks

1. **Admin shell** — provides the chrome (sidebar, header, content area).
   Implemented as a layout component, not duplicated per page.
2. **Desktop sidebar** — fixed left rail with the navigation groups in §3.
3. **Mobile hamburger / drawer** — same nav items, slides in over content.
4. **Top bar / header** — workspace name, user email, sign-out button,
   environment / staging-tools warning when active.
5. **Page header** — page title + 1-line description (the descriptions
   in §4) + optional contextual actions on the right.
6. **Primary content area** — the page's body. Width constrained.
7. **Consistent card / table / list styling** — see §7 + §8.

### Forbidden in Phase 2

- One-off page layouts — if a page needs an exception, document the
  reason in the page file's top comment and propose a shell extension.
- Inline ad-hoc nav (e.g., "← Admin" links). Replace with the shell's
  sidebar + breadcrumbs.
- Page-specific color schemes / typography overrides outside the
  theme tokens.

### Permission scope

Phase 2 admin pages remain authenticated-admin + active business
membership only. No new permission system in Phase 2.

---

## 7. Look and Feel Direction

### Default skin name

**Friendly Business OS**

### Visual feel

- Friendly home-service operating system.
- Lightly game-like *command center* — clear status, progress, and
  health signals.
- Familiar and intuitive for non-technical operators.
- Exciting and fun to use without feeling childish.
- The operator should feel: *connecting tools, plugins, and context
  makes the system and the business stronger.*

### Style inspiration

- **Familiarity and simplicity** from apps like TikTok / Instagram —
  bottom navigation patterns on mobile, large readable cards, minimal
  cognitive load for a single action per screen.
- **Progress / status / reward clarity** from popular mobile games —
  green when something is healthy, amber when something needs attention,
  one-line "what to do" copy.
- **Explicitly avoid:** copying game art, fantasy styling, badges /
  XP bars, sound effects, or anything that reads as childish in a B2B
  context.

### Tone

The voice is a **friendly business helper**, not a game host.

| Use this                            | Avoid this                          |
| ----------------------------------- | ----------------------------------- |
| Connect your tools                  | Unlock new power-ups                |
| Review new requests                 | New quests available!               |
| Keep your system healthy            | Level up your system                |
| Check what needs attention          | Battle pending alerts               |
| Your quote page is working          | Quest complete: quote page live     |
| This plugin needs attention         | Plugin disabled — quest failed      |

Game-language is only acceptable later if it is *genuinely* appropriate
(e.g., a simulation plugin); never as decoration.

### Color

- **Adaptive.** Different surface areas use different color palettes
  drawn from the same token set.
- **Normal admin / system pages:** clean neutral base — readable,
  balanced, low chroma. Whites, light grays, one accent.
- **Plugin / status / progress areas:** more friendly color and
  personality (greens for healthy, ambers for attention,
  blues for in-progress). Reserved, not splashy.
- **Do not** make every page overly colorful. The neutral base is the
  default; color is information.

### Density

- **Adaptive.**
- **Dashboard / setup / system pages:** spacious, card-based, easy to
  scan at a glance.
- **Record lists** (`leads`, `quotes`, `tasks`, `quote-interactions`,
  `events`, `activity`): more compact, table / list-based; still clean
  and readable. Comfortable row height, not cramped.

### Navigation

- **Desktop:** left sidebar (always visible at ≥ md breakpoint).
- **Mobile:** hamburger button opens a drawer with the same items.
- **Phase 2 does not build** native / mobile-app-style bottom tab
  navigation. That belongs to the future CEO/Owner and Role apps where
  the surface is intentionally task-first.

---

## 8. Theme-Ready Foundation

Future theme / skin plugins may exist. **Phase 2 does not build the
theme plugin system.** But Phase 2 must make the UI theme-ready so
that switching skins later is mostly a token swap, not a rewrite.

### Phase 2 must

- **Shared components.** All cards, tables, list rows, page headers,
  badges, buttons, form inputs come from one shared component layer.
  No more ad-hoc Tailwind-only blobs scattered across pages.
- **Design tokens via CSS variables.** Colors, spacing, radius,
  typography sized via tokens. Tailwind config consumes the tokens.
- **Semantic colors.** Define and use semantic names —
  `bg-surface`, `bg-surface-muted`, `text-default`, `text-muted`,
  `border-default`, `state-success`, `state-warning`, `state-danger`,
  `state-info`, `accent`. *Do not* use raw `bg-gray-100` / `text-red-700`
  in pages.
- **Separation of business logic from presentation.** Server components
  fetch data; presentational components render it. Avoid pulling
  Supabase queries inside layout / chrome components.

### Phase 2 must not

- Build a theme picker UI.
- Build per-business skin overrides.
- Build a runtime CSS-in-JS layer or skin marketplace.
- Add a new theme/skin database table or schema columns.

### Possible future skins (illustrative only, not delivered)

- Friendly Business OS *(Phase 2 default)*
- Clean SaaS
- Command Center
- Luxury Pro
- Cozy Home Service
- Minimal

These names are placeholders to validate that the token model is
expressive enough — they will be designed later if/when needed.

---

## 9. Phase 2 Do Not Build

Pinned for clarity. These remain off-limits for Phase 2:

- GoHighLevel / SMS / email integration
- Notification system
- New CRM workflows
- Manual lead creation
- Scheduling calendar
- Appointments
- Jobs
- Invoices
- Payments
- Quote acceptance
- Customer login / accounts
- AI / Context engine
- Onboarding / setup checklist
- Placeholder future pages
- Theme / skin plugin system
- New database schema (no migrations, no column adds)

Plus the entire Phase 1 Do-Not-Build list still applies. If a Phase 2
task would touch any of these, **stop and ask before changing code.**

---

## 10. Implementation Plan

Phase 2 is split into three small steps. Each ends with a clean tsc /
test / build / lint pass and a commit.

### Step 2A — Admin shell + shared components

- Add `src/components/admin-shell/*` (or similar) — the layout shell,
  sidebar, header, mobile drawer, page header.
- Add `src/components/ui/*` — shared Card, Table, ListRow, Badge,
  Button, EmptyState, etc. Token-driven, semantic-color-based.
- Introduce CSS variables / design tokens (Tailwind config + a tokens
  module). Map semantic colors → token values.
- **No existing page is touched yet.** Step 2A only adds the
  infrastructure.
- Definition of done: `npm run build` passes; shell + components are
  Storybook-able (manual visual check in a `/admin/shell-preview`
  scratch route is fine — delete it before commit if used).

### Step 2B — Migrate existing pages into the shell

- Wrap each `/admin/*` page in the shell. Remove inline `← Admin`
  links; rely on the sidebar.
- Replace ad-hoc Tailwind cards / tables / badges with the shared
  components.
- **Create `/admin/testing`** as the hub page that links to
  `geo-test`, `property-data-test`, `auto-quote-test`,
  `rate-limit-test`.
- **Remove the four individual test routes from the top-level
  sidebar** (they remain reachable via the hub and direct URL).
- Update the `/admin/page.tsx` dashboard sections per §5.
- No behavior changes. Each page still reads/writes the same data via
  the same server actions.
- Definition of done: all routes still pass `npx tsc --noEmit`,
  `npm run test`, `npm run lint`, and `npm run build`; manually
  spot-check every page renders inside the new shell.

### Step 2C — Polish + Phase 2 QA

- Tighten dashboard copy and empty states using the tone from §7.
- Audit colors — anything not from the semantic-token set is replaced
  or justified.
- Verify mobile drawer works at ≤ sm breakpoint.
- Verify the Tools group hides Staging tools when
  `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=false`.
- Run the full QA checklist (mirror of `docs/PHASE_1_QA_REPORT.md`).
- Update `docs/PHASE_1_QA_REPORT.md` reference to note Phase 2
  closed-out state, or create
  `docs/PHASE_2_QA_REPORT.md` for the Phase 2 sign-off.
- Commit Phase 2 closure.

### Out of scope for Phase 2

- Anything in §9.
- Anything that requires schema migrations.
- Any new server action, RPC, or table read pattern.
- Any new external provider integration.

If you reach a fork where you think one of these is necessary,
**stop and ask.**

---

## Appendix A — Existing route inventory (as of 2026-05-13)

For accuracy. These are the only `/admin/*` routes Phase 2 reorganizes:

```
/admin                         dashboard
/admin/activity                Activity log
/admin/events                  Events log
/admin/leads                   Leads list
/admin/plugins                 Installed plugins
/admin/plugins/[pluginKey]     Plugin detail
/admin/quote-interactions      Quote interactions
/admin/quotes                  Quotes
/admin/tasks                   Tasks
/admin/staging-tools           Staging tools (destructive, gated)
/admin/auto-quote-test         Auto-Quote test util
/admin/geo-test                Geo provider test util
/admin/property-data-test      RentCast test util
/admin/rate-limit-test         Rate-limit test util
```

Phase 2 adds exactly one new route: `/admin/testing` (the hub). No
other routes are added, renamed, or deleted in Phase 2.

---

## Appendix B — Phase 2A component inventory (delivered)

Step 2A shipped the design tokens + shared components below. Step 2B
must consume these — do **not** introduce new one-off chrome or new
ad-hoc color classes.

### Design tokens

- Defined as CSS variables on `:root` in `src/app/globals.css`.
- Surfaced as semantic Tailwind utilities in `tailwind.config.ts`.
- No body-level style overrides yet; pages opt in via classes so
  unmigrated Phase 1 pages render identically until Step 2B.

Token classes (use these everywhere instead of `bg-gray-*` / `text-red-*`):

| Concept             | Tailwind class                                    |
| ------------------- | ------------------------------------------------- |
| App background      | `bg-app`                                          |
| Surface (card)      | `bg-surface` / `bg-surface-muted`                 |
| Borders             | `border-line` / `border-line-strong`              |
| Text                | `text-ink` / `text-ink-muted` / `text-ink-faint`  |
| Brand               | `bg-brand` / `text-brand` / `bg-brand-strong`     |
| Success tone        | `bg-success` / `bg-success-soft` / `text-success-strong` |
| Warning tone        | `bg-warning` / `bg-warning-soft` / `text-warning-strong` |
| Danger tone         | `bg-danger` / `bg-danger-soft` / `text-danger-strong`   |
| Info tone           | `bg-info` / `bg-info-soft` / `text-info-strong`         |
| Neutral tone        | `bg-neutral` / `bg-neutral-soft` / `text-neutral-strong` |
| Radii               | `rounded-control` / `rounded-card` / `rounded-pill` |
| Shadows             | `shadow-card` / `shadow-floating`                 |

### Shared components

All live under `src/components/admin/`. Import from the barrel:

```ts
import {
  AdminShell,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
  EmptyState,
  DetailGrid,
  AdminIcon,
} from "@/components/admin";
```

| Component         | File                                                 | Purpose                                                                                |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AdminShell`      | `src/components/admin/admin-shell.tsx`               | Top-level layout. Wraps every `/admin/*` page body in Step 2B. Client component.       |
| `AdminSidebar`    | `src/components/admin/admin-sidebar.tsx`             | Desktop sidebar (md+). Highlights active item via `usePathname`.                       |
| `AdminTopbar`     | `src/components/admin/admin-topbar.tsx`              | Header bar: hamburger, workspace label, staging-tools warning, user email, sign-out slot. |
| `AdminMobileNav`  | `src/components/admin/admin-mobile-nav.tsx`          | Slide-in drawer for ≤ sm. Reuses `AdminSidebar` internals.                             |
| `PageHeader`      | `src/components/admin/page-header.tsx`               | Page title + description + optional eyebrow + actions.                                 |
| `SectionCard`     | `src/components/admin/section-card.tsx`              | Card wrapper with optional title/description/actions header. `padding="default"/"tight"/"none"`. |
| `StatCard`        | `src/components/admin/stat-card.tsx`                 | Label + value + optional description, tone, icon.                                      |
| `StatusBadge`     | `src/components/admin/status-badge.tsx`              | Pill with semantic tone (`success` / `warning` / `danger` / `info` / `neutral` / `brand`). Optional dot. |
| `EmptyState`      | `src/components/admin/empty-state.tsx`               | Friendly "nothing here yet" panel with optional CTA.                                    |
| `DetailGrid`      | `src/components/admin/detail-grid.tsx`               | Label/value pair grid (2 / 3 / 4 columns).                                              |
| `AdminIcon`       | `src/components/admin/icons.tsx`                     | Inline outline icon set, 24×24 viewbox. Keys: `home`, `puzzle`, `inbox`, `users`, `document`, `tasks`, `activity`, `pulse`, `wrench`, `shield`, `menu`, `close`. |
| `nav-config.ts`   | `src/components/admin/nav-config.ts`                 | `ADMIN_NAV` source + `resolveAdminNav(gate)` + `isActiveNavItem`. Pure, unit-tested.   |
| `cn`              | `src/lib/cn.ts`                                      | Tiny dependency-free className joiner used by every component.                          |

### How Step 2B should wrap a page

```tsx
import { AdminShell, PageHeader, SectionCard } from "@/components/admin";
import { SignOutButton } from "@/app/admin/sign-out-button";
// ...auth + business resolution as today...

return (
  <AdminShell
    workspaceName={business.name}
    userEmail={user.email!}
    signOutSlot={<SignOutButton />}
    stagingToolsEnabled={stagingGate.publicEnabled}
  >
    <PageHeader
      title="Leads"
      description="Business request records created from /q submissions."
    />
    <SectionCard>
      {/* page body */}
    </SectionCard>
  </AdminShell>
);
```

Inline `← Admin` links and bespoke header chrome are removed during the
Step 2B migration; navigation is the sidebar's job.

### Quality gates at end of Step 2A

- `npx tsc --noEmit` — clean (0 errors)
- `npm run test` — **201 / 201 tests pass** (9 new tests for
  `nav-config`).
- `npm run lint` — clean (0 warnings, 0 errors).
- `npm run build` — green; build output unchanged for existing routes
  (the shell isn't yet wired to any page).

---

## Appendix C — Step 2B migration (delivered)

Step 2B wrapped every existing `/admin/*` route in the shared
`<AdminShell>`, replaced ad-hoc cards/badges with the shared
components, and added `/admin/testing` as the testing-tools hub.

### Pages migrated (14)

`/admin` (dashboard) · `/admin/quote-interactions` · `/admin/leads` ·
`/admin/quotes` · `/admin/tasks` · `/admin/activity` · `/admin/events`
· `/admin/plugins` · `/admin/plugins/[pluginKey]` · `/admin/staging-tools`
· `/admin/geo-test` · `/admin/property-data-test` ·
`/admin/auto-quote-test` · `/admin/rate-limit-test`.

### Pages added (1)

`/admin/testing` — the testing-tools hub. Lists the four internal test
utilities as cards (purpose + scope per tool). Direct URLs still work;
the hub is the canonical entry point. The four test routes are
**removed from the top-level sidebar** per the Phase 2 design.

### Dashboard sections (per §5)

- **Top — System overview:** `StatCard` grid (Workspace, Slug, Role,
  App surfaces, Installed plugins, Signed in as) + a staging-tools
  warning banner when both flags are on.
- **Middle — Business records summary:** four live `StatCard`s
  (quote interactions, leads, quotes, open tasks) using head-only
  count queries. Renders an `EmptyState` linking to `/q` when all four
  are zero.
- **Bottom — Quick links:** five entries (interactions, leads, tasks,
  plugins, testing hub) styled as the canonical `QuickLink` row.

### Helper added

`src/components/admin/admin-shell-props.ts` —
`resolveAdminShellContext({ workspaceName, userEmail })` reads
`process.env` for the staging-tools gate and returns the props every
page passes to `<AdminShell>`. Eliminates per-page staging-gate imports.

### Preserved behavior

- Auth flow unchanged; every page still uses `createClient()` + `auth.getUser()` + `getActiveBusinessForUser()` + `redirect()`.
- All Supabase queries unchanged (same selects, same RLS-scoped client). The dashboard adds four new **head-only count queries** — no row reads, no business writes.
- No server actions added or modified.
- Staging reset double-gate intact (`ENABLE_STAGING_TOOLS` re-checked server-side; confirmation string + auth + business + executor unchanged).
- Plugin registry, rate limiter, geo / RentCast / Auto-Quote logic untouched.
- Public quote flow (`/q`) untouched.
- Database schema untouched; no migrations.

### Quality gates at end of Step 2B

- `npx tsc --noEmit` — clean (0 errors)
- `npm run test` — **201 / 201 tests pass** across 22 files.
- `npm run lint` — clean (0 warnings, 0 errors).
- `npm run build` — green; 15 admin routes compile (was 14; `+ /admin/testing`).
