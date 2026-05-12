# PROJECT_BLUEPRINT.md

# Home Service Operating Platform — Master Project Blueprint

## 1. Product Vision

The product is a modular business operating platform for home service businesses.

Crystal Bear Window Cleaning is the first real business/workspace used to prove the platform before expanding to other home service companies.

The long-term vision is an operating system where core business records, app surfaces, plugins, tasks, workflows, reporting, and eventually AI agents all work together through clean shared architecture.

The platform should eventually support:

- Admin app surfaces for owners, managers, and office staff.
- Role app surfaces for door hangers, technicians, sales reps, and other workers.
- Customer app surfaces for quotes, scheduling requests, approvals, invoices, agreements, reviews, and other public flows.
- Plugins that add specific business functionality without bloating core.
- AI agents and a Context Engine that learn from business data, messages, activity, outcomes, and historical patterns over time.

Phase 1 should **not** attempt to build the whole platform.

Phase 1 proves the architecture through one narrow, testable vertical slice:

> Public Customer Quote App Surface → Auto-Quote Plugin → Contact/Property/Lead/Quote creation → Admin review dashboard.

---

## 2. Core Philosophy

### Core vs Plugins

Core should contain stable reusable infrastructure that many plugins and app surfaces need.

Plugins should contain specialized workflows, industry-specific logic, business-specific behavior, plugin-owned analytics, and feature-specific data.

Rule:

> If many plugins need it, it belongs in core. If mainly one workflow or feature needs it, it belongs in a plugin.

Core owns official shared business records.

Plugins can own specialized plugin records.

Examples:

Core owns:

- businesses/workspaces
- users/memberships/roles/permissions
- app surfaces
- custom domains
- plugin registry
- service areas
- services
- service plans
- pricing records
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

Plugins own:

- anonymous quote interactions
- plugin analytics data
- plugin UI widgets
- plugin-specific session/interaction records
- future route/session/checklist data where applicable

### Plugins Communicate Through Core

Plugins should not directly depend on other plugins unless explicitly approved.

Plugins communicate through core systems:

- Action Registry
- Event Bus
- UI Registry
- Data Dictionary / Schema Registry
- Record Links
- Activity Timeline
- Permissions
- Context Engine later

---

## 3. Phase 1 Goal

Phase 1 should prove the smallest useful vertical slice.

Phase 1 success flow:

```text
Admin logs in
↓
Crystal Bear workspace exists
↓
Customer Quote App Surface is public
↓
Visitor selects a Google-confirmed address
↓
System checks service area by normalized city
↓
System retrieves property data from RentCast
↓
Window Cleaning Auto-Quote Plugin calculates quote options
↓
Customer sees quote option cards
↓
Customer selects a quote option and optional interior add-on
↓
Customer clicks “Schedule My Cleaning”
↓
Inline contact form appears
↓
Customer submits name, phone, email
↓
Core creates Contact, Property, Lead, Quote
↓
Plugin interaction is marked converted
↓
Admin sees the quote interaction/submission, task, activity, plugin data, and issue/debug information
```

Phase 1 should be testable in staging before production use.

---

## 4. Tech Stack

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

Phase 1 is a modular monolith.

Suggested repo structure:

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
  /decisions
CLAUDE.md
schema.md
```

Plugins live inside `/src/plugins` in Phase 1, but should be structured so they could become extractable packages later.

---

## 5. App Surfaces

An app surface is a user-facing app experience powered by core and plugins.

### Admin App Surface

The Admin App is the internal control center.

For Phase 1, Admin is **not** a full CRM.

Phase 1 Admin is a review/testing dashboard for:

- quote interactions
- submitted quote requests
- generated quote data
- property/address data
- created quote-page leads/quotes
- admin tasks from quote requests/manual quote fallbacks
- plugin status/version/permissions
- plugin analytics widgets
- issues/bugs
- simple activity list
- staging data reset

### Customer App Surface

The Customer Quote App Surface is public/no-login.

For Phase 1, it supports:

- custom domain mapping
- Google-confirmed address selection
- city-based service area check
- RentCast property lookup
- quote cards
- option/add-on selection
- contact capture
- scheduling request submission
- on-page confirmation

### Role App Surfaces

Role app surfaces are future systems.

Examples:

- Door Hanger App
- Technician App
- Sales App

Do not build role app surfaces in Phase 1.

---

## 6. Domains and Routing

Customer-facing app surfaces should support custom domains.

Phase 1 includes custom domain mapping for customer-facing app surfaces only.

Examples:

```text
quote.crystalbear.com
crystalbearquote.com
```

These map to:

```text
Business: Crystal Bear
App Surface: Customer Quote App Surface
```

Admin/role app custom domains can come later.

Phase 1 custom domain setup can be manual.

Phase 1 should include:

- `app_surface_domains` table/model
- domain → business/app surface resolution
- manual setup notes
- seeded or manually inserted mapping

Do not build:

- self-serve domain setup wizard
- automated DNS verification UI
- domain health checker

---

## 7. Users, Roles, Permissions, and Auth

Use Supabase Auth from the beginning.

Admin routes require login.

Customer quote page is public/no-login.

Use basic RLS from the beginning.

Minimum security rules:

- every business-owned record has `business_id`
- authenticated admin can access only records for businesses where they have active membership
- public visitors cannot directly access/write database tables
- public quote submissions go through controlled server actions/API routes

Roles provide default app surface access and permissions.

Permissions are capability-based and can include scope.

Examples:

```text
view_quotes: all_business
view_tasks: all_business
view_properties: all_business
manage_plugins: all_business
```

Phase 1 only needs Owner/Admin, but architecture should allow more roles later.

Do not build full user invitation/onboarding workflow in Phase 1 unless needed.

---

## 8. Plugin Architecture

Phase 1 has an internal plugin manager/library, not a public marketplace.

Each plugin should have:

- manifest
- version
- permissions
- settings/config where needed
- actions
- UI registrations
- events
- plugin-owned tables where needed
- admin widgets
- docs
- safe-mode/error handling

Phase 1 plugin system includes:

- plugin definitions
- installed/enabled/disabled/error status
- plugin detail page
- declared permissions visible in Admin
- plugin version tracking
- plugin UI/action error isolation

Do not build:

- public plugin marketplace
- plugin creator accounts
- plugin update approval flow
- permission diffing
- rollback system
- marketplace payments/reviews

---

## 9. Phase 1 Plugins

Phase 1 includes two plugins.

### 1. Window Cleaning Auto-Quote Plugin

Purpose:

> Calculate quote data.

Responsibilities:

- receive normalized address/property data
- use core Property Data Provider data
- use core pricing data
- calculate one-time exterior quote
- calculate 6-month exterior quote
- calculate 3-month exterior quote
- calculate interior add-on
- enforce minimum price
- return structured quote options
- return calculation breakdown
- return warnings/errors

It does **not** own:

- sales page UI
- anonymous interaction tracking
- customer contact capture
- core record creation

### 2. Customer Quote / Sales Page Plugin

Purpose:

> Own the customer-facing quote experience.

Responsibilities:

- render quote page flow
- track anonymous quote interactions
- call Auto-Quote Plugin
- capture selected option/add-ons
- reveal inline contact form
- submit quote request through controlled server action/API route
- mark interaction converted
- register admin analytics widgets
- register quote app surface UI
- register plugin detail UI

It does **not** own:

- official Contact/Property/Lead/Quote records
- core pricing data
- Google/RentCast provider logic

---

## 10. Core Data Model Scope

Phase 1 implements:

- businesses
- user profiles
- business memberships
- roles/permissions foundation
- app surfaces
- app surface domains
- plugin registry
- installed plugins
- plugin UI/action registrations
- data dictionary/schema registry foundation
- business settings/simple context
- service areas
- services
- service plans
- pricing rules
- contacts
- properties
- leads
- quotes
- quote page interactions plugin table
- tasks
- events
- activities
- notes, lightweight
- issues/bugs
- optional message/conversation placeholder schema
- record links

Phase 1 defers:

- jobs
- appointments
- scheduling calendar
- invoices
- payments
- receipts
- recurring service agreements
- job pool
- full CRM
- full workflow engine
- door hanger plugin
- technician plugin
- GoHighLevel
- SMS/email
- data importer
- AI agents
- full Context Engine
- files/attachments
- goals/strategies/campaigns/outcomes/attribution
- advanced reporting

---

## 11. Services, Plans, and Pricing

Core owns service and pricing data.

The Auto-Quote Plugin reads core pricing and calculates quotes.

Seed services:

- Exterior Window Cleaning
- Interior Window Cleaning

Exterior is the base service.

Interior is an optional add-on for the cleaning being scheduled now.

Screen cleaning is included/free and shown as a value point.

Seed service plans:

- One-Time Clean
- Every 6 Months
- Every 3 Months

Every 3 Months is visually recommended but not selected by default.

Core pricing should include:

- minimum price = 199
- one-time exterior pricing rule
- 6-month exterior pricing rule
- 3-month exterior pricing rule
- interior add-on pricing rule

Do not build full pricing editor in Phase 1.

### Quote Snapshots

Quotes are immutable price snapshots.

When a quote is created, store:

- all quote options shown
- selected option
- selected add-ons
- selected total
- line items snapshot
- price snapshot
- calculation snapshot
- property snapshot
- source plugin/version
- expiration date

Default quote expiration: **30 days**.

Existing quotes do not recalculate if pricing rules change.

Expired quotes remain visible internally but are not customer-acceptable without generating a new quote later.

---

## 12. Customer Quote Page UX

The Phase 1 quote page should be extremely simple.

Hardcode/seed quote page copy and branding in code/config.

Do not build admin-editable copy/theme settings UI in Phase 1.

### Address Step

Customer must select a confirmed Google autocomplete address.

Do not allow manually typed/unconfirmed addresses to generate quote.

If not selected from Google dropdown:

```text
Please select your address from the dropdown so we can generate your quote.
```

### Service Area Check

Phase 1 service area matching uses city/locality only.

Allowed cities:

- Boynton Beach
- Boca Raton
- Delray Beach

If outside area, do not generate an instant quote.

Show fallback:

```text
Looks like this address may be outside our current service area. Enter your contact information and our team will let you know if we can help.
```

If contact info is submitted, create lead with:

```text
status = service_area_review_needed
```

Create task:

```text
Review out-of-area quote request
```

### Property Data Missing

If RentCast does not return needed property data/square footage, do not ask the customer to estimate square footage in Phase 1.

Show fallback:

```text
We don’t have your home in our system yet! Enter your contact information and our team will send you a quote as soon as it’s ready.
```

If contact info is submitted, create lead with:

```text
status = needs_manual_quote
```

Create task:

```text
Prepare manual quote
```

### Quote Cards

Show all three quote options as selectable cards:

- One-Time Clean
- Every 6 Months
- Every 3 Months — Recommended

No option is selected by default.

The CTA is disabled until the customer selects an option.

Recurring options must say “per visit.”

### Interior Add-On

Show interior cleaning as an optional add-on toggle.

Wording:

```text
Add Interior Window Cleaning to This Cleaning: +$X
```

Interior is not automatically included in future recurring visits.

### Included / Trust Section

Show a short value/trust section:

- Exterior window cleaning
- Free screen cleaning included
- Spotless guarantee
- Fast turnaround
- Owner-operated service
- Eco-friendly cleaning

Do not prominently mention the $199 minimum on the customer-facing page.

### Scheduling CTA

Use soft scheduling copy because Phase 1 has no live booking.

Example:

```text
Choose your cleaning option and request scheduling. We’ll follow up to confirm the soonest available time.
```

CTA:

```text
Schedule My Cleaning
```

Phone number can be shown as secondary option:

```text
Prefer to talk? Call us at [phone number].
```

Phone calls do not automatically create leads in Phase 1.

### Contact Form

Contact form appears inline after customer clicks “Schedule My Cleaning.”

Required fields:

- name
- phone
- email

### Confirmation

After submit, show:

- thank-you message
- selected option
- selected total
- quote valid for 30 days
- phone number for faster help

Do not send SMS/email confirmation in Phase 1.

---

## 13. Anonymous Quote Interactions

Before contact form submission, keep everything plugin-owned.

No core Contact, Property, Lead, or Quote should be created before contact form submission.

The Customer Quote / Sales Page Plugin should store:

- address entered
- normalized address
- normalized city
- service area status
- property lookup status
- property data summary
- quote options shown
- selected option if clicked
- selected add-ons
- source/tracking/UTM/referrer
- interaction status
- plugin version
- conversion references after contact submission

Store these interaction types:

- successful quote previews
- out-of-area attempts
- failed RentCast/property lookup attempts
- abandoned before contact form
- converted interactions

Only after contact form submission does core create:

- Contact
- Property
- Lead
- Quote

Then mark the plugin interaction as converted.

---

## 14. Google Geo and RentCast

### Google

Geo is a core capability.

Google is the first Geo Provider.

Plugins must not call Google directly.

Use core geo provider functions, such as:

- autocompleteAddress
- getPlaceDetails
- normalizeAddress
- matchServiceArea

Google requirements:

- real Google API in Phase 1
- domain-restricted browser key
- server-side key where needed
- debounced autocomplete
- place details only after selection

### RentCast

Property Data is a core capability.

RentCast is the first Property Data Provider.

Plugins must not call RentCast directly.

Use core property data provider functions, such as:

- lookupByAddress
- enrichProperty

RentCast requirements:

- real RentCast API in Phase 1
- server-side only key
- never expose RentCast API key to browser
- call RentCast only after confirmed Google address and service area pass

---

## 15. Public Server Actions / API Routes

Public quote submissions must use controlled server actions/API routes.

The public browser sends form/quote request data to the server.

The server action handles:

- input validation
- domain → business/app surface resolution
- Google address normalization if needed
- service area check
- RentCast lookup if needed
- Auto-Quote Plugin call
- core Contact creation
- core Property creation
- core Lead creation
- core Quote snapshot creation
- admin task creation
- event/activity creation
- quote interaction conversion update
- success/failure response

Never let public browser code directly insert into Supabase business tables.

---

## 16. Events and Activity

Phase 1 Event Bus is simple.

Events are machine-readable.

Activities are human-readable.

Phase 1 event examples:

- quote_app.address_entered
- auto_quote.quote_generated
- quote_app.contact_submitted
- quote_app.schedule_requested
- lead.created
- quote.created
- task.created
- issue.flagged

Phase 1 activity examples:

- Visitor entered address
- Quote generated
- Contact info submitted
- Lead created
- Quote created
- Schedule request task created
- Issue flagged

Do not build advanced event replay, event monitoring dashboard, or full timeline search/filtering in Phase 1.

---

## 17. Tasks

Phase 1 includes simple admin task queue for quote-related tasks only.

Task examples:

- Follow up to schedule quote request
- Prepare manual quote
- Review out-of-area quote request
- Review quote issue
- Fix failed property lookup

Do not build:

- advanced priority engine
- AI task prioritization
- guided workflow engine
- dependencies
- claiming/locking
- role app task queues
- outcome learning
- reviewed/followed-up/archive workflow

For Phase 1, testing clutter is cleared with the staging reset button.

---

## 18. Notes, Issues, and Files

### Notes

Phase 1 includes lightweight notes if needed for admin review/testing.

Notes are separate from messages.

A note can appear in activity as:

```text
User left a note on Quote — “message”
```

### Issues/Bugs

Phase 1 includes lightweight internal issues for QA/debugging.

Issue types:

- quote_calculation_issue
- property_data_missing
- geocoding_failed
- plugin_ui_error
- plugin_action_error
- customer_page_bug
- other

Issue tracking is for software correctness/debugging, not business learning.

### Files

Files/attachments are deferred.

Customer photo uploads are not planned for Phase 1 and likely not for a long time.

Do not build file upload/storage system in Phase 1.

---

## 19. Messaging and GoHighLevel

Messaging is core long term.

GoHighLevel will be the first SMS/conversation provider adapter in Phase 2.

Phase 1 may include message/conversation schema placeholders if useful, but no live messaging integration.

Do not build:

- GoHighLevel API connection
- SMS sending
- SMS receiving
- webhooks
- conversation sync
- email sending
- AI responder

---

## 20. AI and Context Engine

Do not build AI agents in Phase 1.

Do not build full Context Engine in Phase 1.

AI agents and Context Engine will be their own major ongoing phases.

Phase 1 can include:

- simple business settings/context
- clean events
- clean activity
- quote interaction history
- message schema placeholder if useful

The Context Engine should eventually learn from business behavior/outcomes, not from whether deterministic software functions are broken.

Software correctness is handled through:

- tests
- logs
- issue/bug flags
- QA/debugging

---

## 21. Reporting and Plugin Analytics

Full Reporting/KPI framework is future work.

Phase 1 includes simple plugin analytics widgets through the UI Registry.

The Quote/Sales Page Plugin should register admin analytics widgets showing:

- addresses entered
- quotes generated
- contact submissions
- schedule requests
- manual quote needed
- conversion rate from address entered → contact submitted
- recent quote interactions

Do not build full reporting dashboards/snapshots in Phase 1.

---

## 22. Staging, Production, and Reset

Phase 1 target is a working staging/demo build, not immediate production launch.

Flow:

```text
Build locally
↓
Deploy staging/demo
↓
Test quote app surface + admin review
↓
Fix issues
↓
Later production launch for real quote traffic
```

### Staging Reset Button

Phase 1 includes a staging-only data reset button.

It deletes quote-flow test data:

- quote page interactions
- fake contacts from quote tests
- fake properties from quote tests
- fake leads from quote tests
- fake quotes from quote tests
- quote-related admin tasks
- quote-related activity entries
- quote-related issues/bug flags, optional

It preserves setup:

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

Never expose reset button in production.

---

## 23. Security, API Keys, and Rate Limiting

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

Rules:

- do not hardcode API keys
- do not commit `.env`
- create `.env.example`
- Google browser key must be domain-restricted
- RentCast key must be server-side only

Public quote actions need basic protection:

- rate limit by IP
- server-side validation
- limit repeated requests for same address/IP
- block obvious bot/spam submissions
- log failed/blocked attempts

CAPTCHA is optional later, not required in Phase 1.

---

## 24. Phase 1 Do Not Build List

Do not build these in Phase 1:

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
- SMS sending/receiving
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
- reviewed/followed-up/archived CRM workflows
- self-serve domain setup wizard
- full pricing editor
- quote acceptance
- job creation from quote

---

## 25. Phase 1 Definition of Done

Phase 1 is complete when:

- Admin can log in with Supabase Auth.
- Crystal Bear workspace is seeded.
- Customer Quote App Surface is accessible on staging/custom domain.
- Customer can select a Google-confirmed address.
- Manually typed/unconfirmed addresses cannot generate quote.
- System checks service area by normalized city.
- System gets property data from RentCast.
- Auto-Quote Plugin calculates three exterior quote options.
- Quote page shows option cards.
- Every 3 Months is visually recommended.
- No option is selected by default.
- Interior add-on toggle works.
- Free screen cleaning is shown as included.
- Trust section is visible.
- Phone number is visible as secondary contact option.
- Soft scheduling copy is used.
- Customer selects option/add-on and clicks Schedule My Cleaning.
- Inline contact form appears.
- Customer submits name, phone, email.
- Core creates Contact, Property, Lead, and immutable Quote snapshot.
- Quote expiration defaults to 30 days.
- Plugin interaction is marked converted.
- Admin dashboard shows quote interaction/submission.
- Admin task is created for schedule request/manual quote fallback.
- Simple activity list records major events.
- Plugin detail page shows status, version, permissions, basic analytics, and issues.
- Basic plugin UI/action error isolation exists.
- Staging reset button clears quote-flow test data.
- Basic automated tests pass.
- Public quote writes go through controlled server actions/API routes.
- Basic rate limiting/spam protection exists.
- No Phase 1 Do Not Build items are implemented.

---

## 26. Build Strategy for Claude Code

Claude Code should start with a thin vertical slice, not a database-only or UI-only build.

Recommended first build flow:

1. Read `CLAUDE.md`, `schema.md`, and this file.
2. Summarize Phase 1 goal and Do Not Build list.
3. Create implementation plan.
4. Build base repo structure.
5. Add Supabase schema/migrations and seed.
6. Add Supabase Auth/admin shell.
7. Add app surface/domain resolution foundation.
8. Add plugin registry foundation.
9. Add core geo/provider and property data provider.
10. Add Customer Quote route.
11. Add Auto-Quote Plugin.
12. Add quote interactions.
13. Add submit quote request server action.
14. Add Admin review dashboard.
15. Add tasks/events/activity/issues.
16. Add staging reset.
17. Add tests.
18. Verify Definition of Done.

Claude Code should ask before building anything outside Phase 1 scope.
