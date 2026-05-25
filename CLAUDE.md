# CLAUDE.md — Build Rules for Home Service Operating Platform

## Read This First

This file is the highest-priority implementation guide for Claude Code.

The project is a modular home service business operating platform. Crystal Bear Window Cleaning is the first real workspace used to prove the architecture.

Phase 1 is intentionally narrow. Do not overbuild. Do not create future CRM/job/scheduling/payment systems unless explicitly instructed in a later task.

**Phase 2 admin work** (reorganization, shell, design tokens) is governed by `docs/PHASE_2_ADMIN_ORGANIZATION_AND_DESIGN.md`. Every new or migrated `/admin/*` page must use the shared admin shell and shared UI components defined there — no one-off page chrome, no ad-hoc Tailwind blocks, no hardcoded colors outside the semantic token set. Phase 2 must not change business logic or schema; if a task seems to require either, stop and ask first.

**Phase 3 work** (Message Automations + lightweight request handling) is governed by `docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md`. Phase 3 adds an internal-SMS automations area backed by a GoHighLevel adapter, wires quote-flow `task.created` events to it, and ships a lightweight `/admin/leads/[leadId]` detail page with task completion + notes. Customer submission must still succeed if SMS sending fails. Do not build customer-facing automations, email, two-way inbox, conversation sync, AI-written messages, full CRM, scheduling, jobs, invoices, payments, or quote acceptance in Phase 3. See the doc's Do-Not-Build list before extending Phase 3 scope.

**Phase 4 work** (CRM Browser + Light Management) is governed by `docs/PHASE_4_CRM_BROWSER_AND_LIGHT_MANAGEMENT.md`. Phase 4 reorganizes admin nav around Contacts + Quotes, builds `/admin/contacts` (list + customer hub detail), adds a `/admin/quotes/[quoteId]` detail page, light editing for contact name/phone/email, contact notes, simple search/filter on contacts/quotes/tasks, and moves Quote Interactions to Observability. Properties stay attached under Contacts (no top-level page). Do not build manual contact/property/lead/quote creation, quote editing or status workflow, jobs, invoices, scheduling, appointments, payments, pipeline boards, import/export, customer messaging, AI expansion, dashboard redesign, or any new database schema in Phase 4. See the doc's Do-Not-Build list before extending Phase 4 scope.

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
