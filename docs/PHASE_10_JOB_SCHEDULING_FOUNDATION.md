# Phase 10 — Job Scheduling Foundation

**Status:** source-of-truth design doc for Phase 10.
**Created:** 2026-06-02.
**Scope:** docs only (Phase 10A). **No app code, no business logic,
no schema changes** in this step.

Phase 10 sits on top of the Phase 9 Jobs foundation. Phase 9
created the **Job** as a work-order object with status, line items,
quote-to-job conversion, and three simple scheduling fields
(`scheduled_start_at`, `scheduled_end_at`, `arrival_window_label`)
exposed as form inputs on the job detail page. Phase 10 turns those
fields into a **real scheduling surface** — a Jobber-style weekly
calendar at `/admin/schedule` with an unscheduled-jobs panel,
click-to-schedule modal, reschedule + unschedule actions, and a
basic same-business overlap warning. Phase 10 does **not** build
crew assignment, a technician app, route optimization, Google
Calendar sync, customer notifications, recurring jobs, invoices,
payments, or simulation-driven scheduling.

> Required reading before starting Phase 10 implementation work:
>
> - `CLAUDE.md`
> - `schema.md` (especially §22f jobs + job_line_items, §13 contacts,
>   §14 properties, §16 quotes, §22c–§22e simulation_runs columns —
>   the active-business + active-save resolver pattern)
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md`
>   (especially §10 scheduling fields, §14 schema, Appendices C / D)
> - `docs/PHASE_9_QA_REPORT.md`
> - existing Jobs code:
>   - `src/core/jobs/admin-data.ts`
>     (`listJobs`, `getJob`, `listJobsForContact`, `listJobsForQuote`)
>   - `src/core/jobs/admin-create.ts`
>     (`updateJobScheduling`, `updateJobStatus`,
>     `createManualJob`, `createJobFromQuote`)
>   - `src/core/jobs/validation.ts`
>     (`validateSchedulingFields` — already enforces
>     end ≥ start)
>   - `src/core/jobs/display.ts`
>     (`formatSchedulingTimestamp`, `formatSchedulingRange`,
>     `jobStatusLabel`, `jobStatusTone`, `formatCentsAsDollars`)
>   - `src/app/admin/jobs/page.tsx` — list page pattern
>   - `src/app/admin/jobs/[jobId]/page.tsx` —
>     detail page pattern
>   - `src/app/admin/jobs/[jobId]/scheduling-form.tsx` —
>     current ISO ↔ `datetime-local` boundary
>   - `src/app/admin/jobs/actions.ts` —
>     `updateJobSchedulingAction`, `updateJobStatusAction`
> - existing admin nav config
>   (`src/components/admin/nav-config.ts`,
>   `src/components/admin/nav-config.test.ts`)
> - existing AdminShell + shared components
>   (`src/components/admin/index.ts` —
>   `AdminShell`, `PageHeader`, `SectionCard`, `StatusBadge`,
>   `EmptyState`, `renderWorkspaceSwitcher`,
>   `renderSimulationBanner`, `resolveAdminShellContext`)

---

## 1. Phase 10 Purpose

Phase 10 is **Job Scheduling Foundation**.

Goal: add a Jobber-style schedule view for jobs.

Phase 9 created Jobs as work orders. Phase 10 lets the operator
**place** jobs onto a calendar schedule.

### Core flow

```
Job created
  ↓
Job appears as unscheduled
  ↓
Operator schedules job
  ↓
Job appears on weekly calendar
  ↓
Operator can reschedule or unschedule job
  ↓
Click job to open job detail
```

Phase 10A is **docs only.** No app code, no schema, no business
logic change in this step.

### Mental model

| Object | Role | Phase |
|---|---|---|
| **Job** | Approved work order | Phase 9 (exists) |
| **Schedule** | Placement of a job on a day + time | **Phase 10 (this phase)** |
| **Visit / Appointment** | First-class repeatable on-site occurrence | Future |
| **Crew assignment** | Who works the job | Future |
| **Route optimization** | Order + drive time across jobs | Future |
| **Invoice** | Bill for completed work | Future |

A scheduled job in Phase 10 is *the job itself, with three already-
existing columns filled in.* There is no `visits` row, no calendar-
event row, no crew assignment. The schedule is a UI lens over the
existing Phase 9 columns.

---

## 2. Scheduling Model

Phase 10 uses the existing Phase 9 fields on `jobs`:

- `scheduled_start_at` (timestamptz NULL)
- `scheduled_end_at` (timestamptz NULL, CHECK end ≥ start when both
  present — already in the Phase 9B migration)
- `arrival_window_label` (text NULL)
- `status` (text NOT NULL — Phase 9 taxonomy:
  `draft | unscheduled | scheduled | in_progress | completed | canceled`)

**No new scheduling table in Phase 10.**

### Definition

A job is **scheduled** when:

- `scheduled_start_at` is non-null, **and**
- `status = 'scheduled'`.

A job is **unscheduled** when:

- `scheduled_start_at` is null, **and**
- `status` is `'unscheduled'` **or** `'draft'`.

Other states:

- `in_progress` / `completed` / `canceled` are **terminal-ish**
  for Phase 10 scheduling — see §10 for how they appear.
- A job with `scheduled_start_at` set but `status != 'scheduled'`
  (e.g. `in_progress`, `completed`) is **not** a "scheduling
  candidate" in Phase 10 — the scheduling actions don't touch it.
  It still renders on the calendar (greyed) if it falls inside the
  visible week and has a start timestamp.

### Why no new table

Phase 9 already added the three scheduling columns *specifically
so Phase 10 could land without a migration.* A first-class `visits`
or `appointments` table becomes necessary the moment any of these
shows up:

- multiple visits per job (recurring service, multi-day work),
- crew assignment + per-visit assignment,
- per-visit completion state (visit 1 done, visit 2 not),
- per-visit pricing or invoicing,
- a customer-facing per-visit notification.

**None of those land in Phase 10.** When they do, that phase
introduces `visits` and migrates the three columns out of `jobs`.

---

## 3. Main Schedule Page

Add a single new route:

```
/admin/schedule
```

This is the main scheduling surface.

It shows:

- **Week calendar view** (§4) for the active business
- **Unscheduled jobs sidebar/panel** (§6)
- **Scheduled job cards** placed by
  `scheduled_start_at` / `scheduled_end_at`
- **Current week navigation** (← prev / Today / next →,
  optional date picker)
- **Click a job → opens the job detail page**
  (`/admin/jobs/[jobId]`)

The page should *feel like a scheduling board, not a table.* Layout
recommendation: two-column at `md`+ — calendar on the left
(approximately 2/3 width), unscheduled panel on the right
(approximately 1/3 width). Stack vertically on small screens.

### Page chrome

- `<AdminShell>` (workspace switcher + simulation banner reused).
- `<PageHeader eyebrow="Operations" title="Schedule" ... />`
  — see §13 on nav placement; the **eyebrow** should reflect the
  chosen nav group.
- No "New scheduled job" button (jobs are created via the existing
  Phase 9D `/admin/jobs/new` flow; the unscheduled panel is the
  scheduling entry point).

### Server-rendered, client-interactive

Pattern matches the existing admin shell:

- The page is a Server Component that resolves auth + active
  business, then loads the week range's scheduled jobs +
  unscheduled jobs and renders.
- The week-nav arrows and the scheduling modal are
  Client Components. Modals call the Phase 10D server actions and
  call `router.refresh()` (or rely on `revalidatePath`) on success.

---

## 4. Calendar View

Phase 10 ships **week view only.**

### Visual layout

- Columns: Monday through Friday as the **main visible work week.**
  (Saturday + Sunday are out of the visible grid by default; a
  scheduled job that lands on Sat / Sun in the selected week still
  needs to be visible somewhere — see "Outside-hours / outside-grid"
  below.)
- Rows: time-of-day, with **visual working hours 8 AM–6 PM** as the
  main band. A standard "stacked time-grid" presentation
  (hour rows, jobs as cards spanning their start → end).
- Each scheduled job is placed by `scheduled_start_at` and
  `scheduled_end_at`:
  - When both are set: card spans the start → end range.
  - When only `scheduled_start_at` is set: card occupies a default
    1-hour block starting at `scheduled_start_at`. (Phase 10
    decision — the underlying column stays nullable; no migration.)
  - When `arrival_window_label` is also set: the card shows the
    label inline ("8–10 AM • Smith driveway").
- Card content: title (truncated), contact name (small),
  status badge tinted via `jobStatusTone` from
  `src/core/jobs/display.ts`. Click → `/admin/jobs/[jobId]`. A
  small **Reschedule / Unschedule** menu sits on the card (see
  §§8–9).

### Outside-hours / outside-grid jobs

- A scheduled job whose `scheduled_start_at` falls **outside 8 AM–6
  PM** within the visible week should still appear. Two
  acceptable implementations (Phase 10C picks one):
  1. **Expanded grid**: the hour band auto-extends to fit
     (e.g. 7 AM if a job starts at 7 AM); the visible 8 AM–6 PM
     band stays visually highlighted (background tint).
  2. **Outside-hours strip**: a small strip above (early-AM) and
     below (late-PM) the main grid lists outside-hours jobs by
     day.
- A scheduled job whose date falls **outside Mon–Fri** of the
  visible week (i.e. Sat / Sun) should appear in a **"Weekend"
  strip** below the main grid for that week. The strip stays empty
  in the common case and adds zero noise.

The goal: **never silently hide a scheduled job.** Visible 8–6 Mon–
Fri is a *visual default*, not a filter.

### Week navigation

- ← previous week / next week → arrows.
- "Today" / "This week" button (resets to the week containing
  `now()` in real workspaces, or
  `simulation_runs.simulated_current_at` in the active save inside
  a simulation workspace — see §14).
- Optional date picker (cheap to add; can be deferred to Phase 10
  polish if it's not free).
- The selected week is reflected in `?week=YYYY-MM-DD` (the Monday
  of the visible week) so navigation is bookmarkable + back-button
  safe.

### What Phase 10 does NOT build

- **Day view.**
- **Month view.**
- **Drag/drop calendar.** (Click-to-schedule modal only — §7.)
- **Google Calendar sync.**
- **Configurable business hours.** (Defaults are constants — §5.)
- **Multi-week / agenda view.**
- **Crew / technician columns.** (No crew assignment in Phase 10 —
  see §11 + §15.)

---

## 5. Business Hours

Business hours are **visual guidance only** in Phase 10.

### Default visible schedule

- Days: **Monday–Friday**.
- Hours: **8 AM–6 PM** (operator's local time).

### Hard rules

- **Do not hard-block** scheduling outside the visible band. The
  operator can schedule a Saturday 7 PM cleanup if they want.
- **Do not** build a business-hours settings page yet.
- **Do not** add a `business_hours` table.

### When this changes

A future "Business Hours Settings" phase will:

- Add a per-business settings row.
- Drive the calendar's visible band from that row.
- Optionally add visual warnings (not hard blocks) when scheduling
  outside hours.

That phase is out of scope here.

---

## 6. Unscheduled Jobs Panel

The schedule page includes an **unscheduled jobs panel** alongside
the calendar.

### Which jobs appear

Include jobs that are:

- `status = 'draft'` **with** `scheduled_start_at IS NULL`, **and**
- `status = 'unscheduled'` **with** `scheduled_start_at IS NULL`.

Exclude:

- `scheduled` / `in_progress` / `completed` / `canceled`.
- Jobs that have a `scheduled_start_at` set but are still in some
  pre-scheduled status (an edge case from Phase 9D — they're
  effectively orphan partial-state rows; ignore in Phase 10).

### Sort order

Most recent first (`created_at DESC`). No filters in Phase 10.

### Per-card content

Each unscheduled job card shows:

- **Title** (`jobs.title`, truncated).
- **Contact** (`contacts.full_name` via existing `listJobs` join).
- **Property/address** (`property.address_line_1, city, state` —
  via the existing join; nullable).
- **Estimated total** (`formatCentsAsDollars(estimated_total_cents)`).
- **Source/manual or quote** (`jobSourceLabel(source)`).
- **Status badge** (Draft / Unscheduled — Phase 9 tones).
- **Schedule button** → opens the schedule modal (§7).
- (Optional) small "Open" link → `/admin/jobs/[jobId]`.

Keep it simple. **No advanced filters** (contact search, total
range, etc.). **No saved views.** **No multi-select.**

### Default limit

Match the existing `listJobs` default of 100 (max 500). The "show
more" affordance is out of scope; if real usage surfaces > 100
unscheduled jobs, Phase 10 polish or a follow-up phase adds it.

### Empty state

Friendly: *"All caught up. Create a job from `/admin/jobs/new` or
convert a quote to add work to the schedule."*

---

## 7. Scheduling Action

Use a **click-to-schedule modal** first. **No drag/drop** in Phase 10.

### Flow

1. Operator clicks **Schedule** on an unscheduled job card.
2. Modal opens. Fields:
   - **Date** (date picker; defaults to the visible week's Monday).
   - **Start time** (time picker; defaults to 9 AM).
   - **End time** (time picker; defaults to 10 AM).
   - **Arrival window label** (free-form text, optional;
     placeholder "8–10 AM").
   - (Read-only context) job title, contact, property.
3. Operator submits.
4. Server action:
   - Combines date + start time → ISO `scheduled_start_at`.
   - Combines date + end time → ISO `scheduled_end_at`.
   - Calls the Phase 9B `updateJobScheduling` helper for the three
     scheduling columns (which already validates end ≥ start).
   - Calls the Phase 9B `updateJobStatus` helper to flip
     `status` → `'scheduled'`.
   - Returns `{ ok: true }` with the new scheduling fields.
5. Modal closes; the page refreshes; the job leaves the
   unscheduled panel and renders as a card on the calendar.

### Why two helpers (not one)

Phase 9B intentionally separated `updateJobScheduling` from
`updateJobStatus` so the detail page editors stay focused. Phase 10
can either:

- **A.** Wrap both in a single Phase 10 server action
  (`scheduleJobAction`) that calls them in order, soft-failing the
  status flip if the scheduling write fails. (Recommended.)
- **B.** Introduce a new combined Phase 10 helper
  (`scheduleJob` in `core/jobs/admin-create.ts`) that does both
  writes inside one helper for clarity.

**Recommended for Phase 10B: A** (compose the existing helpers
inside the action). This keeps the Phase 9B helpers stable and
avoids adding new low-level surface area.

### Conflict warning

The action **also** runs the §11 overlap check before committing.
If overlaps exist, the modal renders a soft warning **with**
the conflicting jobs listed; the operator can **Confirm anyway** or
**Cancel**. The action commits on confirm. (See §11 for why this
is a warning, not a hard block.)

### Do not build

- Drag/drop scheduling.
- Multi-day scheduling.
- "Auto-suggest a slot" pickers.
- Crew picker.

---

## 8. Reschedule Action

Scheduled job cards expose a **Reschedule** action (on the card
itself, on the job detail page, or both).

### Flow

1. Operator clicks **Reschedule** (or clicks the card → opens
   modal preloaded with current values — Phase 10D decides; default
   is a dedicated **Reschedule** menu item on the card).
2. Same modal as §7, **pre-filled** with:
   - `scheduled_start_at` → date + start time
   - `scheduled_end_at` → end time (or end date if multi-day)
   - `arrival_window_label`
3. Operator updates.
4. Server action `rescheduleJobAction`:
   - Calls `updateJobScheduling` only — `status` stays `'scheduled'`.
   - Runs the §11 overlap check excluding *this* job.
5. The job remains `'scheduled'`; the calendar updates.

**No drag/drop rescheduling** in Phase 10. (See §15 Do-Not-Build.)

### Edge case — moving a job that's `in_progress`

Phase 10 default: **disable reschedule + unschedule** on jobs whose
`status` is `in_progress`, `completed`, or `canceled`. The detail
page is the path to recover (operator changes the status back to
`scheduled`, then reschedules from the calendar). This avoids
implicit "scheduled → in_progress → reschedule → scheduled" loops
without a guarded state machine.

---

## 9. Unschedule Action

Scheduled job cards expose an **Unschedule** action.

### Flow

1. Operator clicks **Unschedule** on the card or detail page.
2. Confirm dialog (browser `window.confirm` is fine for Phase 10):
   *"Unschedule this job? It will move back to the Unscheduled
   panel."*
3. Server action `unscheduleJobAction`:
   - Calls `updateJobScheduling` with **all three fields cleared**:
     - `scheduled_start_at = null`
     - `scheduled_end_at = null`
     - `arrival_window_label = null`
   - Calls `updateJobStatus` to flip `status` → `'unscheduled'`.
4. Job leaves the calendar and reappears in the unscheduled panel.

### Recommendation: clear all three scheduling fields

Phase 10 clears `arrival_window_label` along with the timestamps so
the unscheduled panel cards don't stale-display "8–10 AM" against
no actual time. This is consistent with how the operator thinks
about it — "this job is no longer scheduled, the time hint goes
away too." Keeping the label would surface a confusing partial
state.

If a future phase introduces "saved scheduling preferences" or
"requested arrival window" as a separate column on `jobs`, that
phase can preserve it across unscheduling. Until then: clear all
three.

---

## 10. Job Status Rules

### Transitions Phase 10 owns

| Action | Status before | Status after |
|---|---|---|
| **Schedule** (`scheduleJobAction`) | `draft` or `unscheduled` | `scheduled` |
| **Reschedule** (`rescheduleJobAction`) | `scheduled` | `scheduled` (unchanged) |
| **Unschedule** (`unscheduleJobAction`) | `scheduled` | `unscheduled` |

### Transitions Phase 10 does NOT own

- `scheduled → in_progress`: operator uses the existing Phase 9D
  status select on the job detail page.
- `in_progress → completed`: same.
- Anything → `canceled`: same.

### Where each status appears

| Status | Unscheduled panel | Calendar |
|---|---|---|
| `draft` | ✅ (if `scheduled_start_at IS NULL`) | ❌ |
| `unscheduled` | ✅ (if `scheduled_start_at IS NULL`) | ❌ |
| `scheduled` | ❌ | ✅ (placed by start/end) |
| `in_progress` | ❌ | ✅ (visually distinct — see below) |
| `completed` | ❌ | ✅ if inside selected week (visually distinct) |
| `canceled` | ❌ | ❌ |

Notes:

- `in_progress` and `completed` jobs render with a different visual
  treatment (e.g. status-badge `warning` / `success` from Phase 9,
  card shaded or hatched) so the operator can see what's already
  underway / done in the visible week.
- Scheduling-mutation actions on `in_progress` / `completed` /
  `canceled` jobs are **disabled** — see §8 edge case.
- `canceled` is hidden everywhere on the schedule page. The
  operator finds it via the jobs list with the status filter.

### No guarded workflow / state machine

Phase 10 does not introduce a state machine. The existing Phase 9D
status select stays the source of truth for non-scheduling
transitions. Phase 10 wraps the scheduling-specific transitions in
the three actions above, but a free-form status change on the
detail page still works as it did in Phase 9D.

A future Scheduling Polish or Workflow phase can add guards
(e.g. "can't set in_progress without a scheduled_start_at") if
real usage surfaces issues.

---

## 11. Conflict Warnings

Phase 10 includes **basic same-business overlap warnings only.**

### Why warning, not hard block

No crew assignment exists yet. A single business with two crews can
legitimately have two overlapping jobs at the same time. A hard
block would force an artificial workaround. **Warning** lets the
operator confirm anyway and move on.

### Detection rule

Conflicting jobs are jobs **in the same business** that:

- have both `scheduled_start_at` AND `scheduled_end_at` set, AND
- have a status of `'scheduled'` or `'in_progress'`, AND
- have a time range that overlaps the proposed start/end, AND
- are **not** the current job being edited.

Time-range overlap is the standard half-open check:
`existing.start < proposed.end AND existing.end > proposed.start`.

Edge cases:

- Existing job has only `scheduled_start_at` (no end): treat as a
  default 1-hour block starting at `start` for the purposes of
  overlap detection (matches §4's render rule).
- Proposed has only start (operator omitted end in the modal):
  treat as a default 1-hour block starting at start. (Phase 10D
  decides whether to require end in the modal — recommended: yes,
  default it to start + 1h.)

### UX

- Modal validates → before commit, calls a server helper
  (`detectScheduleOverlaps` per §12) → if overlaps exist, modal
  re-renders with a yellow soft-warning banner listing each
  conflict (title link → detail page + the conflicting time range).
- Buttons become **Confirm anyway** + **Cancel**. Confirm
  re-submits with a `confirmOverlap: true` flag the action honours
  (skips the overlap check on the second pass).

### Out of scope

- **Crew-aware** conflict detection (no crew column exists).
- **Route / drive-time** conflict detection.
- **Multi-business** conflict (Phase 10 is per-business only —
  `business_id` scoping is the existing Phase 9B posture).

---

## 12. Schedule Data / Helpers

Document likely Phase 10 helper needs.

### Pure helpers (new, in `src/core/jobs/scheduling.ts`)

Pure (no DB, no `server-only`), unit-tested:

| Helper | Purpose |
|---|---|
| `getWeekRange(reference: Date, options?: { weekStartsOn?: 1 })` | Returns `{ start: Date, end: Date }` for the Mon–Sun window containing `reference`. `weekStartsOn` defaults to Monday. |
| `groupJobsByDay(jobs, weekRange)` | Buckets a list of jobs into a `Map<DayKey, JobRow[]>` for rendering. Days are `YYYY-MM-DD` keys in the workspace's local tz. |
| `calculateCalendarPosition(job, gridSettings)` | Returns `{ dayKey, topPct, heightPct }` (or equivalent) for a card given the visible-hour band. Pure math. |
| `detectScheduleOverlaps(proposed, existingJobs, options)` | Pure overlap detection. Takes proposed `{ start, end, excludeJobId? }` and the list of candidates; returns an array of conflicts. |
| `combineDateAndTimeToISO(dateStr, timeStr, tz)` | Combines a `YYYY-MM-DD` + `HH:MM` from the modal into an ISO string. Mirrors the existing `isoToLocalInput` round-trip in `src/app/admin/jobs/[jobId]/scheduling-form.tsx` — Phase 10 adds the inverse helper. |
| `defaultEndForStart(startISO, defaultDurationMinutes = 60)` | Returns ISO of a default end timestamp when the operator only entered start. |

All testable without any DB. Match the Phase 5/8/9 pattern (pure
math + pure validators stay separate from `admin-data.ts`).

### Server-only data loaders (new, in `src/core/jobs/admin-data.ts`)

| Helper | Purpose |
|---|---|
| `listScheduledJobsForWeek({ businessId, weekStart, weekEnd })` | Returns scheduled + in-progress + completed jobs whose `scheduled_start_at` falls in the [weekStart, weekEnd) range. Reuses the existing `JOB_SELECT` (contact + property joins). |
| `listUnscheduledJobs({ businessId, limit? })` | Returns jobs where `scheduled_start_at IS NULL` AND `status IN ('draft', 'unscheduled')`. Same default-100 cap pattern. |

Adding these alongside the existing `listJobs` / `getJob` /
`listJobsForContact` / `listJobsForQuote` is the smallest possible
surface change. **No** new tables, **no** new joins beyond the
existing contact + property selects.

### Server-only writers — Phase 10's three actions

Three Phase 10 server actions live in `src/app/admin/schedule/actions.ts`
(new file, mirrors `src/app/admin/jobs/actions.ts`):

| Action | Body |
|---|---|
| `scheduleJobAction({ jobId, scheduledStartAt, scheduledEndAt, arrivalWindowLabel, confirmOverlap })` | requireBusiness → run overlap check (unless `confirmOverlap`) → `updateJobScheduling` → `updateJobStatus('scheduled')` → revalidate `/admin/schedule` + `/admin/jobs/[jobId]` + `/admin/jobs`. |
| `rescheduleJobAction({ jobId, scheduledStartAt, scheduledEndAt, arrivalWindowLabel, confirmOverlap })` | Same as schedule but no status flip. |
| `unscheduleJobAction({ jobId })` | requireBusiness → `updateJobScheduling({ start: null, end: null, label: null })` → `updateJobStatus('unscheduled')` → revalidate as above. |

Each action **composes** the Phase 9B `updateJobScheduling` and
`updateJobStatus` helpers — no new low-level write helpers are
introduced. The Phase 9B helpers already enforce
`scheduled_end_at >= scheduled_start_at`, status enum validation,
and business-scoped ownership.

A small soft-fail `createActivity` call per action is recommended
to mirror Phase 9F:

| `activity_type` | When |
|---|---|
| `job.scheduled` | After a successful schedule. Details: `{ scheduled_start_at, scheduled_end_at, arrival_window_label, conflict_count }`. |
| `job.rescheduled` | After a successful reschedule. Details: same. |
| `job.unscheduled` | After a successful unschedule. Details: `{ from_scheduled_start_at, from_scheduled_end_at }`. |

Soft-fail posture matches Phase 9E/9F: a failing `createActivity`
does NOT roll back the scheduling write.

### What Phase 10 reuses from Phase 9B (no changes)

- `updateJobScheduling` — already validates the three fields.
- `updateJobStatus` — already validates the enum.
- `listJobs` — already supports `status` filter.
- `validateSchedulingFields` — already pinned by Phase 9B tests.
- `formatSchedulingTimestamp`, `formatSchedulingRange`,
  `jobStatusLabel`, `jobStatusTone`, `formatCentsAsDollars` —
  reused as-is.

---

## 13. Admin Nav Placement

The current `RAW_NAV` (`src/components/admin/nav-config.ts`) groups
are: Overview, CRM (Contacts → Quotes → Jobs), Tasks, Marketing,
Simulation, Automations, Plugins, Observability, Tools.

### Option A — Top-level "Operations" group (recommended)

Add a new top-level group:

```
Operations
├── Schedule        ← new in Phase 10
```

**Why recommended:**

- Schedule is operationally distinct from CRM browsing — it's the
  *do the work* surface, not the *browse the records* surface.
- A standalone group avoids overloading CRM (already at 3 items:
  Contacts / Quotes / Jobs).
- Phase 11+ Field Execution / Crew / Invoicing / Calendar
  Settings / Routing all have a natural home in this group.
  Creating it now means Phase 10 doesn't force a re-org later.
- The current nav is **not** overloaded — adding one more
  top-level group between Tasks and Marketing keeps the sidebar
  scannable.
- New icon: `calendar` (24×24 outline, joins the existing 16-icon
  set in `src/components/admin/icons.tsx`).

### Option B — Under CRM (fallback)

```
CRM
├── Contacts
├── Quotes
├── Jobs
└── Schedule        ← new in Phase 10
```

**Why fallback:**

- Schedule lives next to Jobs, which is the only entity it
  references.
- One fewer top-level group.
- *Downside:* CRM grows to 4 items; the next likely additions
  (Invoices, Payments) push it to 5–6, which is the cluttered
  threshold.

### Decision for Phase 10

**Recommend Option A** (top-level Operations group). Phase 10C
implementation can revisit if Option A looks heavier in practice
than Option B; either way, the nav test pin
(`src/components/admin/nav-config.test.ts`) gets updated to
include the new entry.

### Nav-active highlight

The Phase 7C `resolveActiveNavHref` longest-prefix rule already
handles `/admin/schedule` correctly — no additional changes.

---

## 14. Simulation Awareness

The schedule page is a core business surface. It **works in both**:

- the real workspace, and
- the simulation workspace.

Because `jobs.business_id` already drives row visibility, no
schedule-page code needs simulation-specific branching beyond what
the existing `<AdminShell>` already provides (workspace switcher +
simulation banner).

### "Now" inside the simulation workspace

The week-nav "Today" button defaults to the **current effective
date**:

- In a real workspace: `new Date()` (operator's local time).
- In a simulation workspace with an active save: the active save's
  `simulation_runs.simulated_current_at`. The resolver pattern
  already exists in the Phase 7 + 8 code (see
  `src/core/simulation/admin-data.ts` and the door-hanger cooldown
  resolver in `src/core/door-hanger/cooldown.ts`).

When no active save exists in a simulation workspace, the schedule
page falls back to `new Date()` and surfaces a small banner: *"No
active simulation save — schedule uses real time."* (Or, simpler:
defer this nicety to Phase 10 polish; the page still works
correctly with real time.)

### What Phase 10 does NOT build for simulation

- **Simulation-driven job scheduling** — no auto-schedule from
  simulated outcomes.
- **Automatic scheduling from simulation outcomes** — Door Hanger
  outcomes don't generate scheduled jobs.
- **Simulated technician behavior** — no work-completion
  simulator.
- **External side effects** — no customer notifications, no
  message-automation calls. The Phase 6D GHL guardrail continues
  to short-circuit messaging in simulation, but Phase 10 doesn't
  reach for the messaging engine at all (matching Phase 9).
- **A separate simulation schedule view** — the schedule page is
  the same in both workspaces.

---

## 15. Do Not Build in Phase 10

Pinned for clarity. Phase 10 must not build any of:

- **Drag/drop scheduling.** Click-to-schedule modal only (§7).
- **Full scheduling calendar system** (only the Phase 10 week
  view; no agenda / planner / Gantt / timeline view).
- **Day view.** **Month view.** **Year view.** **Agenda view.**
- **Crew / technician assignment.** No crew columns, no
  `assignment` table, no `worker` table, no per-job crew picker.
- **Technician mobile app** or any field-execution surface.
- **Crew capacity** / scheduling limits per crew.
- **Conflict hard-blocking.** Warnings only (§11).
- **Configurable business hours.** Constants only (§5).
- **Route optimization** / drive-time calculation across jobs.
- **Drive time** between jobs.
- **Google Calendar sync** (or any external calendar sync —
  iCal, Outlook, Apple Calendar, etc.).
- **Customer reminders / texts / emails** on
  schedule / reschedule / unschedule.
- **Message-automation outcomes** from job-scheduling events.
- **Recurring jobs / recurring visits** / cadence rules / rrule.
- **Visits / appointments table.** Phase 10 keeps using the
  Phase 9 columns on `jobs` (§2).
- **Multi-day jobs as multiple rows** (jobs can span days via
  end > start; no row splitting).
- **Invoices** / invoice line items.
- **Payments** / deposits / refunds / payment processor
  integration.
- **Quote acceptance / payment portal.**
- **Customer-facing schedule views** / customer accounts.
- **Public `/q` changes.**
- **Simulation-driven scheduling** (no Door Hanger →
  scheduled-job path).
- **AI / context-engine expansion.** No model imports.
- **Plugin builder / plugin marketplace.**
- **Data import / export.**
- **Edit / delete / archive flows on jobs** beyond the three
  scheduling actions (schedule / reschedule / unschedule).
- **A new database table** (no `visits`, no `appointments`, no
  `business_hours`, no `crew`, no migration).
- **A new database column on `jobs`** beyond what Phase 9B
  already added. Phase 10 reuses the existing three scheduling
  columns + the existing status column.

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 Do-Not-Build lists
remain in force. If a Phase 10 task touches any of the above,
**stop and ask first.**

---

## 16. Recommended Implementation Plan

Phase 10 splits into five sub-phases. Each subsequent sub-phase is
gated on the previous one passing review.

### Phase 10A — Docs only ✅ (this file)

- Source-of-truth doc (this file).
- Phase 10 pointer in `CLAUDE.md` and `README.md`.
- **No code, no schema, no business-logic change.**

### Phase 10B — Scheduling helpers / server foundation (no UI)

- Pure helpers (`src/core/jobs/scheduling.ts`):
  `getWeekRange`, `groupJobsByDay`, `calculateCalendarPosition`,
  `detectScheduleOverlaps`, `combineDateAndTimeToISO`,
  `defaultEndForStart`.
- Server-only loaders added to `src/core/jobs/admin-data.ts`:
  `listScheduledJobsForWeek`, `listUnscheduledJobs`.
- Pure unit tests for every new helper (week-range math, day
  grouping including the Saturday/Sunday + outside-hours edge
  cases, calendar-position math, overlap detection covering same-
  start, same-end, contained, exact-edge cases).
- **No new schema. No new tables. No UI. No new server actions.**

### Phase 10C — `/admin/schedule` read-only week view

- Add nav entry (§13 — top-level Operations group recommended).
- Add `calendar` icon to `src/components/admin/icons.tsx`.
- Update `src/components/admin/nav-config.test.ts` to pin the new
  group/entry.
- `/admin/schedule` page (Server Component): loads the visible
  week's scheduled jobs + the unscheduled panel jobs in parallel,
  renders the week grid + the panel.
- Week navigation (← / Today / →) via `?week=YYYY-MM-DD`.
- Card click → job detail.
- **No mutations yet.** No modals open.

### Phase 10D — Schedule / Reschedule / Unschedule actions + modal

- `src/app/admin/schedule/actions.ts`: three server actions per
  §12, each composed of the existing Phase 9B helpers + a soft-fail
  `createActivity` row.
- `<ScheduleJobModal>` client component — opened by the Schedule
  button on unscheduled cards and the Reschedule button on
  scheduled cards.
- Confirm-overlap path for the §11 warning.
- Unschedule confirm + action.
- Status / scheduling-field updates on every successful action.

### Phase 10E — Polish + QA report

- Outside-hours / weekend strip implementation (§4) if not
  already in Phase 10C.
- Simulation `simulated_current_at` resolver wiring for the
  "Today" button (§14) if not already in Phase 10C.
- `docs/PHASE_10_QA_REPORT.md` — Definition-of-Done checklist,
  Do-Not-Build audit, regression checks, security/schema review.

Adjust the split if implementation review surfaces a safer order.

---

## 17. Success Definition

### Phase 10A is successful when

- Source-of-truth doc exists. ✅ (this file).
- Week-calendar decision is documented. ✅ (§§4–5).
- Click-to-schedule modal decision is documented. ✅ (§7).
- No-drag/drop decision is documented. ✅ (§§7, 15).
- No-crew-assignment decision is documented. ✅ (§§11, 15).
- Visual-business-hours-only decision is documented. ✅ (§5).
- Overlap-warning decision is documented. ✅ (§11).
- Implementation plan is documented. ✅ (§16).
- Do-Not-Build list is documented. ✅ (§15).
- `CLAUDE.md` carries a Phase 10 pointer paragraph.
- `README.md` Status section names Phase 10 and links to this
  doc.
- **No app code, no business logic, no database schema changes**
  in Phase 10A.

### Phase 10 close is successful when

- `/admin/schedule` exists.
- Week calendar view exists.
- Unscheduled jobs panel exists.
- Scheduled job cards appear at the correct day/time.
- Operator can schedule a job from the unscheduled panel.
- Operator can reschedule a scheduled job.
- Operator can unschedule a scheduled job.
- Overlap warning appears when relevant but does not block.
- Jobs on the calendar link to their detail page.
- **No crew / calendar-sync / customer notifications / invoices /
  payments built.**
- **No new schema** beyond what Phase 9B already shipped.
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass.
- `docs/PHASE_10_QA_REPORT.md` exists and signs off the
  Definition-of-Done + Do-Not-Build audit.

---

## 18. Phase 10A Definition of Done

- [x] Source-of-truth doc exists (this file).
- [ ] `CLAUDE.md` carries a Phase 10 pointer paragraph.
- [ ] `README.md` Status section names Phase 10 and links to this
      doc.
- [x] No app code changed.
- [x] No business logic changed.
- [x] No database schema changed.
- [x] No new migrations or seed rows.

Phase 10A ends at docs only. Phase 10B is the first step that
touches code, and it only ships after this doc is reviewed and
approved.
