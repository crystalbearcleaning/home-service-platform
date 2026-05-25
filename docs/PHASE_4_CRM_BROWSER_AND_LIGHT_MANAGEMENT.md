# Phase 4 — CRM Browser + Light Management

**Status:** source-of-truth design doc for Phase 4.
**Created:** 2026-05-25.
**Scope:** docs only (Phase 4A). No app code, business logic, or schema
changes in Phase 4A.

This document defines what Phase 4 builds, in what order, and (just as
importantly) what Phase 4 deliberately does **not** build. It is the
authoritative reference for every Phase 4 implementation step. If a
task seems to require something outside this doc — especially anything
on the Do-Not-Build list — **stop and ask before changing code.**

> Required reading before starting Phase 4 implementation work:
> - `CLAUDE.md`
> - `schema.md`
> - `README.md`
> - `docs/PROJECT_BLUEPRINT.md`
> - `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md` (shell + components rules)
> - `docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md`
> - `docs/PHASE_3_QA_REPORT.md`
> - existing admin CRM pages under `src/app/admin/{leads,quotes,tasks,quote-interactions}/`

---

## 1. Phase 4 Purpose

Phase 4 is **CRM Browser + Light Management**.

Goal:

- Make the records that *already exist* (contacts, properties,
  quotes, leads, tasks) easier to **browse, search, open, and lightly
  manage** without building the full CRM yet.
- Establish the mental model an owner of a service business actually
  uses — **Contacts** as the primary customer hub, with quotes /
  properties / requests / tasks attached.

Reference for organization: Jobber-style CRM (contacts at the centre,
records hang off them). Use it as **inspiration**, not as a feature
checklist. We are not rebuilding Jobber.

Phase 4 stays small. The Phase 1 "do not overbuild" rule still applies.

---

## 2. CRM Mental Model

A service-business owner thinks about their world in this order:

1. **Contacts** — the people they serve.
2. **Quotes** — what they offered.
3. **Jobs** — future scope; not built in Phase 4.
4. **Invoices** — future scope; not built in Phase 4.

Phase 4 builds **Contacts and Quotes** only.

### Where other records live

| Record | Phase 4 home |
|---|---|
| **Contacts** | Top-level CRM nav (new). |
| **Properties** | Attached under Contacts — no top-level nav. |
| **Quotes** | Top-level CRM nav (new). |
| **Leads** | Stay in DB. Treated as "request / opportunity" records *related to* contacts. No longer the primary CRM nav item. List page may stay reachable; primary navigation is via contact detail / quotes / tasks. |
| **Tasks** | Own nav group (not under CRM). They are action items, not records. |
| **Quote interactions** | Move to **Observability** — they are source / debug / audit records for the public `/q` flow, not CRM records. |

This keeps "CRM" focused on the records an owner reviews when serving
customers, and keeps debugging surfaces out of the way.

---

## 3. Phase 4 Navigation

The admin sidebar groups become (after Phase 4 ships):

```
Overview
  └── Dashboard                  → /admin

CRM
  ├── Contacts                   → /admin/contacts
  └── Quotes                     → /admin/quotes

Tasks
  └── Tasks                      → /admin/tasks

Automations
  └── Message Automations        → /admin/message-automations

Plugins
  └── Installed plugins          → /admin/plugins

Observability
  ├── Quote interactions         → /admin/quote-interactions
  ├── Activity                   → /admin/activity
  └── Events                     → /admin/events

Tools
  ├── Testing tools              → /admin/testing
  └── Staging tools              → /admin/staging-tools  (gated)
```

### Changes vs. Phase 3 nav

- **Business Records** group is removed. Its items split:
  - Contacts (new) + Quotes → **CRM**
  - Tasks → its own **Tasks** group
  - Quote interactions → **Observability**
  - Leads: see §7 below.
- **Plugins** drops below Automations to match the customer-first
  emphasis (CRM → Tasks → Automations → infrastructure).

### Rules

- No `Jobs`, `Invoices`, or top-level `Properties` nav items in
  Phase 4. If a future phase needs them, add them then — not as
  placeholders now.
- No empty / "coming soon" pages.
- Dashboard does **not** need to be redesigned in Phase 4. If a tiny
  copy or stat-card adjustment is required by the nav change, that is
  fine; full redesign is out of scope.

---

## 4. Contacts

### Routes

- `/admin/contacts` — list page.
- `/admin/contacts/[contactId]` — customer hub detail page.

### Contacts list

Columns / per-row content:

- name
- phone
- email
- primary property / address
- latest quote / request status
- open task indicator (count or pill)
- last activity date

### Contacts list search

Single search box matching across:

- name
- phone
- email
- address (formatted address on attached properties)

AND-token semantics (Phase 3D's `filterAutomations` style is a good
reference — pure, debounced, URL-driven).

### Contact detail = customer hub

Sections (in this order):

1. **Customer info** — name / phone / email (editable, see §4 editing).
2. **Properties** — every property attached to the contact. Read-only.
   See §5 for the property-summary rules.
3. **Related leads / requests** — request records for this contact.
   Link to existing `/admin/leads/[leadId]` for the detail view.
4. **Related quotes** — quote rows for this contact, link to
   `/admin/quotes/[quoteId]`.
5. **Related tasks** — task rows where `related_object_type='lead'`
   and the lead belongs to this contact. Phase 3 task-completion
   flow remains intact.
6. **Notes** — internal notes attached directly to the contact
   (`related_object_type='contact'`). Plain text, author + timestamp.
   See §10.
7. **Activity** — activity entries scoped to records related to this
   contact (lead, quote, task, contact). Last N entries.

### Contact editing

Allowed:

- edit name, phone, email.
- reasonable validation (non-empty name, basic phone shape, basic
  email shape — reuse Phase 3 patterns where possible).
- write an activity entry on update if practical
  (`activity_type='contact.updated'`, summary lists changed fields).

Not allowed in Phase 4:

- manual contact creation (`+ Add contact` button).
- contact merging / dedup tooling.
- changing the contact's `source` / `created_from_*` fields.
- changing or deleting any history.

---

## 5. Properties

Properties are **always shown under Contacts**. Never a top-level
nav item in Phase 4.

### Property summary on contact detail

For each attached property, show:

- formatted address
- city / state
- `service_area_status`
- `square_footage` / `property_type` / `property_data_status` when
  available
- `last_enriched_at` if useful

All fields are **read-only**. They originate from Google / RentCast
and stay derived.

### Not allowed in Phase 4

- top-level properties list page.
- standalone `/admin/properties/[propertyId]` detail page (unless
  absolutely required — stop and ask first).
- property editing of any kind.
- property manual overrides (e.g. setting `square_footage` by hand).
- forcing a re-enrichment from the admin UI.

---

## 6. Quotes

### Routes

- `/admin/quotes` — improved list page.
- `/admin/quotes/[quoteId]` — new detail page.

### Quotes list improvements

Add:

- search by contact name / email / phone OR property address.
- filter by `status` (use the existing taxonomy: `draft`,
  `submitted`, `expired`, `void`).

Existing row content stays — the immutable price-snapshot summary is
already meaningful per row.

### Quote detail page

Sections (in this order):

1. **Customer / contact** — link to `/admin/contacts/[contactId]`.
2. **Property** — read-only summary, link not required (contact
   detail is the property hub).
3. **Selected option** + **selected total** + **expiration** +
   **quote status**.
4. **Line items** — render from `line_items_snapshot`.
5. **Price snapshot** — render from `price_snapshot`.
6. **Calculation snapshot** — render from `calculation_snapshot`.
7. **Source plugin / version** — small footer block, useful for
   debugging snapshot drift.
8. **Related lead / request** — link to `/admin/leads/[leadId]`.
9. **Related task / activity** — show if useful; otherwise omit.

### Not allowed in Phase 4

- quote creation from the UI.
- quote editing of any field.
- quote status workflow (no "send", no "approve", no "void" button).
- quote acceptance / signature flows.
- job creation from quote.
- duplicating / cloning quotes.

Quotes are still **immutable price snapshots** per the Phase 1 rules.

---

## 7. Leads

Phase 4 **does not** remove leads.

Existing routes stay:

- `/admin/leads`
- `/admin/leads/[leadId]` (Phase 3F detail with task completion +
  notes)

What changes in Phase 4:

- Leads are no longer the primary CRM nav entry. The owner reaches
  them through:
  - the lead-list page (still accessible if useful), OR
  - links from contacts, quotes, tasks, or activity.
- If the Phase 4B nav reorganization removes "Leads" from the
  top-level sidebar, make sure every path that used to depend on it
  still works:
  - quote interactions converted-to-lead link continues to point at
    `/admin/leads/[leadId]`.
  - contact detail "Related leads / requests" section is the new
    canonical entry.
  - direct URLs continue to resolve.

If keeping the lead list page in the sidebar feels cleaner during
implementation, that is acceptable — but the **primary CRM emphasis
must be Contacts + Quotes**.

---

## 8. Tasks

Move Tasks into its **own** nav group ("Tasks"). One item:

- `/admin/tasks`

### Phase 4 list improvements

Add simple filters:

- `status` (default: open, with toggle for completed / canceled)
- `task_category` (`schedule_request` / `manual_quote` /
  `service_area_review` / `admin_review` / `issue_review`)

### Keep

- Phase 3F task completion behavior on `/admin/leads/[leadId]` is
  unchanged.

### Not allowed in Phase 4

- `/admin/tasks/[taskId]` detail page.
- advanced task queue (claim / lock / unblock).
- task assignment workflows.
- recurring tasks.
- task creation from the UI.

---

## 9. Quote Interactions

Move `/admin/quote-interactions` from CRM/Business Records to
**Observability**.

Rationale: quote interactions are source / debug / audit records of
the public `/q` flow. They are not customer-facing CRM records; they
should live next to Activity / Events.

### Rules

- Do not delete the page.
- Do not change any quote interaction behavior or data.
- Do not change the public quote flow.
- The Observability group ordering becomes: Quote interactions →
  Activity → Events (most-specific → most-general).

---

## 10. Notes

Reuse the Phase 3F notes pattern (`src/core/notes/*`).

Phase 4 enables notes on:

- **contacts** (`related_object_type='contact'`).
- **properties** *only if* useful surfacing inside contact detail.
  Default: no. Stop and ask before adding property notes.

Note behavior:

- internal only (`visibility='all_internal'`).
- plain text, max length matches existing `validateNoteBody`.
- author + timestamp; one activity entry per note (`note.added`).

Not allowed:

- @mentions
- attachments
- rich text / Markdown
- edit / delete affordances
- pinned notes

---

## 11. Search / Filters

Simple search + filter only.

| Page | Behavior |
|---|---|
| Contacts | Single search box over name / phone / email / property address. AND-token semantics. |
| Quotes | Single search box over contact + address. Status filter chip group. |
| Tasks | Status filter + category filter chip groups. |

Not allowed:

- saved views
- advanced filter builders
- global search (across record types)
- tags
- import / export

Pattern reference: Phase 3D's `filterAutomations` + URL-driven debounce.

---

## 12. Phase 4 Do Not Build

Pinned for clarity. These remain off-limits for Phase 4:

- manual contact creation
- manual property creation
- manual lead creation
- manual quote creation
- quote editing
- quote status workflow / accept / void
- jobs
- invoices
- scheduling / calendar
- appointments
- payments
- pipeline board / kanban
- import / export
- simulation / demo data
- customer messaging of any channel
- GHL conversation sync
- AI / context-engine expansion
- dashboard redesign
- top-level Properties section
- placeholder Jobs / Invoices pages
- new database schema (no migrations, no column adds)

The full Phase 1 + Phase 2 + Phase 3 Do-Not-Build lists also remain
in force. If a Phase 4 task touches any of the above, **stop and ask
before changing code.**

---

## 13. Implementation Plan

Phase 4 is split into focused steps. Each ends with a clean
`tsc / test / lint / build` pass and a commit.

### Phase 4A — Docs only

- Create this file
  (`docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`).
- Add Phase 4 pointers to `CLAUDE.md` and `README.md`.
- **No app code, no business logic, no schema changes.**

### Phase 4B — Nav reorganization + Contacts read-only

- Update `src/components/admin/nav-config.ts` to the layout in §3
  (CRM group, Tasks group, move Quote interactions under
  Observability, remove the Business Records group).
- Update `src/components/admin/nav-config.test.ts` for the new
  ordering.
- Build `/admin/contacts` (list + search) and
  `/admin/contacts/[contactId]` (read-only customer hub: customer
  info, properties, related leads, quotes, tasks, notes display,
  activity).
- Add `<Link>`s from `/admin/leads/[leadId]`,
  `/admin/quotes` rows, and `/admin/tasks` rows back to the
  appropriate contact detail.

### Phase 4C — Contact editing + notes + activity

- Contact basic-edit server action (name / phone / email) with
  validation + activity entry on update.
- Contact notes (`related_object_type='contact'`) via existing
  `createNote` + a `addContactNoteAction`.
- Surface activity entries on contact detail.

### Phase 4D — Quote detail + quote list polish

- `/admin/quotes/[quoteId]` detail page (sections in §6).
- Quote list: search + status filter (pure helpers,
  URL-driven debounce like Phase 3D).

### Phase 4E — Task filters + Quote interactions move + record-link polish

- Tasks list: status + category filter chips.
- Quote interactions: verify Observability nav placement, page
  header eyebrow updates, no behavior change.
- Sweep record-link affordances so every page connects back to
  contact detail where appropriate.

### Phase 4F — Phase 4 QA report

- Mirror of `docs/PHASE_3_QA_REPORT.md`.
- Full Definition-of-Done checklist (§14).
- Do-Not-Build audit.
- Security / secrets check.
- Commit `docs/PHASE_4_QA_REPORT.md` and close Phase 4.

### Out of scope for Phase 4

- Anything in §12.
- Any schema migration.
- Any new external provider integration.
- Any change to the public `/q` flow behaviour.
- Any change to the Phase 3 message automation engine / triggers.

If you reach a fork where you think one of these is necessary,
**stop and ask.**

---

## 14. Success Definition

Phase 4 is complete when **every** statement below is true:

- Admin nav matches §3: `Overview / CRM / Tasks / Automations /
  Plugins / Observability / Tools`.
- CRM group contains exactly Contacts + Quotes.
- Tasks lives in its own group.
- Quote interactions lives under Observability.
- `/admin/contacts` list exists with search across name / phone /
  email / address.
- `/admin/contacts/[contactId]` shows customer info + properties +
  related leads + related quotes + related tasks + notes + activity.
- Contact name / phone / email editing works with validation.
- Contact notes can be added; each creates a `note.added` activity.
- `/admin/quotes` supports search + status filter.
- `/admin/quotes/[quoteId]` exists with the sections in §6.
- `/admin/tasks` supports status + category filter.
- No Phase 4 Do-Not-Build item is implemented.
- `npx tsc --noEmit`, `npm run test`, `npm run lint`,
  `npm run build` pass clean.
- `docs/PHASE_4_QA_REPORT.md` exists and signs off the slice.

Phase 1 + Phase 2 + Phase 3 Definition-of-Done items remain in force
and must not regress.

---

## Appendix A — Existing route inventory (entering Phase 4)

For accuracy, these are the `/admin/*` routes Phase 4 reorganizes or
extends. None are deleted.

```
/admin                                  dashboard
/admin/activity                         activity log
/admin/events                           events log
/admin/leads                            leads list (stays; secondary CRM entry)
/admin/leads/[leadId]                   lead detail (Phase 3F)
/admin/plugins                          installed plugins
/admin/plugins/[pluginKey]              plugin detail
/admin/quote-interactions               quote interactions (moves nav group)
/admin/quotes                           quotes list (gains search + filter)
/admin/tasks                            tasks list (gains filters)
/admin/staging-tools                    staging tools (gated)
/admin/auto-quote-test                  test utility
/admin/geo-test                         test utility
/admin/property-data-test               test utility
/admin/rate-limit-test                  test utility
/admin/testing                          testing hub
/admin/testing/message-sms              internal SMS test
/admin/message-automations              automations list
/admin/message-automations/[id]         automation detail
/admin/message-automations/recipients   recipients management
```

Phase 4 adds exactly two new routes:

- `/admin/contacts`
- `/admin/contacts/[contactId]`
- `/admin/quotes/[quoteId]`

(Plus one for the quote detail — three new routes total. No other
routes are added, renamed, or deleted in Phase 4.)
