# Phase 3 — Message Automations + Lightweight Request Handling

**Status:** source-of-truth design doc for Phase 3.
**Created:** 2026-05-19.
**Scope:** docs only (Phase 3A). No app code, business logic, or schema
changes in Phase 3A.

This document defines what Phase 3 builds, in what order, and (just as
importantly) what Phase 3 deliberately does **not** build. It is the
authoritative reference for every Phase 3 implementation step. If a
task seems to require something outside this doc — especially anything
on the Do-Not-Build list — **stop and ask before changing code.**

> Required reading before starting Phase 3 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_1_QA_REPORT.md`
> - `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md`
> - `docs/PHASE_2_QA_REPORT.md`
> - existing `src/app/admin/*` pages
> - existing task / event / activity / quote-flow code under `src/core/*`
>   and `src/plugins/customer-quote-sales-page/*`

---

## 1. Phase 3 Purpose

Phase 3 adds the next useful vertical slice **after** the quote flow:

```
Customer submits quote request
        ↓
System creates Contact / Property / Lead / Quote
        ↓
System creates Task (schedule_request / manual_quote / service_area_review)
        ↓
task.created → Message Automations engine evaluates rules
        ↓
Internal SMS to configured recipients via GoHighLevel
        ↓
Admin opens the lead detail page
        ↓
Admin marks the task complete and (optionally) adds an internal note
        ↓
Activity records what happened
```

Phase 3 is intentionally narrow. It is one more end-to-end slice — not
the start of a CRM, not a customer-messaging product, and not a
workflow builder. Keep it small, keep it testable, keep the customer
submission resilient to messaging failures.

---

## 2. Phase 3 Scope

### Build

- **Message Automations admin area** — list + detail pages, recent log
  view, retry control.
- **GoHighLevel SMS provider adapter** — the only provider implemented
  in Phase 3. Send-only.
- **Configurable internal SMS recipients** — global list, per-automation
  selection.
- **Configurable automation rules** — enable / disable + recipient
  assignment. Triggers, conditions, and templates remain code/seed-owned.
- **Notification logs** — one row per send attempt; tracks
  pending / sent / failed / skipped.
- **Manual retry for failed SMS sends** — admin-only control surfaced on
  the automation detail + notification log views.
- **Trigger internal SMS from quote-flow `task.created` events** for the
  three Phase 1 task categories
  (`schedule_request`, `manual_quote`, `service_area_review`).
- **Lightweight lead detail page** — `/admin/leads/[leadId]`,
  authenticated, read-mostly, with task completion + notes affordances.
  Reusable foundation for the future CRM surface.
- **Task completion control** — marks a task complete, records the user
  and timestamp, writes an activity entry, optional completion note.
- **Simple internal lead/request notes** — author + body + timestamp,
  attached to a lead, activity entry per add.
- **Activity entries** for completed tasks and added notes.

### Do not build

(Pinned. See §15 for the full Phase 3 Do-Not-Build list.)

- customer-facing SMS automations
- customer reminders or follow-up sequences
- post-job review requests
- email automations
- two-way / inbox messaging
- GoHighLevel conversation sync
- AI-written messages
- full CRM (pipelines, manual lead creation, lead status workflow,
  custom fields, contact merging, CRM search/filter)
- scheduling calendar / appointments / jobs / invoices / payments
- quote acceptance or job creation from a quote

The full Phase 1 + Phase 2 Do-Not-Build lists still apply.

---

## 3. Message Automations Concept

**Message Automations is the admin area for event- and task-triggered
messaging.** It is named broadly on purpose because the same surface
will eventually host more than just internal SMS alerts.

### Long-term direction (not built in Phase 3)

- customer reminders (appointment confirmations, day-of reminders)
- quote follow-ups (3-day, 7-day, 30-day touches)
- post-job review requests
- email automations
- AI-assisted message drafting / rewriting
- multiple providers in parallel
- per-template editors and conditional rule builders
- analytics on send / delivery / open / reply rates

### Phase 3 only supports

- **internal admin SMS alerts** (not customer-facing)
- **GoHighLevel as the first SMS provider** (only adapter implemented)
- **three seeded automations** wired to the existing quote-flow
  `task.created` events

Treat Phase 3 as the **scaffold** — the smallest internal-alerts loop
that proves the abstraction. Future phases extend it without rewriting
the foundation.

---

## 4. Navigation

Add a new top-level admin nav group: **Automations**.

### Sidebar groups after Phase 3

```
Overview
  └── Dashboard                 → /admin

Plugins
  └── Installed plugins         → /admin/plugins

Business Records
  ├── Quote interactions        → /admin/quote-interactions
  ├── Leads                     → /admin/leads
  ├── Quotes                    → /admin/quotes
  └── Tasks                     → /admin/tasks

Automations                     ← new in Phase 3
  └── Message Automations       → /admin/message-automations

Observability
  ├── Activity                  → /admin/activity
  └── Events                    → /admin/events

Tools
  ├── Testing tools             → /admin/testing
  └── Staging tools             → /admin/staging-tools (gated)
```

### Routing rules

- `/admin/leads/[leadId]` is a sub-route of the existing **Leads** entry
  in **Business Records**, not a new nav item.
- No new top-level routes other than Message Automations.
- The Automations group is added to `ADMIN_NAV` in
  `src/components/admin/nav-config.ts`. It must use the existing
  shared shell + components — no one-off chrome (per Phase 2 rules).

---

## 5. Provider Architecture

### Adapter shape

```
Core Message Automation System
        ↓
SMS Provider Adapter (single interface)
        ↓
GoHighLevel Adapter   ← only adapter in Phase 3
        ↓
(Twilio Adapter, etc. ← future, not built)
```

- The automation engine, rules, recipients, and log layer are
  **provider-agnostic**. They speak to a typed adapter interface.
- Only the GoHighLevel adapter knows GHL endpoint shapes, headers, auth
  conventions, or response formats.
- The interface should expose at minimum:
  `sendSms({ to, body, metadata }) → { ok: true, providerMessageId, raw } | { ok: false, error }`.
- Swapping providers (or porting numbers to Twilio later) should be a
  new adapter + a config flip, not a refactor of the rules / logs
  layer.

### Configuration

Secrets live in env vars. **Never** commit them; **never** echo them
to the browser.

Phase 3 GHL env keys (provisional names — finalize during Phase 3B):

```
GHL_API_KEY
GHL_LOCATION_ID
GHL_FROM_PHONE_NUMBER
GHL_BASE_URL            (optional; defaults to the documented prod base)
```

The GHL adapter must be `import "server-only"` so it cannot leak into
client bundles. Same pattern as the RentCast provider.

### Admin UI

The admin can see, but not edit, provider configuration in Phase 3:

- provider name (e.g., "GoHighLevel")
- configured / missing-config status (booleans derived from env
  presence — **never** display the key itself)
- last recent send status (e.g., "Last send: 2 minutes ago — sent")
- per-automation recent log rows

**The admin UI must never render the API key, any secret material, or
the raw request/response bodies that contain headers.** Notification
logs may store a safe rendered body; they must not store the raw
auth header.

---

## 6. Recipients Model

Phase 3 uses a single **global notification recipients list per
business** with a simple per-automation selection.

### Recipient row (logical model — finalize columns in Phase 3B)

- `name` (text, required)
- `phone` (text, required, E.164)
- `is_active` (boolean, default true)
- `role_label` (text, optional — purely descriptive in Phase 3)
- standard `business_id`, `created_at`, `updated_at`

### Seed

Phase 3B seeds **only Sam** as the initial recipient. If a phone number
is not yet available via env / config at seed time, the seed leaves a
clear setup path (env var or one-time admin action) without inserting a
placeholder.

### Assignment

- Each automation has its own set of active recipients drawn from the
  global list.
- Selecting / deselecting recipients on an automation is the **only
  recipient-editing affordance in the admin UI in Phase 3**.
- No hardcoded phone numbers anywhere in app code. The seeded
  automations reference recipients by id (via the join row), not by
  literal phone.
- No teams, no escalation paths, no quiet hours, no on-call rotation in
  Phase 3.

---

## 7. Automation Rules Model

Phase 3 automations are **configurable but not fully custom-built**.
Rules ship seeded; the admin controls the subset of behavior listed
below.

### Main page — `/admin/message-automations`

- Searchable automation list (search by name + description).
- Recent SMS logs strip (latest N notification logs across all
  automations).
- One row per automation: name, trigger summary, channel, status pill
  (enabled / disabled), last-send status / time, recipient count.

### Detail page — `/admin/message-automations/[automationId]`

- name
- description
- trigger (read-only — "Task created with category =
  `schedule_request`", etc.)
- channel ("Internal SMS via GoHighLevel")
- enabled / disabled toggle
- selected recipients (multi-select against the global list)
- seeded template preview (read-only — see §9)
- recent logs for this automation (with retry buttons on failed rows)
- "Last send" summary

### Editing allowed in Phase 3

- enable / disable automation
- assign / unassign recipients to an automation

### Editing **not** allowed in Phase 3

- creating new automations from scratch
- editing triggers
- editing conditions
- editing templates (template body, variables, fallbacks)
- customer-facing automation rules of any kind
- writing custom code from the UI

### Seeded automations

| # | Name                    | Description                                                          | Trigger                                                  | Channel        |
|---|-------------------------|----------------------------------------------------------------------|----------------------------------------------------------|----------------|
| 1 | Schedule Request        | A lead requests to schedule.                                         | `task.created` where `task_category = schedule_request`  | internal SMS   |
| 2 | Manual Quote Needed     | A property could not be quoted automatically.                        | `task.created` where `task_category = manual_quote`      | internal SMS   |
| 3 | Service Area Review     | A lead is outside the normal service area and needs review.          | `task.created` where `task_category = service_area_review` | internal SMS |

These three trigger conditions exactly match the existing quote-flow
task categories emitted by
`src/plugins/customer-quote-sales-page/submit-mapping.ts` and
`src/core/tasks/create.ts`. **No new event types are introduced in
Phase 3.** The engine consumes existing `task.created` events.

---

## 8. Sending Behavior

The customer submission path must remain resilient. Messaging is a
**side effect**, not a precondition for record creation.

### Order of operations

1. Existing quote-flow orchestrator runs (already implemented):
   create Contact → Property → Lead → Quote → mark interaction
   converted → create Task → publish events → write activities.
2. After the task row is created (or as part of the task.created
   publish step), the Message Automation engine is invoked.
3. The engine evaluates enabled automation rules against the event.
4. For each match, the engine inserts a `notification_log` row with
   `status = pending` (one per recipient per matched automation).
5. The engine attempts to send via the GoHighLevel adapter.
6. The log transitions to `sent` (with provider response id) or
   `failed` (with error code + message).

### Failure isolation

- **GHL failures must never roll back Contact / Property / Lead /
  Quote / Task creation.**
- **GHL failures must never block the customer confirmation screen.**
- The Auto-Quote / customer-quote plugin should not learn about
  messaging outcomes. The engine is responsible for its own logs.
- A failed send creates / updates a `notification_log` row with
  status `failed` and the structured error details (code, message,
  provider response if available).
- The admin can manually retry failed sends from the automation detail
  page or directly from a notification log row.

### Skipped sends

A `skipped` status exists for automations matched but intentionally not
sent. Phase 3 reasons that may produce `skipped`:

- automation disabled at evaluation time
- no active recipients assigned
- provider missing required configuration (env var missing)
- rate-limit / circuit-breaker safety (if implemented in Phase 3C)

Skipped logs are non-errors; they exist so the admin can see why no SMS
went out.

---

## 9. SMS Message Content

Phase 3 uses **seeded templates controlled by code or seed data**.
There is **no template editor** in Phase 3.

### Tone

Action-focused. Short. Written for a phone screen.

### Variables to include when available

- customer name (full or first)
- customer phone
- property address / city
- task type / category
- selected quote option label + total (only when a quote exists —
  `manual_quote` and `service_area_review` typically have no quote)
- one-line action instruction
- optional admin deep link to the lead detail page (only if the link
  is short and stable; otherwise omit)

### Example bodies (illustrative only — finalize in Phase 3C seed)

- **Schedule Request:**
  `New schedule request: Jane Smith, 8126 Valhalla Dr, Boca Raton. Every 3 Months, $439. Call/text them to confirm scheduling.`
- **Manual Quote Needed:**
  `Manual quote needed: Jane Smith, 8126 Valhalla Dr, Boca Raton. We don't have property data — call/text them to gather details and quote.`
- **Service Area Review:**
  `Out-of-area lead: Jane Smith, Wellington. Review whether we can help and follow up.`

### Constraints

- Stay well under 160 chars where possible; do not assume MMS.
- Do not include long reports, link dumps, or marketing copy.
- Do not include the customer's email or sensitive personal data
  beyond what the operator needs to act.

---

## 10. Notification Logs

One log row per **(automation, recipient, send attempt)**.

### Logical model (finalize columns in Phase 3B)

- `automation_id`
- `recipient_id`
- `provider` (`gohighlevel`)
- `channel` (`sms`)
- `status` (`pending` | `sent` | `failed` | `skipped`)
- `body` — the rendered SMS body actually sent (safe to display)
- `provider_message_id` — null until `sent`
- `error_code` / `error_message` — set on `failed`
- `related_task_id` / `related_lead_id` / `related_quote_id` /
  `related_contact_id` — nullable; populated when available
- `created_at`
- `sent_at` (nullable)
- `failed_at` (nullable)
- `retried_from_log_id` (nullable, FK to `notification_logs.id`) —
  set when this row was created as a manual retry of an earlier failed
  log

### Manual retry

- Included in Phase 3 for two reasons: debuggability during ramp-up,
  and so a stuck failed message can be re-sent without DB surgery.
- Admin-only; gated by the same auth + active-business-membership rules
  as the rest of `/admin/*`.
- A retry creates a **new** notification_log row with
  `retried_from_log_id = <original id>`; the original failed row is
  not mutated. This preserves history.
- The retry may itself succeed or fail; the chain is visible on the
  log row.
- If manual retry clutters the normal workflow later, it can be hidden
  behind a "show advanced" toggle or moved off the main detail page.

---

## 11. Lightweight Quote Request Handling

Phase 3 introduces the first **non-debug** business-record screen:
`/admin/leads/[leadId]`. It is intentionally minimal but built to be
the foundation for the future CRM surface — not a throwaway test page.

### Route

```
/admin/leads/[leadId]
```

Authenticated, scoped to the user's active business membership (RLS
already enforces this for the `leads` / `contacts` / `properties` /
`quotes` / `tasks` reads). Renders inside the existing `<AdminShell>`
with `<PageHeader>` and shared components.

### Page sections

1. **Lead / request header** — lead title (e.g., "Schedule request from
   Jane Smith"), status pill, created-at timestamp.
2. **Contact summary** — name, phone, email. (Read-only.)
3. **Property summary** — formatted address, city, sqft / property type
   when known. (Read-only.)
4. **Quote summary** — selected option, total, expiration, recommended
   flag. Renders the immutable snapshot from `quotes`. (Read-only.)
   Hidden when no quote exists (e.g., manual_quote / service_area_review
   leads).
5. **Related task** — the task created by the quote-flow submission.
   Includes the task title, category, status, and a **complete task**
   control with an optional completion note.
6. **Internal notes** — list of notes attached to this lead, plus a
   single-textarea "Add internal note" form.
7. **Recent activity** — last N activity rows for this lead
   (task completion, notes added, original quote-flow activities).

### Out of scope for this page (Phase 3)

- editing the contact / property / quote
- changing the lead status field
- creating an additional task
- attaching files / images
- mentions, rich text, or note edit / delete
- inline SMS composition or send
- jumping to a job / appointment / invoice (none of those exist)

---

## 12. Task Completion

A simple, durable transition — not a workflow engine.

### Behavior

- Update the task row: `status = completed`, `completed_at = now()`,
  `completed_by_user_id = <auth user>`.
- Optionally accept a short completion note (single textarea, ~500
  chars). If provided, persist it via the existing `notes` table
  attached to the task or the lead, **and** include it in the
  activity entry.
- Publish an activity entry summarizing the completion.
  Example: `Completed task: Follow up to schedule cleaning. Note: Called customer, scheduled for Friday morning.`
- Do **not** roll back any other state. Do **not** create downstream
  jobs / appointments.

### Surfacing

- The task-completion control is available **directly on
  `/admin/leads/[leadId]`** in the Related Task section.
- The existing `/admin/tasks` list may also expose an inline complete
  action if the affordance fits — only if it is trivial to add inside
  the shared shell. **No separate `/admin/tasks/[taskId]` detail page
  in Phase 3.**

### Event / activity

Phase 3 may either:

- emit an existing event type / activity_type using the established
  `publishEvent` + `createActivity` pair, or
- introduce one targeted activity_type (e.g., `task_completed`) if no
  existing summary fits.

No new core event_types are introduced unless strictly necessary; if
one is, document it during Phase 3F and keep it within the existing
Phase 1 event-bus pattern.

---

## 13. Notes

### Phase 3 scope

- Simple internal notes only.
- Attached to a lead / request via the existing `notes` table where
  possible (`related_object_type = 'lead'`, `related_object_id =
  <leadId>`).
- Each note records: author user id, body, created_at.
- Activity entry per note (e.g., `Sam left a note: "Called, scheduled
  Friday morning."`).
- Render notes most-recent-first on the lead detail page.

### Phase 3 limitations

- No attachments / files.
- No @mentions or notifications from notes.
- No rich text / Markdown rendering — plain text only.
- No pinned notes.
- No edit / delete affordance in Phase 3. (Adding edit/delete later is
  fine, but it is not Phase 3 scope.)

Reuse the existing `notes` table and its current foundation. Do not
introduce new note types, visibility levels, or schema fields beyond
what already exists.

---

## 14. Phase 3 Implementation Plan

Phase 3 is split into focused steps. Each step ends with a clean
`tsc / test / lint / build` pass and a commit.

### Phase 3A — Docs only

- Create this file (`docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md`).
- Add Phase 3 pointers to `CLAUDE.md` and `README.md`.
- **No app code, no business logic, no schema changes.**

### Phase 3B — Schema + seed

- Migrations for the Phase 3 tables:
  - `notification_recipients`
  - `message_automations`
  - `automation_recipients` (join: automation ↔ recipient)
  - `notification_logs`
  - any provider-config / status table only if strictly needed (env-based
    config is preferred — see §5)
- RLS policies consistent with the rest of `admin/*`: authenticated
  users can read/write only within their active business; anon has no
  access; service-role used for engine writes.
- Seed:
  - Sam as the initial recipient (or leave a clear setup path).
  - Three automations (Schedule Request, Manual Quote Needed,
    Service Area Review), all initially **enabled** with Sam assigned.
- **No sending yet.** No engine code, no GHL calls. This step is
  schema-only.

### Phase 3C — Provider adapter + engine plumbing

- GoHighLevel SMS adapter (`src/core/messaging/providers/gohighlevel/*`
  or similar). `import "server-only"`.
- Message-rendering helpers (template + variables → final SMS body).
- `sendSms` function: writes a `pending` notification_log row, calls
  the adapter, transitions to `sent` or `failed`. Never throws.
- **No quote-flow trigger yet.** Phase 3C ships a safe admin test
  action (gated behind the same patterns as the existing testing tools)
  or a tiny manual smoke route for verification. Removed or hidden
  before Phase 3 closes if it is no longer useful.

### Phase 3D — Message Automations admin UI

- `/admin/message-automations` list page (search + log strip).
- `/admin/message-automations/[automationId]` detail page.
- Enable / disable toggle (server action).
- Recipient assignment (server action).
- Recent logs panel.
- Manual retry control on failed logs (server action calls the
  Phase 3C `sendSms`).
- All pages use the shared `<AdminShell>` + `<PageHeader>` +
  shared cards / tables / badges per Phase 2.

### Phase 3E — Wire quote-flow `task.created` to the engine

- After the existing quote-flow orchestrator creates a task, invoke
  the automation engine with the new task row + event context.
- Match on `task_category ∈ { schedule_request, manual_quote,
  service_area_review }`.
- Resolve enabled automations, render templates, send to each active
  recipient, log every attempt.
- **Verify customer submission still succeeds when SMS fails.**
  Wrap the engine call so any error path produces a `failed` /
  `skipped` log row and never propagates to the orchestrator.

### Phase 3F — Lead detail + task completion + notes

- `/admin/leads/[leadId]` page with the sections in §11.
- Task-completion server action (status / completed_at /
  completed_by_user_id, optional note, activity entry).
- Lead-notes add server action.
- Activity entries for completions and note adds.

### Phase 3G — Phase 3 QA

- Mirror of `docs/PHASE_2_QA_REPORT.md`.
- End-to-end verification of the full Phase 3 slice: customer
  submission → records → task → SMS log + send → admin opens lead →
  marks task complete → adds note → activity shows everything.
- Confirm no Phase 3 Do-Not-Build items were implemented.
- Commit `docs/PHASE_3_QA_REPORT.md` and close Phase 3.

---

## 15. Phase 3 Do Not Build

Pinned for clarity. These remain off-limits for Phase 3:

- customer SMS reminders or follow-ups
- post-job review requests
- email automations
- two-way inbox / message browsing UI
- GoHighLevel conversation sync (inbound messages)
- AI-generated or AI-rewritten messages
- automation creation / trigger builder / template editor in the UI
- full CRM (pipelines, manual lead creation, lead status workflow,
  custom fields, contact merging, CRM search/filter, importers)
- scheduling calendar
- appointments
- jobs
- invoices
- payments
- quote acceptance
- job creation from a quote
- customer login / accounts
- mobile / native apps
- theme / skin plugin system

The full Phase 1 + Phase 2 Do-Not-Build lists also still apply. If a
Phase 3 task touches any of the above, **stop and ask first.**

---

## 16. Success Definition

Phase 3 is complete when **every** statement below is true:

- Message Automations appears in the admin nav under a new
  **Automations** group.
- Admin can view the three seeded automations
  (Schedule Request, Manual Quote Needed, Service Area Review).
- Admin can search the automations list.
- Admin can enable / disable each automation.
- Admin can manage the global recipients list.
- Admin can assign / unassign recipients to each automation.
- GoHighLevel SMS provider can send an internal SMS end-to-end.
- Notification logs show `pending → sent / failed / skipped`
  transitions with timestamps.
- Failed logs can be retried manually; retries create a new log row
  linked via `retried_from_log_id`.
- Quote-flow tasks of category `schedule_request`, `manual_quote`,
  and `service_area_review` trigger SMS log + send attempts.
- Customer quote submission still succeeds when SMS sending fails or
  the GHL provider is misconfigured.
- Admin can open a lead detail page at `/admin/leads/[leadId]`.
- Admin can mark the related task complete (status + completed_at +
  completed_by_user_id).
- Admin can add an internal note to a lead.
- Activity entries record task completion and note creation.
- All `/admin/*` pages still use the shared `<AdminShell>` and shared
  components per Phase 2 — no one-off chrome.
- No Phase 3 Do-Not-Build items are implemented.
- `npx tsc --noEmit`, `npm run test`, `npm run lint`, and
  `npm run build` all pass clean.
- `docs/PHASE_3_QA_REPORT.md` exists and signs off the slice.

---

## Appendix A — Existing assets Phase 3 builds on

For accuracy, these existing pieces are the foundation Phase 3
extends. Phase 3 does not rewrite or replace them.

- **Task creation** — `src/core/tasks/create.ts` (`createTask`) and
  the quote-flow caller at
  `src/plugins/customer-quote-sales-page/submit-contact.ts`.
- **Task category mapping** —
  `src/plugins/customer-quote-sales-page/submit-mapping.ts` already
  produces the three category strings Phase 3 keys off
  (`schedule_request`, `manual_quote`, `service_area_review`).
- **Event bus** — `src/core/events/bus.ts`, `payload-schemas.ts`,
  `types.ts`. `task.created` is one of the seeded Phase 1 event
  types.
- **Activity logger** — `src/core/activity/logger.ts` +
  `input-schema.ts`. Reused for task completion and note activities.
- **Admin shell + shared components** — see Phase 2 Appendix B in
  `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md`. The new
  Automations pages and lead detail page must consume these
  unchanged.
- **Tasks list page** — `src/app/admin/tasks/page.tsx`. May gain an
  inline complete action in Phase 3F if it fits the shared shell.
- **Leads list page** — `src/app/admin/leads/page.tsx`. Existing
  list view stays; Phase 3F adds the per-lead detail route under it.
- **Notes table** — `notes` table from the Phase 1 schema (see
  `schema.md` §18). Phase 3 uses it as-is.
- **Service-role client** — `src/core/auth/service-role.ts`. Phase 3
  engine writes (logs, retries) use this pattern, same as
  `events` / `activities` / `tasks`.

No part of this list is being modified in Phase 3A.

---

## Appendix B — Phase 3B schema + seed (delivered)

Step 3B shipped the database foundation only. **No app code, no GHL
adapter, no quote-flow wiring, no SMS sends.**

### Migration

`supabase/migrations/20260520120000_phase_3_message_automations.sql`
adds four tables, indexes, CHECK constraints, RLS enable, and a
members-SELECT policy per table.

| Table | Purpose | Notable shape |
|---|---|---|
| `notification_recipients` | Per-business recipient list. | `phone_e164` CHECK (`^\+[1-9][0-9]{6,14}$`), UNIQUE `(business_id, phone_e164)`. |
| `message_automations` | Configurable automation rules. | `channel='sms'` + `provider_key='gohighlevel'` CHECKs, UNIQUE `(business_id, automation_key)`. |
| `automation_recipients` | Join: automation ↔ recipient. | UNIQUE `(automation_id, recipient_id)`. |
| `notification_logs` | One row per send attempt. | `status` CHECK (`pending/sent/failed/skipped`), `retried_from_log_id` self-ref FK, nullable related-object FKs (ON DELETE SET NULL). |

### RLS approach

All four tables follow **Pattern B** from the Phase 1 RLS migration:
authenticated business members may `SELECT`; `INSERT` / `UPDATE` /
`DELETE` are routed through the service-role client only (Phase 3D
will add controlled admin server actions; Phase 3C-onward writes
notification logs from the engine via service-role).

### Seed

`supabase/seed/phase_3_seed.sql` (applied by `supabase/seed/run_seed.sh`
after `phase_1_seed.sql`):

- Seeds three automations on Crystal Bear: `schedule_request`,
  `manual_quote_needed`, `service_area_review`. All enabled, channel
  `sms`, provider `gohighlevel`, template keys
  `internal_*_v1`, and short template previews.
- Seeds the **recipient + assignments only when**
  `SEED_NOTIFICATION_PHONE_E164` is set in `.env.local`. Sam is created
  (`name='Sam'`, `role_label='Owner'`, `is_active=true`) and assigned
  to all three automations. When the env var is empty the seed prints
  a `NOTICE` block with copy-paste instructions and skips the recipient
  rows — automations still seed.
- No `notification_logs` rows are seeded.

### Env vars added

`.env.example` now lists:

- `SEED_NOTIFICATION_PHONE_E164` — optional; substituted into
  `phase_3_seed.sql` by the runner.
- `GHL_API_KEY` / `GHL_LOCATION_ID` / `GHL_FROM_PHONE_NUMBER` /
  `GHL_BASE_URL` — server-only. **Not** read by Phase 3B; declared now
  so operators can populate them before Phase 3C lands.

### Verification

Read-only verification queries live at
`supabase/seed/PHASE_3_VERIFICATION.sql`. They check: tables exist, RLS
is enabled, SELECT policies exist, the three automations seeded, the
recipient + assignments exist only when the phone env was set, no
notification logs seeded, and CHECK / UNIQUE constraints are in place.

### Applied to the linked project

The migration was applied via `supabase db push --linked --include-all`
and the seed via `supabase/seed/run_seed.sh` on 2026-05-19. Verification
queries confirmed: four tables present, RLS enabled with one
members-SELECT policy per table, three automations seeded (all enabled),
Sam recipient seeded with three assignments, zero `notification_logs`
rows, all CHECK / UNIQUE constraints in place.

---

## Appendix C — Phase 3C messaging foundation (delivered)

Step 3C shipped the server-only messaging layer: provider-agnostic
adapter interface, GoHighLevel SMS adapter, template rendering,
notification-log state transitions, and one internal admin test page.
**No quote-flow wiring, no customer SMS, no two-way inbox, no GHL
conversation sync.**

### Module map — `src/core/messaging/`

| File | Side | Purpose |
|---|---|---|
| `types.ts` | pure | Statuses / channels / provider keys / template keys + `TemplateContext` / `SmsSendInput` / `SmsSendResult` / `SafeProviderResponse` / `ProviderConfigStatus` / `NotificationLogSummary`. |
| `config.ts` | pure | `readGhlConfigStatus(env)` → `{ providerKey, configured, missingKeys }`. `resolveGhlConfig(env)` returns the typed config or the missing-key list. Default base URL is `https://services.leadconnectorhq.com`. |
| `templates.ts` | pure | Three renderers (`renderScheduleRequest`, `renderManualQuoteNeeded`, `renderServiceAreaReview`) + the `renderMessage(templateKey, ctx)` dispatcher. All take a `TemplateContext` with every field optional; missing values fall back to readable phrases. |
| `render.ts` | pure | `renderByTemplateKey(key, ctx)` — string-keyed orchestrator returning a discriminated result; surfaces `UNKNOWN_TEMPLATE`. |
| `sanitize.ts` | pure | `sanitizeProviderResponse(raw)` whitelists known-safe scalar keys, drops nested objects / arrays, strips Authorization / api_key / token / secret-shaped keys (and values), truncates strings to 120 chars. |
| `provider.ts` | server | `SmsProviderAdapter` interface + `getSmsProviderAdapter(providerKey)` registry — currently a single `gohighlevel` entry. |
| `providers/gohighlevel.ts` | server-only | The GHL adapter. Two-call send (`/contacts/upsert` then `/conversations/messages`). Validates input, resolves env, returns discriminated `SmsSendResult`. Never throws. |
| `notification-logs.ts` | server-only | `createPendingNotificationLog`, `markNotificationLogSent`, `markNotificationLogFailed`, `createSkippedNotificationLog`, `listRecentNotificationLogs`. All use the service-role client. |
| `send-internal-sms.ts` | server-only | The Phase 3C orchestrator. Pre-flight → write skipped (or pending) log → call adapter → mark sent / failed. Customer submission and other callers must wrap so a failure is non-fatal upstream. |
| `index.ts` | barrel | Public re-exports. Server-only modules retain their directive — importing the barrel in a Client Component will still fail at build time exactly as if the offending module had been imported directly. |

### GHL adapter assumptions

Documented inline at the top of `providers/gohighlevel.ts`:

- Targets the **LeadConnector v2 API** at
  `https://services.leadconnectorhq.com` (override with `GHL_BASE_URL`).
- v2 has no "send SMS to a raw phone" endpoint, so the adapter
  performs a two-call send:
  1. `POST /contacts/upsert` — resolves / creates the recipient by phone.
  2. `POST /conversations/messages` — sends the SMS to the resolved
     contact id.
- Required headers on every request: `Authorization: Bearer
  <GHL_API_KEY>`, `Version: 2021-04-15`, `Accept: application/json`,
  `Content-Type: application/json`.
- If the user's GHL configuration needs a different endpoint, body
  shape, or version header, only this file changes — the engine, log
  writer, and admin UI stay put.

The adapter never throws. API keys, bearer tokens, and raw response
headers are never echoed back, logged, or rendered.

### Env vars used (Phase 3C)

Read by `providers/gohighlevel.ts` only:

- `GHL_API_KEY` — required.
- `GHL_LOCATION_ID` — required.
- `GHL_FROM_PHONE_NUMBER` — required (used as `fromNumber`).
- `GHL_BASE_URL` — optional; defaults to the LeadConnector v2 host.

Read by `send-internal-sms.ts` indirectly through
`readGhlConfigStatus(process.env)` to decide whether to write a
`pending` log or a `skipped` `MISSING_CONFIG` log.

### Templates

Three seeded templates, mirrored in `TEMPLATE_KEYS`:

- `internal_schedule_request_v1` — "New schedule request: …"
- `internal_manual_quote_needed_v1` — "Manual quote needed: …"
- `internal_service_area_review_v1` — "Out-of-area lead: …"

Each accepts a `TemplateContext` with `customer_name`, `address`,
`city`, `plan_label`, `total`, `task_category`. Missing values fall
back to "a lead" / "an address" / "their area" / "their selected plan"
/ "(no total)". No customer email is ever included.

### Notification-log flow

`sendInternalSmsNotification(input)`:

1. Pre-flight validation (businessId, phone, body). If a row can still
   be inserted, write a `skipped` log with the validation reason.
2. If GHL env is incomplete → insert one `skipped` log row with
   `error_code='MISSING_CONFIG'` and short reason; return without a
   network call.
3. Otherwise → insert `pending` log row.
4. Call `getSmsProviderAdapter('gohighlevel').sendSms(...)`.
5. Success → `UPDATE` the same row to `sent`, set
   `provider_message_id`, `sent_at`, and the sanitized
   `provider_response`.
6. Failure → `UPDATE` the same row to `failed`, set `error_code`,
   `error_message`, `failed_at`, and the sanitized response (when
   available).

Manual retry (not yet surfaced in the admin UI in Phase 3C, but
plumbed): callers can invoke `createPendingNotificationLog` with
`retriedFromLogId = <original failed log id>` to create a **new**
pending row linked to the original; the original failed row is never
mutated.

### Internal SMS test page — `/admin/testing/message-sms`

The only UI shipped in Phase 3C, accessible from the Testing tools
hub.

- Auth + active-business gated.
- Renders provider status (`configured` true/false + missing key
  names). Never displays a key value.
- Lists active `notification_recipients` for the workspace; phone
  numbers are masked (country prefix + last 4 only).
- Lists the three seeded template keys.
- "Send one test SMS" button calls `sendTestSmsAction`, which:
  - re-checks auth + active business
  - validates recipient belongs to the business + is active
  - renders the template with `SAMPLE_TEMPLATE_CONTEXT` (Jane Smith,
    8126 Valhalla Dr, Boca Raton, Every 3 Months, $439)
  - calls `sendInternalSmsNotification` with `automationId=null`
    (ad-hoc test) and no related-object FKs
- Shows the resulting status (`sent` / `failed` / `skipped`), log id
  prefix, provider message id (when available), and the rendered body.
- Below the form, shows the 10 most recent `notification_logs` rows
  for the workspace with masked phones, status pills, and error info
  when present.

The page never creates or touches contacts, properties, leads,
quotes, tasks, events, activities, issues, or
`quote_page_interactions`.

### Testing without GHL credentials

With `GHL_API_KEY` / `GHL_LOCATION_ID` / `GHL_FROM_PHONE_NUMBER`
empty:

- Page renders normally; provider badge shows "missing config".
- "Send" button still works; the action returns
  `status='skipped'` with `error.code='MISSING_CONFIG'`.
- A `skipped` `notification_logs` row is written with
  `error_code='MISSING_CONFIG'`. **No network call is attempted.**

With the three GHL keys set + `SEED_NOTIFICATION_PHONE_E164` seeded:

- Sam appears as an active recipient.
- "Send" triggers a real upsert + message POST to GHL.
- Log transitions `pending → sent` on success (or `failed` with the
  provider's HTTP status / error code on failure).
- Sam receives one SMS.

### Tests

Unit tests in `src/core/messaging/`:

- `config.test.ts` — env presence, whitespace handling, default base
  URL, custom base URL trimming.
- `templates.test.ts` — full + partial context, fallback phrases,
  whitespace collapsing, never includes "@".
- `render.test.ts` — dispatcher happy path + `UNKNOWN_TEMPLATE`.
- `sanitize.test.ts` — message-id / status extraction, secret-shaped
  key stripping, nested-object / array dropping, string truncation,
  conversationId preservation, secret-shaped value rejection.
- `providers/gohighlevel.test.ts` — `INVALID_INPUT` on bad phone /
  empty body; `MISSING_CONFIG` returned without calling fetch (fetch
  spy proves zero network requests); `pickContactId` /
  `extractContactObject` helpers.

Live GHL integration tests are intentionally not added — they'd leak
quota, require real credentials, and be non-deterministic. The
`/admin/testing/message-sms` page exercises the end-to-end path
against the real provider when GHL env is set.

DB-write tests for the notification-log helpers are deferred (they
need a test database or a mock Supabase client). The admin page
exercises them end-to-end against the live Supabase project.

### What is intentionally NOT built in Phase 3C

- Full Message Automations admin UI (list / detail / enable-disable /
  recipient management) — Phase 3D.
- Quote-flow `task.created` → engine wiring — Phase 3E.
- Lead detail / task completion / notes — Phase 3F.
- Customer SMS, customer reminders, email automations, two-way
  inbox, GHL conversation sync, AI message writing — never in Phase 3.
- New database schema. Phase 3B's four tables are sufficient for
  Phase 3C.

### Quality gates at end of Phase 3C

- `npx tsc --noEmit` — clean (0 errors).
- `npm run test` — **241 / 241 tests pass** across 27 files (40 new
  messaging tests).
- `npm run lint` — clean (0 warnings, 0 errors).
- `npm run build` — green; 21 admin routes compile (`+ /admin/testing/message-sms`).

---

## Appendix D — Phase 3D Message Automations admin UI (delivered)

Step 3D shipped the read + edit surface for the three seeded
automations and the global recipient list. **No quote-flow wiring, no
customer SMS, no lead detail / task completion / notes, no new schema.**

### Navigation

`Automations` is now a top-level admin nav group between
`Business Records` and `Observability`, with one item:

```
Automations
  └── Message Automations → /admin/message-automations
```

Sidebar order (after Phase 3D):
```
Overview → Plugins → Business Records → Automations →
Observability → Tools
```

The icon is a new `broadcast` glyph added to `AdminIcon`.

### Routes added

| Route | Purpose |
|---|---|
| `/admin/message-automations` | List page. GHL provider status (presence only), search input, automation list with per-row trigger / channel / provider / recipient count / last-send pill, and a 15-row recent-logs section across all automations. |
| `/admin/message-automations/[automationId]` | Detail page. Read-only metadata + template preview. Edit affordances: toggle automation `is_enabled` and per-recipient assignment. Per-automation log list with inline retry on failed rows. |
| `/admin/message-automations/recipients` | Recipient list with inline add/edit form. E.164 validation client + server, duplicate-phone detection with a friendly error, active/inactive toggle. |

All three routes use the shared `<AdminShell>` + `<PageHeader>` +
shared cards/badges per Phase 2. Phone numbers are always rendered
through `maskPhoneE164` (country prefix + last 4).

### Search

Pure helper `filterAutomations(rows, q)` matches AND-tokenized lowercase
substrings across `name`, `description`, and `automation_key`. Client
debounces input (200 ms) and updates `?q=` via
`router.replace(..., { scroll: false })`; the server component re-runs
the filter on each request. 11 unit tests in `admin-search.test.ts`.

### Server actions

All live in `src/app/admin/message-automations/actions.ts`. Each runs
the same auth / active-business / service-role pattern as Phase 3C and
returns a discriminated result; no unhandled errors propagate to the
client.

| Action | Writes |
|---|---|
| `setAutomationEnabledAction({ automationId, isEnabled })` | `message_automations.is_enabled` |
| `setAutomationRecipientAssignmentAction({ automationId, recipientId, assigned, isEnabled? })` | `automation_recipients` (insert / upsert / delete via the `(automation_id, recipient_id)` unique key) |
| `upsertNotificationRecipientAction({ recipientId?, name, phoneE164, roleLabel?, isActive })` | `notification_recipients` (insert or update). Validates via `validateRecipientInput`; maps unique-violation 23505 to a friendly `DUPLICATE_PHONE`. |
| `retryNotificationLogAction({ logId })` | New row in `notification_logs` via the Phase 3C engine. Original row never mutated. Uses `retryFailedNotificationLog` which enforces business scope + `status='failed'` precondition. |

Each action calls `revalidatePath` so the list + detail pages reflect
mutations on the next render.

### Validation

Pure helper `validateRecipientInput` in
`src/core/messaging/admin-validation.ts`:

- `name` — required, ≤ 120 chars, trimmed.
- `phoneE164` — required, must match `^\+[1-9][0-9]{6,14}$`
  (mirror of the DB CHECK).
- `roleLabel` — optional, ≤ 80 chars, null when empty/whitespace.
- `isActive` — must be boolean.

Returned errors are field-tagged so the form can render per-field
messages. 11 unit tests in `admin-validation.test.ts`.

### Retry

`src/core/messaging/retry.ts` reads the original failed log via
service-role, verifies `business_id === active_business` and
`status === 'failed'`, then dispatches the SAME `rendered_message` to
the Phase 3C engine with `retriedFromLogId` set. The original row is
never mutated. The detail page surfaces an inline `Retry` button on
every `failed` log row; success/failure feedback renders next to the
button.

### What is intentionally NOT built in Phase 3D

- Quote-flow `task.created` → engine wiring — Phase 3E.
- Lead detail / task completion / notes — Phase 3F.
- Custom automation creation, trigger builder, template editor,
  provider switcher — never in Phase 3.
- Customer-facing message templates, customer SMS reminders, email
  automations, two-way inbox, GHL conversation sync, AI message
  writing — never in Phase 3.
- New database schema. The Phase 3B tables remain sufficient.

### Quality gates at end of Phase 3D

- `npx tsc --noEmit` — clean (0 errors).
- `npm run test` — **275 / 275 tests pass** across 30 files (+28 new
  Phase 3D tests: search, validation, retry input checks, nav group).
- `npm run lint` — clean (0 warnings, 0 errors).
- `npm run build` — green; 24 admin routes compile (`+ /admin/message-automations`, `+ /admin/message-automations/[automationId]`, `+ /admin/message-automations/recipients`).

---

## Appendix E — Phase 3E quote-flow → automation engine (delivered)

Step 3E wires the existing quote-flow submission to the Phase 3D
Message Automations engine. The engine fires after the task is created
+ events/activities are published. **Customer submission stays
resilient — any messaging failure is non-fatal.**

### Engine

`src/core/messaging/automation-engine.ts`
(`evaluateAutomationsForTaskCreated(input)`) — server-only, single
entry point. Never throws (wraps an inner function in try/catch so
even an unexpected exception becomes `{ ok: true, matched: 0,
outcomes: [] }`).

Flow per call:

1. Load `message_automations` for the business filtered by
   `trigger_type='task.created'`.
2. Match by `trigger_filters.category === input.taskContext.taskCategory`
   via pure `pickAutomationsForTaskCategory`. Disabled automations
   stay in the matched set so the engine can write a skipped log.
3. Load `automation_recipients` for every matched id in one round-trip
   (joined to `notification_recipients` via `!inner`).
4. For each matched automation:
   - render template with `renderByTemplateKey(templateKey, ctx)`
   - on render failure → write one `skipped` log with the template
     error code
   - decide outcome via pure `decideAutomationOutcome`:
     - DISABLED → one `skipped` log (`AUTOMATION_DISABLED`)
     - NO active recipients → one `skipped` log (`NO_ACTIVE_RECIPIENTS`)
     - else SEND → one `sendInternalSmsNotification` per active
       recipient. Phase 3C's engine handles MISSING_CONFIG
       (writes `skipped` without a network call) and the
       pending → sent / failed transitions.

### Quote-flow wiring point

`src/plugins/customer-quote-sales-page/submit-contact.ts`, step **11**
(new), runs **after** the trailing events / activities and **before**
the success return. The call is wrapped in a try/catch as
defense-in-depth so any unforeseen exception is logged and the customer
still receives `{ ok: true, … }`.

Context passed to the engine:

- `taskCategory` / `taskTitle` (from existing mapping helpers)
- `contactFullName`
- `formattedAddress` + `addressLine1` + `city` (from
  `interaction.normalizedAddress`)
- `selectedPlanLabel` (mapped from `OptionKey`:
  `one_time → "One-Time Clean"`, `six_month → "Every 6 Months"`,
  `three_month → "Every 3 Months"`)
- `selectedTotal`
- `related`: `relatedTaskId`, `relatedLeadId`, `relatedQuoteId`,
  `relatedContactId`, `relatedPropertyId` (all stamped onto the
  notification_logs row)

Customer email is **never** passed to the engine or rendered.

### Trigger → automation → template mapping

| Quote-flow kind | task_category | Seeded automation | template_key |
|---|---|---|---|
| `quote_generated` | `schedule_request` | Schedule Request | `internal_schedule_request_v1` |
| `property_data_missing` | `manual_quote` | Manual Quote Needed | `internal_manual_quote_needed_v1` |
| `out_of_area` | `service_area_review` | Service Area Review | `internal_service_area_review_v1` |

### Behavior matrix

| Scenario | Engine writes | Network call? |
|---|---|---|
| Enabled automation + active recipient + GHL configured | one `pending` log per recipient → `sent` or `failed` | yes |
| Enabled automation + active recipient + GHL missing | one `skipped` log per recipient (`MISSING_CONFIG`) | no |
| Enabled automation + no active recipients | one `skipped` log (`NO_ACTIVE_RECIPIENTS`) | no |
| Disabled automation | one `skipped` log (`AUTOMATION_DISABLED`) | no |
| Render error (unknown `template_key`) | one `skipped` log with the render error | no |
| No automation matches the category | no log written | no |
| Unexpected engine exception | logged to server console; engine returns `matched=0` | no |
| Anything fails after the task is created | customer still receives `{ ok: true }` confirmation | n/a |

Every log row is stamped with the related task / lead / quote / contact
/ property ids passed by the orchestrator. These show in the existing
Phase 3D admin pages without further UI work.

### Failure isolation

- The engine itself returns a discriminated result and never throws.
- The wiring at `submit-contact.ts:11` adds a redundant try/catch.
- Even if `notification_logs` writes fail, the engine logs the error
  and continues. The customer confirmation is constructed and returned
  unchanged.
- No SMS error details are ever surfaced to the customer.

### Manual test plan

A — **Enabled `schedule_request`** (default seeded state):
1. Open `/q`, pick an in-area address with property data.
2. Choose a plan, submit the contact form.
3. Customer confirmation renders normally.
4. `/admin/message-automations` shows a new log row;
   `/admin/message-automations/{schedule_request id}` shows the same
   row with `step send_message HTTP 200` on success.
5. Sam receives one SMS.

B — **Disabled `manual_quote_needed`**:
1. Disable Manual Quote Needed on its detail page.
2. Open `/q`, pick an in-area address that returns no sqft from
   RentCast (manual-quote fallback). Submit contact form.
3. Customer confirmation renders normally.
4. The automation detail page shows a new `skipped` log with
   `error_code=AUTOMATION_DISABLED`. No SMS sent.

C — **Missing / broken GHL config**:
1. Clear / break `GHL_API_KEY`. Restart dev server.
2. Submit any `/q` flow that produces a matching task.
3. Customer confirmation renders normally.
4. Log row shows `skipped` (`MISSING_CONFIG`) or `failed`
   (`UPSTREAM_UNAUTHORIZED` with `step contact_upsert`); the existing
   3C troubleshooting tips render on the message-sms test page.

### Tests added

- `automation-matching.test.ts` (11 cases) — category match, ignores
  non-`task.created` triggers, ignores null filters, recipient
  filtering, decision precedence (`AUTOMATION_DISABLED` over
  `NO_ACTIVE_RECIPIENTS`).
- `template-context.test.ts` (8 cases) — full / partial / empty
  contexts, address fallback + city-strip, whitespace handling,
  numeric total rounding, never includes "email".
- `automation-engine.test.ts` (3 cases) — pre-flight branches return
  a no-op without touching Supabase.

### What is intentionally NOT built in Phase 3E

- Lead detail / task completion / notes — Phase 3F.
- Customer-facing SMS reminders, post-job review requests, email
  automations, two-way inbox, GHL conversation sync, AI message
  writing — never in Phase 3.
- New task categories, new event types, new schema. The Phase 3B
  tables remain sufficient.

### Quality gates at end of Phase 3E

- `npx tsc --noEmit` — clean (0 errors).
- `npm run test` — **296 / 296 tests pass** across 33 files (+21 new
  Phase 3E tests).
- `npm run lint` — clean (0 warnings, 0 errors).
- `npm run build` — green; route count unchanged (no new admin pages).
