# Phase 10 QA Report

**Date:** 2026-06-02
**Step:** Phase 10E — Phase 10 closing QA pass + Definition of Done.
**Audited against:** `docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`
(Appendix A — Phase 10B helpers + loaders, Appendix B — Phase 10C
`/admin/schedule` read-only week view, Appendix C — Phase 10D
schedule / reschedule / unschedule actions + modal + overlap
warning + the compact-card details-modal polish embedded in that
appendix).

This pass closes out Phase 10 (Job Scheduling Foundation). Phase
10 deliberately **reuses the Phase 9B `jobs` scheduling columns**
(`scheduled_start_at`, `scheduled_end_at`, `arrival_window_label`,
`status`) and adds **no migration, no new table, no new column**.
The full scheduling calendar, crew/technician assignment,
recurring jobs, invoices, payments, customer notifications,
external calendar sync, and route optimization all remain future
foundation phases.

---

## 1. Commands run

| Command            | Result   | Notes                                                   |
| ------------------ | -------- | ------------------------------------------------------- |
| `npx tsc --noEmit` | **pass** | 0 errors.                                               |
| `npm run test`     | **pass** | **709 / 709** tests across 62 test files.               |
| `npm run lint`     | **pass** | No ESLint warnings or errors.                           |
| `npm run build`    | **pass** | All routes compile green; `/admin/schedule` at 4.5 kB, `/admin/jobs/[jobId]` at 4.27 kB, `/admin/quotes/[quoteId]` at 813 B, `/q` unchanged at 6.54 kB. |

Migrations directory verified — last migration remains
`20260603120000_phase_9_jobs.sql`. **Phase 10 added zero
migrations.**

---

## 2. What shipped in Phase 10 (recap)

- **Phase 10A** — source-of-truth doc
  (`docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`) + Phase 10 pointer
  paragraphs in `CLAUDE.md` and `README.md`. **Docs only.**
- **Phase 10B** — pure scheduling helpers
  (`src/core/jobs/scheduling.ts`): `getWeekRange`, `formatWeekKey`,
  `parseWeekKey`, `enumerateWeekDays`, `groupJobsByDay`,
  `calculateCalendarPosition`, `detectScheduleOverlaps`,
  `combineDateAndTimeToISO`, `defaultEndForStart`, plus the
  pinned visible-band + default-duration constants. Two
  server-only loaders added to `src/core/jobs/admin-data.ts`:
  `listScheduledJobsForWeek` + `listUnscheduledJobs`. 37 pure
  unit tests.
- **Phase 10C** — new top-level **Operations** nav group with a
  `Schedule` entry → `/admin/schedule`, new `calendar` icon, the
  Server-Component schedule page (week grid Mon–Fri 8 AM–6 PM,
  outside-hours + weekend lists, unscheduled-jobs panel), and the
  `?week=YYYY-MM-DD` week navigation. Effective today resolved via
  the existing Phase 6D `resolveAdminShellContext`
  (`simulationBanner.activeRun.simulatedCurrentAt` in simulation
  workspaces with an active save, otherwise `new Date()`). 4 pure
  `classifyScheduledJobs` tests + 2 new nav tests.
- **Phase 10D** — three server actions (`scheduleJobAction`,
  `rescheduleJobAction`, `unscheduleJobAction`) wrapped around the
  existing Phase 9B `updateJobScheduling` + `updateJobStatus`
  helpers, plus a same-business overlap pre-check (warning only,
  never a hard block), the shared
  `ScheduleJobModal` client component, per-card action wrappers,
  and a server-only `listScheduleOverlapCandidates` loader. Three
  soft-fail activity types: `job.scheduled` / `job.rescheduled` /
  `job.unscheduled`. 8 + 9 new pure tests
  (`parseScheduleFormFields` + modal helpers). **Plus the
  compact-card / details-modal polish:** the calendar grid card
  is now a compact click-trigger that opens a full details modal;
  Reschedule from the details opens the existing schedule modal
  in reschedule mode; Unschedule confirms + runs the action. Fixed
  short-card overflow that was clipping inline action buttons.
- **Phase 10E** (this step) — closing QA pass + this report. No
  app code, no schema, no business-logic changes in this step.

---

## 3. Phase 10 Definition of Done — checklist

Drawn from §17 of the Phase 10 doc + each appendix.

| Done criterion | Status | Notes |
|---|---|---|
| Source-of-truth doc exists | ✅ | Phase 10 doc + Appendices A / B / C. |
| `/admin/schedule` exists | ✅ | Phase 10C. |
| Week calendar view exists | ✅ | Mon–Fri, 8 AM–6 PM visible band, hour gridlines. |
| Unscheduled jobs panel exists | ✅ | Right-column sidebar; `draft` / `unscheduled` with null `scheduled_start_at`. |
| Scheduled job cards appear | ✅ | Compact card → opens details modal (Phase 10D polish). |
| Operator can schedule a job | ✅ | `scheduleJobAction` + `<ScheduleJobModal mode="schedule" />`. |
| Operator can reschedule a scheduled job | ✅ | `rescheduleJobAction` + reschedule mode of the same modal. |
| Operator can unschedule a scheduled job | ✅ | `unscheduleJobAction` from the details modal (window.confirm). |
| Overlap warning appears when relevant but does not block | ✅ | `OVERLAP_WARNING` result + `confirmOverlap: true` re-submit path. |
| Jobs link to job detail | ✅ | Details modal **Open job** link + outside-hours/weekend row title links. |
| No crew / calendar-sync / customer notifications / invoices / payments built | ✅ | Do-Not-Build audit §9. |
| No new schema beyond Phase 9B | ✅ | Migrations directory verified §1; no new tables / columns. |
| `tsc / test / lint / build` pass clean | ✅ | See §1. |
| `docs/PHASE_10_QA_REPORT.md` exists | ✅ | This file. |
| `CLAUDE.md` Phase 10 pointer | ✅ | Added in Phase 10A. |
| `README.md` Phase 10 status block | ✅ | Added in Phase 10A. |

Phase 1+2+3+4+5+6+7+8+9 Definition-of-Done items remain in force.

---

## 4. Schema / no-schema verification

| Check | Result |
|---|---|
| Phase 10 added any SQL migrations | ✅ **no** — most recent migration is `20260603120000_phase_9_jobs.sql` (Phase 9B). |
| Phase 10 added new tables | ✅ **no** — only `jobs` and `job_line_items` from Phase 9B; nothing new. |
| Phase 10 added new columns on `jobs` | ✅ **no** — scheduling uses the existing four Phase 9B columns. |
| Phase 10 uses existing scheduling fields | ✅ — `scheduled_start_at`, `scheduled_end_at`, `arrival_window_label`, `status`. |
| `.env.local` gitignored | ✅ |
| No env file tracked in git | ✅ |
| Secret-shaped literals in tracked source | ✅ none |
| Service-role client confined to `import "server-only"` modules | ✅ — `admin-data.ts`, `admin-create.ts`, `actions.ts` (the action file is `"use server"`, the loaders it calls are `server-only`). |
| New external API calls from Phase 10 code | ✅ none — schedule is pure DB reads + writes |

---

## 5. Helper / loader verification

| Check | Result |
|---|---|
| `getWeekRange` returns Monday-start, local-time week | ✅ — 6 cases in `scheduling.test.ts` (Mon/Tue/Wed/Sat/Sun refs + ISO string + undefined). |
| `formatWeekKey` / `parseWeekKey` round-trip | ✅ — 2 cases including overflow rejection (`2026-02-31` → null) and malformed input. |
| `enumerateWeekDays` returns 7 sequential local-midnight dates | ✅ |
| `groupJobsByDay` buckets weekday + weekend jobs | ✅ — 3 cases including upper-bound exclusivity (Monday 00:00 next week → excluded). |
| `calculateCalendarPosition` places jobs inside the visible band | ✅ — visible / before / after / partial / nonsensical-grid / missing-start cases pinned. |
| Missing `scheduled_end_at` uses default 60-min duration | ✅ — pinned in both `calculateCalendarPosition` and `detectScheduleOverlaps` tests. |
| `detectScheduleOverlaps` half-open math | ✅ — start/end/contained/exact-edge cases pinned; exact-edge (other end == proposed start) explicitly excluded. |
| `detectScheduleOverlaps` ignores completed/canceled/draft/unscheduled | ✅ — explicit "ignores …" test exercises all four. |
| `detectScheduleOverlaps` includes `in_progress` | ✅ — dedicated case. |
| `excludeJobId` excludes self | ✅ |
| Missing existing OR proposed end → 60 min default | ✅ — both halves pinned in dedicated cases. |
| `combineDateAndTimeToISO` round-trip + rejects malformed/overflow | ✅ — 9 cases including `25:00`, `09:99`, `2026-02-31`, null/empty/garbage. |
| `defaultEndForStart` honors custom + invalid durations | ✅ — 4 cases. |
| `parseScheduleFormFields` (Phase 10D pure parser) | ✅ — 8 cases including default-end fallback, end-before-start, invalid time, overflow date, arrival trim + clamp. |
| `computeScheduleDefaults` / `extractDateFromIso` / `extractTimeFromIso` | ✅ — 9 cases including fallback + pre-fill + missing-end fallback + null-input handling. |
| `isJobSchedulableStatus` / `isJobReschedulableStatus` / `isJobUnschedulableStatus` | ✅ — exhaustive across all 6 statuses. |
| `classifyScheduledJobs` (visible / outside-hours / weekend) | ✅ — 4 cases including Sat/Sun routing and null-start skip. |
| `listScheduledJobsForWeek` is business-scoped + status-filtered | ✅ — Code review: `.eq("business_id", ...)`, `.in("status", ["scheduled", "in_progress", "completed"])`, half-open window `[weekStart, weekEnd)`. Returns `[]` on missing inputs / DB error. |
| `listUnscheduledJobs` is business-scoped + status-filtered | ✅ — `.eq("business_id", ...)`, `.is("scheduled_start_at", null)`, `.in("status", ["draft", "unscheduled"])`. |
| `listScheduleOverlapCandidates` (Phase 10D) is business-scoped | ✅ — `.eq("business_id", ...)`, `.in("status", ["scheduled", "in_progress"])`, `.gte / .lte` on `scheduled_start_at` within `[fromIso, toIso]`. |

Total pure scheduling tests: **58** across 4 files (37 + 4 + 8 + 9
= scheduling + schedule-views + parse-schedule-form +
modal-helpers).

---

## 6. Schedule page + nav verification

### 6.1 Nav

| Check | Result |
|---|---|
| **Operations** nav group exists between Tasks and Marketing | ✅ — pinned by `nav-config.test.ts` group-order test. |
| Operations group contains exactly `Schedule → /admin/schedule` | ✅ — pinned by dedicated test. |
| `calendar` icon registered in the admin icon set | ✅ |
| `resolveActiveNavHref` highlights Schedule on `/admin/schedule` | ✅ — longest-prefix rule from Phase 7C covers this without additional code. |

### 6.2 `/admin/schedule` page

| Check | Result |
|---|---|
| Page loads when active business is set | ✅ |
| `?week=YYYY-MM-DD` navigates the visible week | ✅ — `parseWeekKey` parses; invalid / missing → falls back to today's week. |
| Prev / Today / Next links route via the week query param | ✅ — `WeekNav` component. |
| Effective today uses simulation active-save `simulated_current_at` when present | ✅ — pulled from `shell.simulationBanner.activeRun.simulatedCurrentAt`. |
| Simulation workspace without active save shows the soft fallback notice | ✅ — yellow "No active simulation save — schedule uses real time." banner. |
| Week calendar renders Mon–Fri 8 AM–6 PM visible band | ✅ — `SCHEDULE_VISIBLE_DAYS` + `SCHEDULE_VISIBLE_START_HOUR=8` + `SCHEDULE_VISIBLE_END_HOUR=18` constants. |
| Scheduled jobs render on the correct day/time | ✅ — `calculateCalendarPosition` drives `top` / `height` on each card. |
| Outside-hours scheduled jobs surface in the outside-hours list | ✅ — `classifyScheduledJobs` routes; `OutsideHoursList` renders. |
| Weekend scheduled jobs surface in the weekend list | ✅ — same. |
| Unscheduled jobs panel renders | ✅ — `UnscheduledJobsPanel`. |
| `draft` / `unscheduled` (with null start) appear in the panel | ✅ — `listUnscheduledJobs` filter. |
| Empty states for week + panel | ✅ — distinct copy for the calendar-empty and panel-empty paths. |
| Workspace switcher still works | ✅ — `<AdminShell>` slot unchanged. |
| Simulation Mode banner still works | ✅ — same. |

---

## 7. Scheduling action verification

### 7.1 `scheduleJobAction`

| Step | Status |
|---|---|
| `requireBusiness` guard | ✅ |
| Validates form via `parseScheduleFormFields` | ✅ |
| Verifies job belongs to active business via `getJob` | ✅ |
| Rejects non-`draft`/`unscheduled` statuses with `INVALID_STATUS` | ✅ — explicit guard at `actions.ts:172`. |
| Runs same-business overlap pre-check (`listScheduleOverlapCandidates` + `detectScheduleOverlaps`) | ✅ — ±48h window around proposed range. |
| Returns `OVERLAP_WARNING` with `conflicts[]` when conflicts exist + `confirmOverlap !== true` | ✅ |
| `confirmOverlap=true` proceeds and records `conflict_count` in the activity row | ✅ |
| Sets all three scheduling fields via `updateJobScheduling` | ✅ |
| Flips status to `scheduled` via `updateJobStatus` | ✅ |
| Revalidates `/admin/schedule`, `/admin/jobs`, `/admin/jobs/[jobId]` | ✅ — `revalidateAfterScheduleMutation`. |
| Soft-fail `job.scheduled` activity row | ✅ — `void createActivity({...})`. |

### 7.2 `rescheduleJobAction`

| Step | Status |
|---|---|
| Rejects non-`scheduled` statuses with `INVALID_STATUS` | ✅ — guard at `actions.ts:297`. |
| Overlap detection excludes current job | ✅ — `excludeJobId: input.jobId` passed to `runOverlapCheck`. |
| Updates scheduling fields via `updateJobScheduling` | ✅ |
| Status stays `scheduled` (no status flip) | ✅ |
| Captures `previous` snapshot of old scheduling fields | ✅ — used in activity details. |
| Soft-fail `job.rescheduled` activity row | ✅ |

### 7.3 `unscheduleJobAction`

| Step | Status |
|---|---|
| Rejects non-`scheduled` statuses with `INVALID_STATUS` | ✅ — guard at `actions.ts:401`. |
| Clears `scheduled_start_at` | ✅ |
| Clears `scheduled_end_at` | ✅ |
| Clears `arrival_window_label` | ✅ |
| Flips status to `unscheduled` | ✅ |
| Captures `previous` snapshot | ✅ |
| Soft-fail `job.unscheduled` activity row | ✅ |
| No overlap check (irrelevant on the unschedule path) | ✅ |

### 7.4 Cross-business / ownership

| Check | Result |
|---|---|
| `getJob` re-verifies `business_id` before reading | ✅ — Phase 9B guarantee. |
| `updateJobScheduling` / `updateJobStatus` enforce `business_id` in the `.eq()` filter | ✅ — Phase 9B helpers. |
| Overlap loader filters by `business_id` | ✅ |

---

## 8. Overlap warning verification

| Check | Result |
|---|---|
| Detects overlapping jobs before write | ✅ — pre-check runs before any DB mutation. |
| Pre-check uses ±48-hour buffer around proposed range | ✅ — `OVERLAP_WINDOW_MS = 48 * 60 * 60 * 1000`. |
| Half-open math (`existing.start < proposed.end && existing.end > proposed.start`) | ✅ — pure `detectScheduleOverlaps`. |
| Status filter: only `scheduled` + `in_progress` candidates | ✅ — pinned by 4-status "ignores …" test. |
| Excludes the current job | ✅ — `excludeJobId` honored. |
| Conflict DTO carries title + status + contact name + range + link | ✅ — `ScheduleConflictDTO`. |
| Warning is NOT a hard block | ✅ — operator can `Confirm anyway`. |
| Confirm-anyway path writes successfully | ✅ — same action, `confirmOverlap: true`. |
| No crew-aware conflict detection | ✅ — none introduced; doc §11 pins "warning, not hard block" because no crew column exists. |

---

## 9. Modal / UI verification

### 9.1 Schedule modal (`<ScheduleJobModal mode="schedule" />`)

| Step | Status |
|---|---|
| Opens from the Schedule button on unscheduled cards | ✅ — `<ScheduleAction />`. |
| Defaults: date = `fallbackScheduleDate`, start = 09:00, end = 10:00 | ✅ — `computeScheduleDefaults`. |
| `fallbackScheduleDate` = today's local date when visible week = today's week, otherwise visible Monday | ✅ — page-level computation. |
| Submit triggers `scheduleJobAction` | ✅ |
| Overlap warning renders the yellow conflict banner | ✅ |
| **Confirm anyway** re-submits with `confirmOverlap: true` | ✅ |
| Field edit clears the banner so the next submit re-runs the check | ✅ — `clearConflicts()` on every change handler. |
| On success: closes + `router.refresh()` | ✅ |
| Backdrop click + Cancel close cleanly | ✅ |
| Pending state disables both submit + cancel | ✅ |

### 9.2 Compact scheduled-card details modal (Phase 10D polish)

| Step | Status |
|---|---|
| Calendar card is compact: status badge + title + truncated time | ✅ — `<ScheduledCardWithDetails />`. |
| Short cards (30–60 min) no longer cut off action buttons | ✅ — actions moved into the details modal entirely. |
| Click card → opens details modal | ✅ — button trigger with `aria-label`. |
| Details modal shows status + source badges, title, contact, property, scheduled range, arrival window, estimated total | ✅ |
| **Open job** link routes to `/admin/jobs/[jobId]` | ✅ |
| **Reschedule** button visible only for `scheduled` status | ✅ — `isJobReschedulableStatus` gate. |
| **Unschedule** button visible only for `scheduled` status | ✅ — `isJobUnschedulableStatus` gate. |
| `in_progress` / `completed` / `canceled` cards open the details modal in read-only mode (no mutation buttons) | ✅ — `null` callbacks omit the buttons. |
| Reschedule from details closes details + opens schedule modal in reschedule mode | ✅ — state machine `view: closed / details / reschedule` ensures one modal at a time. |
| Unschedule uses `window.confirm` + `unscheduleJobAction` + `router.refresh()` | ✅ |

### 9.3 Outside-hours / weekend rows

| Step | Status |
|---|---|
| Each row links the title to the job detail | ✅ |
| Scheduled status rows show inline Reschedule + Unschedule (row has room) | ✅ — `<RescheduleAction />` + `<UnscheduleAction />`. |
| Non-scheduled status rows render read-only | ✅ |

### 9.4 Unscheduled panel

| Step | Status |
|---|---|
| Each card surfaces the working Schedule button | ✅ — `<ScheduleAction />` (no longer a disabled placeholder). |
| Card title links to job detail | ✅ |
| Empty state copy: "All caught up. Create a job or convert a quote …" | ✅ |

---

## 10. Activity behavior

Three soft-fail activity types ship — all via the existing Phase 1
`createActivity` helper, all non-blocking on the underlying
mutation:

| `activity_type` | Source | Details payload |
|---|---|---|
| `job.scheduled` | `scheduleJobAction` | `scheduled_start_at`, `scheduled_end_at`, `arrival_window_label`, `conflict_count`, `confirmed_overlap`. |
| `job.rescheduled` | `rescheduleJobAction` | Same + `previous` snapshot (old `scheduled_start_at` / `scheduled_end_at` / `arrival_window_label`). |
| `job.unscheduled` | `unscheduleJobAction` | `previous` snapshot of the old scheduling fields. |

Activity verification:

| Check | Result |
|---|---|
| Activity insert failure does NOT roll back scheduling | ✅ — `void createActivity({...})` posture. |
| No `sendInternalSmsNotification` / `notification_logs` / `sendSms` / `sendEmail` calls anywhere in `src/app/admin/schedule` or `src/core/jobs` | ✅ — `grep` returned zero matches. |
| Phase 6D GHL guardrail not reached from any Phase 10 path | ✅ — no message-engine imports in Phase 10 code. |
| No customer notifications on schedule events | ✅ |

---

## 11. Do-Not-Build audit

Audited against §15 of the Phase 10 doc + each appendix's "What
did NOT ship" section. Every item is confirmed **NOT** present in
Phase 10 code.

| Forbidden item | Status | How confirmed |
|---|---|---|
| Drag/drop scheduling | ✅ not built | No drag handlers, no `react-dnd` / `dnd-kit` / HTML5 drag APIs anywhere in `src/app/admin/schedule`. Click-to-modal only. |
| Day / month / agenda views | ✅ not built | Only the Mon–Fri week grid exists. |
| Crew / technician assignment | ✅ not built | No `crew` / `technician` / `assignment` tables, columns, or modules. |
| Technician mobile app | ✅ not built | Web only. |
| Crew capacity | ✅ not built | No capacity columns or modules. |
| Hard conflict blocking | ✅ not built | `OVERLAP_WARNING` returns a result the operator can override via `confirmOverlap: true`. |
| Configurable business hours | ✅ not built | `SCHEDULE_VISIBLE_START_HOUR` / `_END_HOUR` are TS constants, not settings. |
| Route optimization | ✅ not built | No optimization helpers or modules. |
| Drive time | ✅ not built | No drive-time calculations. |
| Google Calendar sync | ✅ not built | No Google / iCal / Outlook / external calendar imports. |
| Customer reminders / texts / emails | ✅ not built | No notification calls (audited via grep §10). |
| Message-automation outcomes | ✅ not built | Phase 3 engine untouched. |
| Recurring jobs | ✅ not built | No `recurrence` / `rrule` / `cadence` code. |
| Visits / appointments table | ✅ not built | Only Phase 9B `jobs` + `job_line_items` exist. |
| Invoices | ✅ not built | No `invoices` table or module. |
| Payments | ✅ not built | No payment / processor imports. |
| Quote acceptance / payment portal | ✅ not built | No customer-facing schedule views. |
| Customer-facing schedule views / accounts | ✅ not built | Schedule is admin-only. |
| Public `/q` changes | ✅ not built | `/q` unchanged at 6.54 kB (matches Phase 9 close). |
| Simulation-driven scheduling | ✅ not built | No simulation → schedule path. |
| AI / context-engine expansion | ✅ not built | No model imports. |
| Plugin builder / marketplace | ✅ not built | Plugin registry unchanged. |
| Data import / export | ✅ not built | No importer / exporter code. |
| **New database table** | ✅ not built | Migrations directory verified; last migration is Phase 9B. |
| **New database column** | ✅ not built | Schema verified; scheduling uses the existing Phase 9B columns. |
| New SQL migration | ✅ not added | Same as above. |
| New low-level DB write helpers | ✅ not added | Actions compose Phase 9B `updateJobScheduling` + `updateJobStatus`. |
| Edit / delete / archive beyond the three scheduling actions | ✅ not built | Only schedule / reschedule / unschedule exist on the schedule page. |

The Phase 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 Do-Not-Build lists
remain in force; nothing in Phase 10 touched any of those items.

---

## 12. Regression checks

| Surface | Status |
|---|---|
| `/admin/schedule` loads | ✅ (4.5 kB) |
| `/admin/jobs` loads | ✅ (214 B) |
| `/admin/jobs/[jobId]` loads | ✅ (4.27 kB) |
| `/admin/jobs/new` loads | ✅ (3.47 kB) |
| `/admin/contacts` loads | ✅ (1.31 kB) |
| `/admin/contacts/[contactId]` loads | ✅ (1.89 kB) |
| `/admin/quotes` loads | ✅ (1.76 kB) |
| `/admin/quotes/[quoteId]` loads | ✅ (813 B) |
| `/admin/marketing/door-hangers` loads | ✅ (7.56 kB) |
| `/admin/marketing/door-hangers/routes` loads | ✅ (5.55 kB) |
| `/admin/simulation` loads | ✅ (1.66 kB) |
| `/admin/simulation/play` loads | ✅ (3.41 kB) |
| `/admin/message-automations` loads | ✅ (1.45 kB) |
| `/admin/tasks` loads | ✅ (915 B) |
| `/q` loads | ✅ (6.54 kB — unchanged from Phase 9 close) |
| Workspace switcher still works | ✅ — Phase 6D code untouched. |
| Simulation Mode banner still works | ✅ — Phase 6D code untouched. |
| Nav active-state highlights one item per page | ✅ — Phase 7C `resolveActiveNavHref` covers `/admin/schedule`. |

---

## 13. Known issues / accepted limitations

None of these block Phase 10 sign-off.

1. **No drag/drop scheduling.** Click-to-modal only (per Phase 10
   doc §7 + Do-Not-Build §15). A future "Scheduling Polish" phase
   could add it on top.
2. **Compact calendar cards open a details modal instead of
   showing inline actions.** The Phase 10D polish fix: short
   (≤ 1-hour) cards were clipping inline Reschedule + Unschedule
   buttons, hurting the calendar view. Trade-off: one extra click
   to reach a mutation, but the calendar stays readable for short
   jobs. Outside-hours / weekend list rows keep their inline
   actions because they have horizontal room.
3. **Overlap warning is workspace-scoped, not crew-scoped.** No
   crew assignment exists yet, so two overlapping `scheduled` jobs
   may be legitimate. The warning surfaces the conflict and the
   operator decides. A future Crew Assignment phase will refine
   this into per-crew checks.
4. **Visible band 8 AM–6 PM is a constant.** No per-business
   business-hours setting in Phase 10. Operator can still schedule
   outside the band; the visible band is a *render default*, not a
   filter.
5. **No automated browser tests** for the schedule modal flow.
   The build + lint + 709-test suite covers pure helpers + the
   eligibility logic + the loaders; modal-level confirmation
   (click Schedule → fill → submit → see card on calendar) was
   done manually during Phase 10D + 10D-polish rollout.
6. **No automated integration test for the three activity writes.**
   The `createActivity` helper is exercised via the soft-fail
   `void` pattern; failures are silent by design. Verifying that
   rows actually land is a manual
   `select * from activities where activity_type like 'job.%scheduled'`
   check post-action.
7. **Conflict pre-check loads ±48h of candidates.** Generous
   enough to catch long jobs but trims the read for the common
   case. If a workspace generates more than `LIST_MAX_LIMIT=500`
   candidates in that 96-hour window, results are capped — that
   threshold is well beyond realistic single-business operation.
8. **`window.confirm` for unschedule.** Per the Phase 10D brief.
   A custom confirm dialog could land in a future polish step if
   real usage surfaces friction.
9. **`router.refresh()` re-fetches everything on success.** No
   optimistic updates. Trade-off chosen to keep the modal
   lifecycle simple; the round-trip is small.

---

## 14. Readiness verdict

**Phase 10 is ready to close.**

- All 4 quality gates pass (`tsc`, `test` 709 / 709, `lint`,
  `build`).
- All Definition-of-Done criteria pass.
- Schema verification confirms **zero migrations / tables /
  columns** added in Phase 10 — scheduling reuses the Phase 9B
  `jobs` columns.
- The Do-Not-Build audit is clean — no drag/drop, no crew
  assignment, no route optimization, no Google Calendar sync, no
  customer notifications, no message-automation outcomes, no
  recurring jobs, no visits/appointments table, no invoices/
  payments, no simulation-driven scheduling, no public `/q`
  changes, no AI/context expansion, no plugin marketplace, no
  data import/export.
- Three soft-fail activity rows ship for every scheduling event;
  failure is non-blocking; no message-engine calls are made.
- The compact-card / details-modal polish during Phase 10D fixed
  the only UI regression observed (short cards clipping inline
  action buttons).
- Phase 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 regression checks pass.
- Known issues are minor and documented.

### Phase 10 in one paragraph

Phase 10 ships a Jobber-style job scheduling foundation as a
single new admin surface (`/admin/schedule`) that **reuses the
Phase 9B `jobs.scheduled_*` columns** — no new migration, no new
table, no new column. The week calendar (Mon–Fri, 8 AM–6 PM
visible band, outside-hours + weekend lists below, unscheduled
panel beside) is read-only; three server actions
(`scheduleJobAction` / `rescheduleJobAction` / `unscheduleJobAction`)
wrap the existing Phase 9B `updateJobScheduling` +
`updateJobStatus` helpers with same-business overlap pre-checks
(warning, not a hard block) and soft-fail activity rows. The
short-card details-modal polish makes the calendar readable at any
job duration. Crew assignment, customer notifications, recurring
jobs, invoices, payments, route optimization, and external
calendar sync are all explicit future foundation phases.

**Future foundation phases that build on Phase 10 (exact naming
TBD):**

- **Crew / Technician Assignment** — per-crew columns on `jobs`
  or a dedicated `assignments` table, crew-aware conflict
  detection, optional crew capacity rules.
- **Recurring Jobs / Visits** — a `visits` / `appointments` table
  that decouples "when the work happens" from "the work order
  itself"; recurring agreements; per-visit completion state.
- **Customer Schedule Notifications** — wire schedule events
  through the Phase 3 message-automation engine (currently the
  Phase 6D GHL guardrail is not even reached from any Phase 10
  module).
- **Drag/drop + day view + month view + configurable business
  hours** — schedule UI polish.
- **Route Optimization / Drive Time** — overlapping with the
  Phase 8 Door Hanger field surface; eventually a single shared
  route-optimization layer for jobs + door-hanger routes.
- **External Calendar Sync** — Google Calendar / iCal / Outlook
  integration if real operators demand it.
- **Invoicing Foundation** — invoices + payments + deposits +
  taxes, sitting after a scheduled / completed job.
