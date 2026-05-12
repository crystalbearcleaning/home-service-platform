# 0001 — Phase 1 Open Questions and Decisions

Status: Accepted
Date: 2026-05-11

## Context

Before scaffolding the Phase 1 vertical slice, thirteen open questions were
surfaced after reading `CLAUDE.md`, `schema.md`, and `docs/PROJECT_BLUEPRINT.md`.
This document records the decisions made for each question so future
implementation, code review, and onboarding can refer to them.

These decisions only apply to Phase 1. They may be revisited later.

---

## 1. Pricing formula values

Use placeholder Phase 1 pricing formulas. Core owns the pricing data. No
admin pricing editor is built in Phase 1.

Seed defaults:

- Minimum price: `$199`
- Base exterior formula: `square_footage * 0.10`
- One-time exterior: `max(base_exterior, 199)`
- 6-month exterior: `max(base_exterior * 0.90, 199)`
- 3-month exterior: `max(base_exterior * 0.80, 199)`
- Interior add-on: `one_time_exterior * 0.50`
- All generated prices rounded to the nearest whole dollar.

Stored in `price_rules` so values can be changed in seed/config without an
admin UI. The exact numbers are temporary; the architecture and calculation
breakdown matter more than the math.

---

## 2. First admin user provisioning

Use a simple seed/bootstrap script. The script creates the Crystal Bear
business/workspace and the Owner/Admin role.

The first admin user is linked after they sign up with Supabase Auth.

The seed script reads `SEED_ADMIN_EMAIL`:

- If a Supabase auth user exists with that email, link them to Crystal Bear
  as Owner/Admin.
- If not, the script logs a clear instruction to sign up first and rerun.

No full invitation workflow is built in Phase 1.

---

## 3. Domain → business / app-surface resolution in dev

Use env-driven default mapping for development and Vercel previews:

```
DEFAULT_BUSINESS_SLUG=crystal-bear
DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG=quote
```

Resolution rules:

- Production / custom domains resolve via `app_surface_domains.domain`.
- Localhost and Vercel preview hosts fall back to the defaults above.

---

## 4. Rate-limit backend

Use a Supabase-backed rate-limit table for Phase 1. Do not introduce
Upstash or Vercel KV.

Phase 1 table (added during the migrations step):

- `id`
- `ip_hash`
- `action_key`
- `normalized_address_hash` (nullable)
- `created_at`
- `metadata` (jsonb)

Used for basic IP and per-address throttling on public actions.

---

## 5. Partial property data threshold

Square footage is required to generate an instant quote.

- If RentCast returns square footage, generate a quote.
- If square footage is missing or null, show the manual-quote fallback.
- Other property fields are optional.

---

## 6. Plugin permission keys

Initial Phase 1 permission keys per plugin.

### Window Cleaning Auto-Quote Plugin

- `core.pricing.read`
- `core.services.read`
- `core.property_data.read`
- `core.quotes.calculate`

### Customer Quote / Sales Page Plugin

- `core.geo.use`
- `core.property_data.use`
- `plugins.window_cleaning_auto_quote.call`
- `core.contacts.create_from_public_quote`
- `core.properties.create_from_public_quote`
- `core.leads.create_from_public_quote`
- `core.quotes.create_from_public_quote`
- `core.tasks.create`
- `core.events.publish`
- `core.activities.create`
- `core.issues.create`
- `plugin.quote_interactions.write`
- `ui.customer_quote.render`
- `ui.admin_widgets.register`

These are Phase 1 internal permissions used for manifest clarity. No full
permission approval system is built in Phase 1.

---

## 7. Staging vs production gate

Two environment variables gate the staging reset feature:

```
NEXT_PUBLIC_ENABLE_STAGING_TOOLS=
ENABLE_STAGING_TOOLS=
```

- The reset button only renders when `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=true`.
- The reset server action only runs when `ENABLE_STAGING_TOOLS=true`.
- Never rely on the frontend flag alone.
- Neither flag should ever be `true` in production.

---

## 8. `quote_page_interaction_id` soft reference

Accepted for Phase 1.

`leads.quote_page_interaction_id` and `quotes.quote_page_interaction_id`
remain soft references because the quote interaction table is plugin-owned.

The plugin interaction table also stores:

- `converted_contact_id`
- `converted_property_id`
- `converted_lead_id`
- `converted_quote_id`

so the relationship is queryable from the plugin side as well.

---

## 9. `data_dictionary_fields` unique constraint

Use a partial unique index, or otherwise normalize `business_id`, so global
field definitions (`business_id IS NULL`) cannot be duplicated. Will be
defined explicitly in the migration step rather than relying on Postgres'
default treatment of multiple NULLs.

---

## 10. Event payload validation

App-code validation is acceptable for Phase 1. Use Zod schemas for event
payloads in TypeScript where possible. No DB-side JSON schema enforcement.

---

## 11. RLS policies

Draft the RLS policies before applying them. Keep them simple:

- Business members can read/write their business records according to
  app routes and server actions.
- Public visitors cannot directly write business tables.
- Public quote writes happen only through server actions (using the
  service role where appropriate).

---

## 12. RentCast coverage risk

Accepted. If square footage is missing, use the manual-quote fallback
(see decision 5).

---

## 13. CAPTCHA

Do not add CAPTCHA in Phase 1 unless abuse becomes a real problem. IP and
per-address throttling plus server-side validation are the Phase 1
defenses (see decision 4).

---

## Consequences

- Pricing math is placeholder; expect to tune the formulas during testing.
- The seed script depends on `SEED_ADMIN_EMAIL` and an existing Supabase
  auth user. Bootstrapping is a two-step process.
- Local and preview environments need `DEFAULT_BUSINESS_SLUG` and
  `DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG` set for the customer surface to
  resolve.
- Rate-limit performance is bounded by Supabase write speed. Acceptable
  for Phase 1 traffic.
- Soft FK on `quote_page_interaction_id` means cross-table joins must be
  done by app code, not Postgres FK guarantees.
