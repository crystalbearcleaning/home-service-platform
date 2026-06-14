# CLAUDE.md — Build Rules for Home Service Operating Platform

## Read This First

This file is the highest-priority implementation guide for Claude Code.

The project is a modular home service business operating platform. Crystal Bear Window Cleaning is the first real workspace used to prove the architecture.

Phase 1 is intentionally narrow. Do not overbuild. Do not create future CRM/job/scheduling/payment systems unless explicitly instructed in a later task.

**Phase 2 admin work** (reorganization, shell, design tokens) is governed by `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md`. Every new or migrated `/admin/*` page must use the shared admin shell and shared UI components defined there — no one-off page chrome, no ad-hoc Tailwind blocks, no hardcoded colors outside the semantic token set. Phase 2 must not change business logic or schema; if a task seems to require either, stop and ask first.

**Phase 3 work** (Message Automations + lightweight request handling) is governed by `docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md`. Phase 3 adds an internal-SMS automations area backed by a GoHighLevel adapter, wires quote-flow `task.created` events to it, and ships a lightweight `/admin/leads/[leadId]` detail page with task completion + notes. Customer submission must still succeed if SMS sending fails. Do not build customer-facing automations, email, two-way inbox, conversation sync, AI-written messages, full CRM, scheduling, jobs, invoices, payments, or quote acceptance in Phase 3. See the doc's Do-Not-Build list before extending Phase 3 scope.

**Phase 4 work** (CRM Browser + Light Management) is governed by `docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`. Phase 4 reorganizes admin nav around Contacts + Quotes, builds `/admin/contacts` (list + customer hub detail), adds a `/admin/quotes/[quoteId]` detail page, light editing for contact name/phone/email, contact notes, simple search/filter on contacts/quotes/tasks, and moves Quote Interactions to Observability. Properties stay attached under Contacts (no top-level page). Do not build manual contact/property/lead/quote creation, quote editing or status workflow, jobs, invoices, scheduling, appointments, payments, pipeline boards, import/export, customer messaging, AI expansion, dashboard redesign, or any new database schema in Phase 4. See the doc's Do-Not-Build list before extending Phase 4 scope.

**Phase 5 work** (Door Hanger Plugin + Address-Based RentCast Route Generation) is governed by `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md` — read **Appendix A** for the binding scope; it supersedes earlier sections where they conflict. Phase 5 ships the first real marketing-channel plugin (Door Hanger: campaigns, inventory, routes, distribution sessions) under a new **Marketing** nav group (`/admin/marketing/door-hangers`) and adds RentCast-backed route generation from a center address. The simulator architecture remains documented but the **simulation loop is pushed to Phase 6+** — Phase 5 only builds real capability. Create-only first (no edit/delete/archive flows). Do not build the simulation loop, CRM lead generation from door hangers, GPS / maps / route optimization, worker mobile apps, commissions, customer SMS triggers, jobs / invoices / scheduling, data import/export (including printer price-sheet importer), full simulation outcomes / game loop, AI/context-engine expansion, or edit/delete/archive UI in Phase 5. Phase 5 MAY include new schema for the Door Hanger Plugin, but only inside Phase 5B and only if explicitly approved. See the doc's Appendix A Do-Not-Build list before extending Phase 5 scope.

**Phase 6 work** (Simulation Workspace + Save Files Foundation) is governed by `docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md`. Phase 6 builds the safe container for simulation before any gameplay: a separate simulation workspace (`Crystal Bear Simulation`) backed by the existing `businesses` table, a save/run model for playable timelines (name, starting cash, simulated date/time, status), a small workspace switcher + Simulation Mode banner, and the first side-effect guardrail so simulation never triggers real SMS / email / payment / production-integration calls. Phase 6A is **docs only**. Do not build Door Hanger Hang 1 / Hang Route gameplay, simulated quote requests, CRM lead/quote/task generation from simulation, delayed customer responses, message automation outcomes, GPS / maps / route execution, route optimization, worker apps, jobs / invoices / scheduling, customer messaging, the full game loop, the full plugin builder / marketplace, data import/export, AI/context-engine expansion, or edit/delete/archive flows on save files in Phase 6. Phase 6 MAY add a `businesses.is_simulation` boolean and a `simulation_runs` table, but only inside Phase 6B/6C and only if explicitly approved. See §10 of the doc before extending Phase 6 scope.

**Phase 7 work** (Simulation Play Surface + Door Hanger Simulation Adapter) is governed by `docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md`. Phase 7 builds the first playable simulation loop on top of the Phase 6 workspace + save-file foundation: a new `/admin/simulation/play` page gated by simulation workspace + active save, the Door Hanger Plugin's first **simulation adapter** (Start simulated route / Hang 1 / Hang custom / Hang route / Finish), session-level `seconds_per_hanger` (default 30), route-stop based execution when stops exist (count-only fallback otherwise), per-action inventory decrement, per-action simulated-time advance, route + session completion timestamps, and a new `simulation_activity` feed scoped to the active save. Phase 7A is **docs only**. Do not build CRM outcome generation (quote requests, contacts, leads, quotes, tasks, jobs, notes, issues, notifications), delayed customer responses, message automation outcomes, customer messaging, real worker mobile app, GPS / maps / pin / drawing UI, route cooldown filtering, jobs / invoices / scheduling, the full game economy, plugin builder / marketplace, data import/export, AI/context-engine expansion, edit/delete/archive flows on simulation_runs / sessions / routes / designs / campaigns / simulation_activity, multi-active sessions, or any change to the public `/q` flow in Phase 7. Phase 7 MAY add a `simulation_activity` table and a small set of additive nullable columns on `door_hanger_distribution_sessions` / `door_hanger_routes` / `door_hanger_route_stops`, but only inside Phase 7B and only if explicitly approved. See §§12 + 14 of the doc before extending Phase 7 scope.

**Phase 8 work** (Door Hanger Route Map + Cooldown Foundation) is governed by `docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md`. Phase 8 turns saved Door Hanger routes into a real map-first route workspace at `/admin/marketing/door-hangers/routes` (alongside the existing dashboard, not replacing it): Google Maps base layer, RentCast routes drawn as convex-hull polygons over their stops, manual routes as circles when a center+radius exists, a route details overlay (route name, campaign, source, status, stop counts, cooldown counts, last completed, next eligible) opened by clicking a polygon, a routes table overlay with a "Focus on map" action, optional reuse of the Phase 5C RentCast generator as a "Generate" overlay (only if it extracts cleanly), and a new route-level `cooldown_days` column (default 60) feeding cooldown calculations against `now()` in real workspaces or active save's `simulated_current_at` in simulation workspaces. Phase 8A is **docs only**. Do not build GPS tracking, live worker app, route optimization, turn-by-turn routing, manual polygon drawing or editing, lasso/bulk completion, manual pin completion, cooldown filtering/exclusion inside route generation (display only), cross-route property dedupe, CRM lead/job/outcome generation from door hangers, simulation outcomes, message-automation outcomes, jobs/invoices/scheduling, full game economy, plugin builder/marketplace, data import/export, AI/context-engine expansion, public `/q` changes, edit/delete/archive flows, or new simulation actions in Phase 8. Phase 8 MAY add a single `door_hanger_routes.cooldown_days integer not null default 60` column, but only inside Phase 8B and only if explicitly approved. See §§14–15 of the doc before extending Phase 8 scope.

**Phase 9 work** (Jobs + Job Line Items Foundation) is governed by `docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md`. Phase 9 shifts back to core CRM and adds the Job — a Jobber-style work order — as the next foundational core object: a new `jobs` table (business_id, contact_id, optional property_id, optional quote_id, title, summary, status enum `draft|unscheduled|scheduled|in_progress|completed|canceled`, source `manual|quote`, basic scheduling fields `scheduled_start_at / scheduled_end_at / arrival_window_label`, snapshot `estimated_total_cents`), a new `job_line_items` child table (`service_id` nullable, name, description, quantity, `unit_price_cents`, `total_cents`, `source` `quote|service|custom`), quote-to-job conversion that snapshots the quote's line items into job_line_items (job is a snapshot, not a live mirror — later quote edits do not silently change the job), manual job creation from contact/property with both catalog-backed and custom line items, a new **Jobs** entry under the CRM nav group, `/admin/jobs` list + `/admin/jobs/[jobId]` read-only detail in 9C and edits in 9D, status changes via a simple select, and "job created" activity rows. Phase 9A is **docs only**. Do not build the full scheduling calendar, crew/technician assignment, conflict detection, recurring visits, a visits/appointments table, technician mobile app, on-the-way/arrival workflows, route optimization for jobs, real-time field tracking, invoices, invoice line items, payments/deposits/refunds, payment processor integration, taxes/discounts/surcharges, bundled-package pricing, customer notifications on job creation or status change (real or simulated), message-automation outcomes from job events, job reminders, quote acceptance/payment portal, customer accounts or customer-facing job views, public `/q` changes, simulation-driven job generation, plugin builder/marketplace, data import/export, AI/context-engine expansion, or edit/delete/archive flows on jobs/job_line_items beyond what Phase 9D ships (status change, line item add/remove/edit, scheduling field edit). Phase 9 MAY add the `jobs` + `job_line_items` tables, but only inside Phase 9B and only if explicitly approved. See §§18–19 of the doc before extending Phase 9 scope.

**Phase 10 work** (Job Scheduling Foundation) is governed by `docs/PHASE_10_JOB_SCHEDULING_FOUNDATION.md`. Phase 10 sits on top of Phase 9 Jobs and turns the existing scheduling columns (`scheduled_start_at`, `scheduled_end_at`, `arrival_window_label`, `status='scheduled'`) into a real Jobber-style schedule surface: a new `/admin/schedule` page with a week calendar (Mon–Fri, visible 8 AM–6 PM band, week navigation), an unscheduled-jobs panel listing `draft` / `unscheduled` jobs with `scheduled_start_at IS NULL`, scheduled job cards placed by start/end, click-to-schedule modal, reschedule modal (preloaded with current values), unschedule action (clears all three scheduling fields and flips status to `unscheduled`), basic same-business overlap warning (soft warning, not a hard block, since no crew assignment exists yet), and links from cards to `/admin/jobs/[jobId]`. Phase 10A is **docs only**. Do not build drag/drop scheduling, day/month/agenda views, crew/technician assignment, crew capacity, conflict hard-blocking, configurable business hours, route optimization, drive-time calculations, Google Calendar sync (or any external calendar sync), customer reminders/texts/emails on schedule events, message-automation outcomes from schedule events, recurring jobs/visits, a visits/appointments table, multi-day job row splitting, invoices, payments, quote acceptance/payment portal, customer-facing schedule views, public `/q` changes, simulation-driven scheduling, AI/context-engine expansion, plugin builder/marketplace, data import/export, or edit/delete/archive flows on jobs beyond the three scheduling actions. Phase 10 must **not** add a new database table or a new column on `jobs` — it reuses the Phase 9B scheduling columns. See §§15–17 of the doc before extending Phase 10 scope.

**Phase 11 work** (Invoice + Payment Recording Foundation) is governed by `docs/PHASE_11_INVOICE_AND_PAYMENT_RECORDING_FOUNDATION.md`. Phase 11 adds the billing snapshot layer after Jobs and Schedule: three new tables (`invoices` with `business_id`, `contact_id`, `property_id` nullable, `job_id` not null, status enum `draft|unpaid|paid|void`, source `job_completion|manual`, snapshot `subtotal_cents` / `total_cents` / `amount_paid_cents` / `balance_cents`, `paid_at` nullable, `receipt_sent_at` nullable; `invoice_line_items` with `job_line_item_id` nullable, name, quantity, `unit_price_cents`, `total_cents`, source `job|custom`; `invoice_payments` with `amount_cents`, payment method enum `cash|check|card|zelle|other`, `paid_at`, notes nullable), the Jobber-style **Complete Job → Create Invoice → Record Payment → Mark Receipt Sent** workflow (Complete Job confirmation modal copies `job_line_items` into `invoice_line_items` as a snapshot — later job edits do not silently change the invoice; Mark Paid modal records a payment row, recomputes summary fields, flips status to `paid` and sets `paid_at` when balance hits zero; Mark Receipt Sent stores a manual timestamp), a new **Invoices** entry under the CRM nav group, `/admin/invoices` list + `/admin/invoices/[invoiceId]` read-only detail with totals + payments table, job-detail integration that surfaces existing invoices and discourages duplicates, and soft-fail activity rows. Phase 11A is **docs only**. Do not build online payment processing, Stripe/Square integration, payment links, customer payment portal, automatic receipt sending, SMS/email receipt delivery, message-automation outcomes from invoice/payment/receipt events, customer-facing invoice or receipt pages, PDF generation, taxes, discounts, deposits, refunds, QuickBooks/Xero/accounting sync, recurring invoices, recurring jobs, full scheduling changes, crew/technician assignment, route optimization, public `/q` changes, simulation-driven invoicing or payment generation, AI/context-engine expansion, plugin builder/marketplace, data import/export, multi-currency, or edit/delete/archive flows on invoices/invoice_line_items/invoice_payments beyond what Phase 11D/E ships (Complete Job creates an invoice; Mark Paid inserts a payment; Mark Receipt Sent updates a timestamp). Phase 11 MAY add the `invoices` + `invoice_line_items` + `invoice_payments` tables, but only inside Phase 11B and only if explicitly approved. See §§21–22 of the doc before extending Phase 11 scope.

**Phase 12 work** (Revenue / Reporting Foundation) is governed by `docs/PHASE_12_REVENUE_REPORTING_FOUNDATION.md`. Phase 12 adds owner-facing visibility into cash, production, pipeline, unpaid money, and completed work now that Quote → Job → Schedule → Invoice → Payment all exist: a new **Reporting Snapshot** section at the top of the existing `/admin` Overview page (fixed Today / This Week / This Month cards, no range tabs), a new top-level `/admin/reports` page (range tabs Today / This Week / This Month / Last 30 Days, six cards — Paid Revenue, Invoiced Revenue, Unpaid Balance, Completed Job Value, Scheduled Job Value, Quote Value Created — and three tables — Unpaid Invoices, Recent Payments, Completed Jobs), a new **Reports** entry in the sidebar (default placement: Overview group, after Dashboard), and a reusable reporting core under `src/core/reports/` (`date-ranges`, `totals`, `admin-data`, `display`) so the Overview snapshot and the Reports page share one canonical set of metric definitions and loaders. Phase 12 uses a lower-overhead workflow: **Phase 12A is docs only** (this setup doc); **Phase 12B builds the entire phase in one pass + QA report + Manual App Test Checklist** — no per-step subphases. Do not build charts, custom date picker, CSV / PDF export, saved reports, report builder, forecasting, goals, AI insights, context engine, accounting sync, QuickBooks / Xero, taxes, refunds, deposits, online payments, real receipt sending, customer-facing report pages, public `/q` changes, scheduled report emails, SMS / email notifications, message-automation outcomes from reporting, crew payroll reports, technician performance reports, route reports, marketing attribution beyond simple Quote Value Created, simulation projections / what-if reports, or new schema (no migrations, no new tables, no new columns). The completed-job range filter falls back to `jobs.updated_at` when `status='completed'` because Phase 9 did not add a `jobs.completed_at` column; this is a documented known limitation, **not** a license to add the column in Phase 12. See §§11–12 + §14 of the doc before extending Phase 12 scope.


## Phase 1 Goal

Build the smallest working vertical slice that proves the platform architecture:

1. Admin logs in.
2. Crystal Bear workspace is seeded.
3. Public Customer Quote App Surface is accessible.
4. Visitor selects a Google-confirmed address.
5. System checks service area by city.
6. System retrieves property data from RentCast.
7. Window Cleaning Auto-Quote Plugin calculates quote options.
8. Quote page displays selectable quote cards.
9. Visitor selects option/add-ons.
10. Visitor clicks “Schedule My Cleaning.”
11. Inline contact form appears.
12. Visitor submits name, phone, and email.
13. Core creates Contact, Property, Lead, and immutable Quote snapshot.
14. Plugin interaction is marked converted.
15. Admin dashboard shows quote interaction/submission, activity, and task.

## Tech Stack

Use:

- Next.js App Router
- TypeScript
- Supabase Postgres
- Supabase Auth
- Supabase RLS
- Tailwind CSS
- shadcn/ui
- Vercel
- Google Places / Geocoding API
- RentCast API

Do not change the stack without explicit approval.

## Core Architecture Rules

### 1. Modular Monolith

Phase 1 is a modular monolith.

Use clear internal module boundaries:

```text
/src
  /app
  /core
    /auth
    /business
    /permissions
    /app-surfaces
    /plugin-registry
    /action-registry
    /ui-registry
    /events
    /activity
    /geo
    /property-data
    /pricing
    /contacts
    /properties
    /leads
    /quotes
    /tasks
    /issues
    /notes
  /plugins
    /window-cleaning-auto-quote
    /customer-quote-sales-page
  /components
  /lib
/supabase
  /migrations
  /seed
/docs
```

Plugins live in `/src/plugins` for Phase 1 but should be structured like future extractable packages.

### 2. Core vs Plugins

Core owns stable shared infrastructure and official business records.

Core owns:

- businesses
- users/memberships/roles/permissions
- app surfaces
- custom domains
- plugin registry
- service areas
- services
- service plans
- pricing data
- contacts
- properties
- leads
- quotes
- tasks
- events
- activities
- notes
- issues
- geo provider abstraction
- property data provider abstraction

Plugins own specialized behavior and interaction/session data.

Phase 1 plugins:

- Window Cleaning Auto-Quote Plugin
- Customer Quote / Sales Page Plugin

Do not mix responsibilities:

- Auto-Quote Plugin calculates quote data.
- Customer Quote / Sales Page Plugin owns customer-facing quote interaction flow and anonymous interaction tracking.

### 3. Business-Owned Records

Every business-owned table must include `business_id`.

Never create business data without assigning the correct `business_id`.

Every query for authenticated admin data must be scoped to the active business.

### 4. Public Writes

Public quote visitors must not write directly to Supabase tables.

Public quote page must call controlled server actions/API routes only.

Good:

```text
/customer quote page
  → server action submitQuoteRequest()
  → validates input
  → resolves business/app surface
  → creates records safely
```

Bad:

```text
Browser directly inserts into contacts/leads/quotes
```

### 5. Important Writes Go Through Core Actions

Important core record creation/status changes must go through registered/centralized core actions.

Examples:

- create contact from quote request
- create property from quote request
- create lead from quote request
- create quote snapshot
- create admin task
- record activity
- flag issue

Do not scatter direct writes across UI components.

## Phase 1 Do Not Build List

Do not build any of these in Phase 1:

- full CRM
- manual lead creation
- manual quote creation
- jobs
- appointments
- scheduling calendar
- invoices
- payments
- receipts
- recurring service agreements
- job pool
- AI agents
- full Context Engine
- GoHighLevel integration
- SMS sending
- SMS receiving
- email sending
- Door Hanger Plugin
- Technician Plugin
- full workflow builder
- full app builder
- public plugin marketplace
- plugin update approval system
- full onboarding
- data importer
- customer photo uploads
- file/attachment system
- advanced reporting
- goals/strategies/campaigns/outcomes/attribution engine
- reviewed/followed-up/archived CRM workflow
- self-serve domain setup wizard
- full pricing editor
- quote acceptance
- job creation from quote

If tempted to build one of these because “it would be useful,” stop.

## Phase 1 Data Boundary

Before contact form submission:

- Store only plugin-owned anonymous quote interaction data.
- Do not create core Contact.
- Do not create core Property.
- Do not create core Lead.
- Do not create core Quote.

After contact form submission:

- Create Contact.
- Create Property.
- Create Lead.
- Create Quote snapshot.
- Mark quote interaction converted.
- Create admin task.
- Create activities/events.

## Customer Quote Page Requirements

The public quote page must be no-login.

Flow:

1. Customer selects confirmed Google address.
2. Do not allow free-typed unconfirmed address to generate quote.
3. Check city/locality against service areas:
   - Boynton Beach
   - Boca Raton
   - Delray Beach
4. If outside service area, do not generate quote. Show fallback and optionally collect contact info.
5. If inside service area, call RentCast.
6. If RentCast/property data is missing, show manual quote fallback:
   - “We don’t have your home in our system yet! Enter your contact information and our team will send you a quote as soon as it’s ready.”
7. If property data exists, show quote options.
8. Show three quote cards:
   - One-Time Clean
   - Every 6 Months
   - Every 3 Months — Recommended
9. Do not preselect any option.
10. Disable the scheduling CTA until a quote option is selected.
11. Show interior cleaning as optional add-on:
   - “Add Interior Window Cleaning to This Cleaning: +$X”
12. Recurring options must say “per visit.”
13. Show free screen cleaning as included.
14. Show short trust section.
15. Show phone number as secondary contact option.
16. CTA: “Schedule My Cleaning.”
17. After CTA click, reveal inline contact form.
18. Require:
   - name
   - phone
   - email
19. After submit, show confirmation with selected option, total, 30-day validity, and phone number.

Do not send SMS or email confirmation in Phase 1.

## Quote Rules

Phase 1 does not have formal quote acceptance.

Customer action means:

```text
customer_intent = schedule_requested
```

Not:

```text
quote.accepted
```

Do not create jobs, appointments, recurring agreements, invoices, or payments.

Quotes are immutable price snapshots.

Store:

- selected option
- all options shown
- selected add-ons
- selected total
- line items snapshot
- price snapshot
- calculation snapshot
- property snapshot
- source plugin key/version
- expires_at

Default expiration: 30 days.

Existing quotes must not recalculate if pricing rules change later.

Expired quotes remain visible internally but are not customer-acceptable without a new quote.

## Pricing Rules

Core owns pricing data.

The Auto-Quote Plugin uses core pricing data but does not own pricing data.

Phase 1 may seed pricing data in database/config.

Do not build a pricing editor in Phase 1.

Seed at minimum:

- minimum price: 199
- one-time exterior rule
- 6-month exterior rule
- 3-month exterior rule
- interior add-on rule

The customer-facing page should not emphasize the $199 minimum. The calculation breakdown can show when the minimum was applied.

## Google Geo Rules

Use real Google API in Phase 1.

Implement core geo provider abstraction:

```text
core.geo.autocompleteAddress()
core.geo.getPlaceDetails()
core.geo.normalizeAddress()
core.geo.matchServiceArea()
```

Google is the first provider.

Do not let plugins call Google directly.

Autocomplete requirements:

- debounce typing
- restrict browser key by domain
- request place details only after selection
- do not call RentCast until address is selected/confirmed

## RentCast Rules

Use real RentCast API in Phase 1.

Implement core property data provider abstraction:

```text
core.propertyData.lookupByAddress()
core.propertyData.enrichProperty()
```

RentCast is the first provider.

Do not let plugins call RentCast directly.

RentCast key must stay server-side only.

Only call RentCast after:

1. confirmed Google address selection
2. normalized address
3. service area check passes

## Service Area Rules

Phase 1 service area match is city/locality only.

Seed cities:

- Boynton Beach
- Boca Raton
- Delray Beach

Do not build ZIP/radius/polygon/community matching in Phase 1.

If outside area:

- Store plugin-owned interaction.
- Do not create core lead unless contact form is submitted.
- If submitted, create lead with `status = service_area_review_needed`.
- Create admin task: “Review out-of-area quote request.”

## Plugin System Rules

Phase 1 plugin system should include:

- plugin manifest
- plugin id/key/name/version
- installed/enabled/disabled/error status
- declared permissions displayed in admin
- plugin detail page
- plugin UI registrations
- plugin analytics widgets
- plugin action registrations if useful
- basic plugin error isolation

Do not build:

- public marketplace
- plugin creator accounts
- plugin update checker
- permission approval wizard
- permission diffing
- rollback system

## Phase 1 Plugins

### Window Cleaning Auto-Quote Plugin

Responsibilities:

- receive normalized address/property data
- read core pricing data
- calculate:
  - one-time exterior
  - 6-month exterior
  - 3-month exterior
  - interior add-on
- enforce minimum price
- return structured quote options
- return calculation breakdown
- return warnings/errors

Does not own:

- sales page
- anonymous interaction tracking
- customer contact capture
- lead/quote creation

### Customer Quote / Sales Page Plugin

Responsibilities:

- render public quote flow
- call core geo/property data services through server actions
- call Auto-Quote Plugin
- store anonymous quote interactions
- capture selected option/add-ons
- reveal inline contact form
- submit quote request through controlled action
- mark interaction converted
- register admin analytics widgets
- register plugin detail UI

## Admin Phase 1 Requirements

Admin is a review/testing dashboard, not a CRM.

Admin should show:

- quote app interactions
- submitted quote requests
- generated quote data
- property/address data
- created contacts/leads/quotes from quote page only
- quote-related admin tasks
- plugin status/version/permissions
- plugin analytics widgets
- issues/bugs
- simple activity list
- staging reset button

Do not build manual lead creation or pipeline management.

## Tasks

Phase 1 task queue is simple.

Create tasks for:

- schedule request
- manual quote needed
- out-of-area review
- failed property lookup
- issue review

Do not build advanced Task Engine, dependencies, workflow steps, AI priority, claiming, locking, or outcome learning in Phase 1 unless explicitly asked later.

## Events and Activity

Phase 1 has simple Event Bus foundation and simple Activity list.

Events are machine-readable.

Activities are human-readable.

Phase 1 event examples:

- `quote_app.address_entered`
- `auto_quote.quote_generated`
- `quote_app.contact_submitted`
- `quote_app.schedule_requested`
- `lead.created`
- `quote.created`
- `task.created`
- `issue.flagged`

Activities should summarize these events for Admin.

Do not build advanced event replay, event monitoring dashboard, or full timeline UI in Phase 1.

## Issues / Bugs

Build lightweight issue tracking for QA/debugging.

Issue types:

- quote_calculation_issue
- property_data_missing
- geocoding_failed
- plugin_ui_error
- plugin_action_error
- customer_page_bug
- other

This is not business learning.

Software correctness is handled through tests, logs, and bug fixes.

The Context Engine should later learn from business outcomes, not from broken functions.

## Notes

Build lightweight notes only if needed for admin review.

Notes are separate from messages.

No files/attachments in Phase 1.

No customer uploads.

## Messaging

Do not build live messaging in Phase 1.

Allowed:

- message/conversation schema placeholders if useful
- provider interface docs

Not allowed:

- GoHighLevel API code
- SMS send/receive
- email send
- webhooks
- conversation sync
- AI auto-responder

Phase 2 may add GoHighLevel as the first core SMS/conversation provider adapter.

## AI and Context Engine

Do not build AI agents in Phase 1.

Do not build full Context Engine in Phase 1.

Allowed:

- simple business settings/context facts
- clean event/activity data that future Context Engine can consume
- documentation of future AI/context phase

The AI/Context system will be its own major ongoing phase.

## Security Rules

Use Supabase Auth from the beginning.

Admin routes require login.

Customer quote page is public.

Use basic Supabase RLS from the beginning.

Minimum RLS rules:

- authenticated users can only access records for businesses where they have active membership
- public visitors have no direct table access
- server-side actions use safe service role patterns where needed
- never expose RentCast key to browser

Use environment variables.

Required examples:

```text
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_SERVER_API_KEY=
RENTCAST_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit `.env`.

Create `.env.example`.

## Rate Limiting / Spam Protection

Public quote actions must be protected.

Phase 1 protections:

- rate limit by IP
- validate input server-side
- limit repeated requests for same address/IP
- block obvious bot/spam submissions
- log failed/blocked attempts

CAPTCHA is not required unless needed later.

## Staging Reset Button

Build a staging-only data reset button.

It clears quote-flow test data while preserving setup.

Delete:

- quote page interactions
- fake contacts from quote tests
- fake properties from quote tests
- fake leads from quote tests
- fake quotes from quote tests
- quote-related admin tasks
- quote-related activity entries
- quote-related issues/bug flags, optional

Preserve:

- Crystal Bear workspace
- users
- roles
- app surfaces
- installed plugins
- plugin settings/config
- services
- service plans
- pricing rules
- branding/config
- domain mapping

Never expose this reset button in production.

## Testing Requirements

Phase 1 should include basic automated tests for:

- core action creates Contact / Property / Lead / Quote correctly
- plugin manifest loads
- plugin permissions register/display
- Auto-Quote Plugin returns expected quote structure
- public quote submission goes through server action/API route
- business-owned records include `business_id`
- important actions publish events/activity
- RLS/membership checks prevent cross-business access
- anonymous interactions do not create core records before contact submission
- converted interactions create core records after contact submission

## Definition of Done

Phase 1 is done when:

- Admin can log in with Supabase Auth.
- Crystal Bear workspace is seeded.
- Customer Quote App Surface is accessible on staging/custom domain.
- Customer can select a Google-confirmed address.
- Manually typed/unconfirmed addresses cannot generate quote.
- System checks service area by normalized city.
- System gets property data from RentCast.
- Auto-Quote Plugin calculates three exterior quote options.
- Quote page shows option cards, recommended 3-month plan, no default selection, interior add-on toggle, free screen cleaning, trust section, phone number, and soft scheduling copy.
- Customer selects option/add-on and clicks Schedule My Cleaning.
- Inline contact form appears.
- Customer submits name, phone, email.
- Core creates Contact, Property, Lead, and immutable Quote snapshot.
- Quote expiration defaults to 30 days.
- Plugin interaction is marked converted.
- Admin dashboard shows quote interaction/submission.
- Admin task is created for schedule request or manual quote fallback.
- Simple activity list records major events.
- Plugin detail page shows status, version, permissions, basic analytics, and issues.
- Basic plugin UI/action error isolation exists.
- Staging reset button clears quote-flow test data.
- Basic automated tests pass.
- Public quote writes go through controlled server actions/API routes.
- Basic rate limiting/spam protection exists.
- No Phase 1 Do Not Build items are implemented.

## Implementation Style

Write clean, boring, maintainable code.

Prefer:

- typed server actions / API route handlers
- clear module boundaries
- small functions
- explicit input validation
- predictable database writes
- reusable service functions
- readable component structure
- good error messages
- no hidden side effects in React components

Avoid:

- giant components
- direct database writes from client public pages
- hardcoded API keys
- plugin-to-plugin direct coupling
- future feature creep
- building unrequested systems
- clever abstractions that obscure the Phase 1 flow

## Ask Before Building

Ask for clarification before implementing anything that touches:

- jobs
- scheduling
- invoices
- payments
- SMS/email
- GoHighLevel
- AI agents
- data importer
- workflow builder
- public marketplace
- full CRM
- files/uploads
- customer accounts/login
- quote acceptance/job creation
