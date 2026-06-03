# Home Service Operating Platform — Phase 1 Schema

## Purpose

This schema defines the Phase 1 data model for the modular home service operating platform discussed in the planning interview.

Crystal Bear Window Cleaning is the first business/workspace used to prove the platform. Phase 1 is **not** a full CRM. Phase 1 proves one vertical slice:

1. Public Customer Quote App Surface.
2. Google address autocomplete/geocoding.
3. Service area check.
4. RentCast property enrichment.
5. Window Cleaning Auto-Quote Plugin.
6. Customer quote option selection.
7. Contact capture.
8. Core Contact / Property / Lead / Quote creation.
9. Admin review/testing dashboard.

## Phase 1 Core Rules

1. Every business-owned table must include `business_id`.
2. Public visitors must never write directly to Supabase tables.
3. Public quote submissions must go through controlled server actions/API routes.
4. Core owns official business records.
5. Plugins own specialized interaction/session data.
6. Anonymous quote interactions stay plugin-owned until contact capture.
7. Core `contacts`, `properties`, `leads`, and `quotes` are created only after the customer submits name, phone, and email.
8. Important core record creation/status changes must go through registered core actions.
9. Phase 1 should stay narrow and testable.
10. Phase 1 must not implement jobs, appointments, invoices, payments, recurring agreements, full CRM, full workflows, AI agents, or GoHighLevel.

## Naming Conventions

- Use `business_id`, not `organization_id`.
- Use snake_case table and column names.
- Use text status keys for Phase 1 simplicity.
- Prefer explicit core tables over a generic catch-all model.
- Use JSONB snapshots for quote prices/calculation output so generated quotes remain immutable.

## Table of Contents

1. Platform / Business Tables
2. Users, Memberships, Roles, and Permissions
3. App Surfaces and Custom Domains
4. Plugin Registry
5. Data Dictionary / Schema Registry
6. Business Settings / Simple Context
7. Service Areas
8. Services, Service Plans, and Add-ons
9. Pricing
10. Contacts
11. Properties
12. Leads
13. Quotes
14. Customer Quote / Sales Page Plugin Tables
15. Tasks
16. Events
17. Activities
18. Notes
19. Issues / Bugs
20. Messages / Conversations Placeholder
21. Record Links
22. Seed Data
23. Deferred Tables

---

## 1. Platform / Business Tables

### `businesses`

One row per business/workspace.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `name` | `text` | NOT NULL | Example: `Crystal Bear Window Cleaning` |
| `slug` | `text` | NOT NULL, UNIQUE | Example: `crystal-bear` |
| `primary_industry` | `text` | NULLABLE | Example: `window_cleaning` |
| `phone` | `text` | NULLABLE | Public phone number |
| `email` | `text` | NULLABLE | Business email |
| `website` | `text` | NULLABLE | |
| `logo_url` | `text` | NULLABLE | Future storage URL |
| `timezone` | `text` | NOT NULL, default `'America/New_York'` | |
| `currency` | `text` | NOT NULL, default `'USD'` | |
| `status` | `text` | NOT NULL, default `'active'` | `active`, `inactive` |
| `is_simulation` | `boolean` | NOT NULL, default `false` | Phase 6: true for simulation workspaces (e.g. `Crystal Bear Simulation`). Read by adapters (SMS / email / payments / future integrations) to short-circuit real external side effects. Existing workspaces default to `false`. Related: `simulation_runs` (§22c). |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## 2. Users, Memberships, Roles, and Permissions

### `user_profiles`

Application profile for Supabase Auth users.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id)` | Same as Supabase user id |
| `display_name` | `text` | NULLABLE | |
| `email` | `text` | NOT NULL | |
| `phone` | `text` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### `business_memberships`

Connects users to businesses/workspaces.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `user_id` | `uuid` | NOT NULL, FK → `user_profiles(id)` | |
| `status` | `text` | NOT NULL, default `'active'` | `invited`, `active`, `disabled` |
| `default_role_id` | `uuid` | NULLABLE, FK → `business_roles(id)` | |
| `invited_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `joined_at` | `timestamptz` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, user_id)`

### `role_blueprints`

Reusable role blueprints. Phase 1 only needs Owner/Admin, but seed future obvious roles for structure if useful.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `key` | `text` | NOT NULL, UNIQUE | `owner_admin`, `office_manager`, `door_hanger`, `technician` |
| `name` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `default_permissions` | `jsonb` | NULLABLE | Capability/scope defaults |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `business_roles`

Business-specific role instances.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `role_blueprint_id` | `uuid` | NULLABLE, FK → `role_blueprints(id)` | |
| `key` | `text` | NOT NULL | Example: `owner_admin` |
| `name` | `text` | NOT NULL | Example: `Owner / Admin` |
| `description` | `text` | NULLABLE | |
| `is_system` | `boolean` | NOT NULL, default `false` | Seeded default role |
| `status` | `text` | NOT NULL, default `'active'` | `active`, `inactive` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, key)`

### `membership_roles`

Allows a user to have one or more business roles.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `membership_id` | `uuid` | NOT NULL, FK → `business_memberships(id)` | |
| `role_id` | `uuid` | NOT NULL, FK → `business_roles(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(membership_id, role_id)`

### `role_permissions`

Capability-based role permissions with scope.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `role_id` | `uuid` | NOT NULL, FK → `business_roles(id)` | |
| `capability` | `text` | NOT NULL | Example: `admin.view`, `plugins.manage`, `quotes.view` |
| `scope` | `text` | NOT NULL, default `'all_business'` | Example: `all_business`, `assigned_to_me`, `own`, `none` |
| `conditions` | `jsonb` | NULLABLE | Future extension |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, role_id, capability, scope)`

### `user_permission_overrides`

Per-user exceptions. Use sparingly.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `user_id` | `uuid` | NOT NULL, FK → `user_profiles(id)` | |
| `capability` | `text` | NOT NULL | |
| `scope` | `text` | NOT NULL | |
| `effect` | `text` | NOT NULL | `allow`, `deny` |
| `created_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## 3. App Surfaces and Custom Domains

### `app_surface_blueprints`

Reusable app surface blueprints. Phase 1 can seed basic keys only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `key` | `text` | NOT NULL, UNIQUE | `admin`, `customer_quote`, `door_hanger`, `technician` |
| `name` | `text` | NOT NULL | |
| `surface_type` | `text` | NOT NULL | `admin`, `role`, `customer` |
| `description` | `text` | NULLABLE | |
| `default_config` | `jsonb` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `app_surfaces`

Business-specific app surface instances.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `blueprint_id` | `uuid` | NULLABLE, FK → `app_surface_blueprints(id)` | |
| `name` | `text` | NOT NULL | Example: `Crystal Bear Quote App` |
| `slug` | `text` | NOT NULL | Example: `quote` |
| `surface_type` | `text` | NOT NULL | `admin`, `role`, `customer` |
| `status` | `text` | NOT NULL, default `'active'` | `active`, `disabled` |
| `config` | `jsonb` | NULLABLE | Surface-specific config |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, slug)`

### `role_app_surface_access`

Default app surface access by business role.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `role_id` | `uuid` | NOT NULL, FK → `business_roles(id)` | |
| `app_surface_id` | `uuid` | NOT NULL, FK → `app_surfaces(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(role_id, app_surface_id)`

### `user_app_surface_overrides`

Per-user app surface access exceptions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `user_id` | `uuid` | NOT NULL, FK → `user_profiles(id)` | |
| `app_surface_id` | `uuid` | NOT NULL, FK → `app_surfaces(id)` | |
| `effect` | `text` | NOT NULL | `allow`, `deny` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `app_surface_domains`

Custom domain mapping. Phase 1 manually configures customer quote app domain only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `app_surface_id` | `uuid` | NOT NULL, FK → `app_surfaces(id)` | |
| `domain` | `text` | NOT NULL, UNIQUE | Example: `quote.crystalbear.com` |
| `domain_type` | `text` | NOT NULL | `subdomain`, `custom_domain` |
| `status` | `text` | NOT NULL, default `'pending'` | `pending`, `verified`, `active`, `failed` |
| `is_primary` | `boolean` | NOT NULL, default `false` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## 4. Plugin Registry

### `plugin_definitions`

Known plugin definitions available in the internal plugin library.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `plugin_key` | `text` | NOT NULL, UNIQUE | `window_cleaning_auto_quote`, `customer_quote_sales_page` |
| `name` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `current_version` | `text` | NOT NULL | Example: `0.1.0` |
| `manifest` | `jsonb` | NOT NULL | Permissions, actions, UI registrations, events |
| `is_internal` | `boolean` | NOT NULL, default `true` | Phase 1 plugins are internal |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### `installed_plugins`

Plugin installation status per business.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `plugin_definition_id` | `uuid` | NOT NULL, FK → `plugin_definitions(id)` | |
| `plugin_key` | `text` | NOT NULL | Denormalized for easier querying |
| `installed_version` | `text` | NOT NULL | |
| `status` | `text` | NOT NULL, default `'enabled'` | `installed`, `enabled`, `disabled`, `error` |
| `settings` | `jsonb` | NULLABLE | Lightweight Phase 1 config |
| `installed_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `installed_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, plugin_key)`

### `plugin_ui_registrations`

UI contributions from plugins.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `installed_plugin_id` | `uuid` | NOT NULL, FK → `installed_plugins(id)` | |
| `ui_key` | `text` | NOT NULL | Example: `quote_interactions_widget` |
| `surface_type` | `text` | NOT NULL | `admin`, `customer`, `role` |
| `slot` | `text` | NOT NULL | Example: `admin.dashboard.widgets`, `plugin.detail.analytics` |
| `component_key` | `text` | NOT NULL | Code-level component mapping |
| `config` | `jsonb` | NULLABLE | |
| `is_enabled` | `boolean` | NOT NULL, default `true` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `plugin_action_registrations`

Action declarations from plugins.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `plugin_definition_id` | `uuid` | NOT NULL, FK → `plugin_definitions(id)` | |
| `action_key` | `text` | NOT NULL | Example: `window_cleaning_auto_quote.calculate_quote` |
| `name` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `input_schema` | `jsonb` | NOT NULL | |
| `output_schema` | `jsonb` | NOT NULL | |
| `risk_level` | `text` | NOT NULL, default `'low'` | `low`, `medium`, `high`, `critical` |
| `requires_approval` | `boolean` | NOT NULL, default `false` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(plugin_definition_id, action_key)`

---

## 5. Data Dictionary / Schema Registry

### `data_dictionary_fields`

Lightweight registry for core and plugin-declared fields.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NULLABLE, FK → `businesses(id)` | NULL for global/core field definitions |
| `object_type` | `text` | NOT NULL | Example: `contact`, `property`, `quote`, `quote_page_interaction` |
| `field_key` | `text` | NOT NULL | Example: `square_footage` |
| `display_name` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `data_type` | `text` | NOT NULL | `text`, `number`, `boolean`, `date`, `json`, `uuid` |
| `owner_type` | `text` | NOT NULL | `core`, `plugin` |
| `owner_key` | `text` | NULLABLE | Plugin key if plugin-owned |
| `is_active` | `boolean` | NOT NULL, default `true` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, object_type, field_key, owner_type, owner_key)`

---

## 6. Business Settings / Simple Context

### `business_settings`

Simple key/value settings. Phase 1 does not build a full settings editor.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `key` | `text` | NOT NULL | Example: `quote_expiration_days` |
| `value` | `jsonb` | NOT NULL | Store typed JSON value |
| `category` | `text` | NOT NULL | `business`, `quote`, `branding`, `pricing`, `integrations` |
| `description` | `text` | NULLABLE | |
| `is_system` | `boolean` | NOT NULL, default `false` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, key)`

---

## 7. Service Areas

### `service_areas`

Service areas are broad operating zones. Phase 1 uses city/locality matching only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `name` | `text` | NOT NULL | `Boynton Beach`, `Boca Raton`, `Delray Beach` |
| `match_type` | `text` | NOT NULL, default `'city'` | Phase 1: `city` only |
| `match_value` | `text` | NOT NULL | Lowercase normalized value, e.g. `boynton beach` |
| `status` | `text` | NOT NULL, default `'active'` | `active`, `inactive` |
| `pricing_modifier` | `jsonb` | NULLABLE | Future |
| `notes` | `text` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, match_type, match_value)`

---

## 8. Services, Service Plans, and Add-ons

### `services`

Core service definitions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `name` | `text` | NOT NULL | Example: `Exterior Window Cleaning` |
| `service_code` | `text` | NOT NULL | Example: `EXT_WINDOW` |
| `description` | `text` | NULLABLE | |
| `is_base_service` | `boolean` | NOT NULL, default `true` | Exterior is base |
| `is_add_on` | `boolean` | NOT NULL, default `false` | Interior is add-on |
| `requires_service_id` | `uuid` | NULLABLE, FK → `services(id)` | Interior requires exterior |
| `is_active` | `boolean` | NOT NULL, default `true` | |
| `sort_order` | `integer` | NOT NULL, default `0` | |
| `metadata` | `jsonb` | NULLABLE | Example: `{"screen_cleaning_included": true}` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, service_code)`

### `service_plans`

Service frequency/plan options. Phase 1 shows these as quote cards.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `key` | `text` | NOT NULL | `one_time`, `six_month`, `three_month` |
| `name` | `text` | NOT NULL | |
| `frequency_months` | `integer` | NULLABLE | NULL or 0 for one-time |
| `display_label` | `text` | NOT NULL | Example: `Every 3 Months` |
| `is_recurring_intent` | `boolean` | NOT NULL, default `false` | No recurring agreement created in Phase 1 |
| `is_recommended` | `boolean` | NOT NULL, default `false` | Phase 1: 3-month plan true |
| `sort_order` | `integer` | NOT NULL, default `0` | |
| `is_active` | `boolean` | NOT NULL, default `true` | |
| `metadata` | `jsonb` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, key)`

---

## 9. Pricing

### `price_rules`

Core stores pricing data. Plugins use it but do not own it.

Phase 1 can use JSON config for fast iteration instead of a full pricing editor.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `key` | `text` | NOT NULL | Example: `window_cleaning_sqft_formula_v1` |
| `name` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `service_id` | `uuid` | NULLABLE, FK → `services(id)` | NULL if applies broadly |
| `service_plan_id` | `uuid` | NULLABLE, FK → `service_plans(id)` | |
| `rule_type` | `text` | NOT NULL | `minimum`, `formula`, `add_on`, `modifier`, `custom_json` |
| `rule_config` | `jsonb` | NOT NULL | Formula/config used by plugin |
| `priority` | `integer` | NOT NULL, default `0` | |
| `is_active` | `boolean` | NOT NULL, default `true` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(business_id, key)`

### Phase 1 Pricing Requirements

Seed pricing rules for:

- minimum price, default `$199`
- one-time exterior pricing rule
- 6-month exterior pricing rule
- 3-month exterior pricing rule
- interior add-on pricing rule

The exact formula/config can be changed in seed data/code during Phase 1. No admin pricing editor is required.

---

## 10. Contacts

### `contacts`

Created only after customer submits name, phone, and email.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `full_name` | `text` | NOT NULL | |
| `first_name` | `text` | NULLABLE | Optional parsed version |
| `last_name` | `text` | NULLABLE | Optional parsed version |
| `phone` | `text` | NOT NULL | Required in Phase 1 |
| `email` | `text` | NOT NULL | Required in Phase 1 |
| `status` | `text` | NOT NULL, default `'active'` | |
| `source` | `text` | NULLABLE | Example: `quote_app` |
| `created_from_app_surface_id` | `uuid` | NULLABLE, FK → `app_surfaces(id)` | |
| `created_from_plugin_key` | `text` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Indexes:

- `(business_id, email)`
- `(business_id, phone)`

---

## 11. Properties

### `properties`

Created only after contact form submission/conversion.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `contact_id` | `uuid` | NULLABLE, FK → `contacts(id)` | Contact who submitted request |
| `address_line_1` | `text` | NOT NULL | |
| `address_line_2` | `text` | NULLABLE | |
| `city` | `text` | NOT NULL | |
| `state` | `text` | NOT NULL | |
| `postal_code` | `text` | NULLABLE | |
| `country` | `text` | NOT NULL, default `'US'` | |
| `formatted_address` | `text` | NOT NULL | Google formatted address |
| `google_place_id` | `text` | NULLABLE | |
| `latitude` | `numeric(10,7)` | NULLABLE | |
| `longitude` | `numeric(10,7)` | NULLABLE | |
| `service_area_id` | `uuid` | NULLABLE, FK → `service_areas(id)` | Matched area if in-area |
| `service_area_status` | `text` | NOT NULL, default `'unknown'` | `in_area`, `out_of_area`, `unknown` |
| `square_footage` | `integer` | NULLABLE | From RentCast |
| `property_type` | `text` | NULLABLE | From provider |
| `lot_size_sqft` | `integer` | NULLABLE | From provider |
| `year_built` | `integer` | NULLABLE | From provider |
| `bedrooms` | `numeric(4,1)` | NULLABLE | From provider |
| `bathrooms` | `numeric(4,1)` | NULLABLE | From provider |
| `property_data_source` | `text` | NULLABLE | Phase 1: `rentcast` |
| `property_data_provider_id` | `text` | NULLABLE | Provider-specific id if available |
| `property_data_confidence` | `text` | NULLABLE | `high`, `medium`, `low`, `unknown` |
| `property_data_status` | `text` | NOT NULL, default `'unknown'` | `found`, `missing`, `partial`, `error` |
| `last_enriched_at` | `timestamptz` | NULLABLE | |
| `provider_snapshot` | `jsonb` | NULLABLE | Selected provider response fields for debugging; avoid storing unnecessary sensitive data |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Indexes:

- `(business_id, google_place_id)`
- `(business_id, formatted_address)`
- `(business_id, contact_id)`

---

## 12. Leads

### `leads`

Created only after contact form submission. Phase 1 is not a full pipeline.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `contact_id` | `uuid` | NOT NULL, FK → `contacts(id)` | |
| `property_id` | `uuid` | NOT NULL, FK → `properties(id)` | |
| `status` | `text` | NOT NULL | `scheduling_requested`, `needs_manual_quote`, `service_area_review_needed` |
| `customer_intent` | `text` | NOT NULL, default `'schedule_requested'` | |
| `source` | `text` | NULLABLE | |
| `tracking_code` | `text` | NULLABLE | |
| `utm_source` | `text` | NULLABLE | |
| `utm_medium` | `text` | NULLABLE | |
| `utm_campaign` | `text` | NULLABLE | |
| `referrer` | `text` | NULLABLE | |
| `created_from_app_surface_id` | `uuid` | NULLABLE, FK → `app_surfaces(id)` | |
| `created_from_plugin_key` | `text` | NULLABLE | |
| `quote_page_interaction_id` | `uuid` | NULLABLE | References plugin table by app code, not FK required |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## 13. Quotes

### `quotes`

Official quote snapshot created after contact form submission. No formal quote acceptance in Phase 1.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `contact_id` | `uuid` | NOT NULL, FK → `contacts(id)` | |
| `property_id` | `uuid` | NOT NULL, FK → `properties(id)` | |
| `lead_id` | `uuid` | NOT NULL, FK → `leads(id)` | |
| `status` | `text` | NOT NULL, default `'submitted'` | `draft`, `submitted`, `expired`, `void` |
| `customer_intent` | `text` | NOT NULL, default `'schedule_requested'` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `expires_at` | `timestamptz` | NOT NULL | Default: created_at + 30 days |
| `source_plugin_key` | `text` | NOT NULL | `window_cleaning_auto_quote` |
| `source_plugin_version` | `text` | NOT NULL | |
| `selected_service_plan_id` | `uuid` | NULLABLE, FK → `service_plans(id)` | Chosen option |
| `selected_option_key` | `text` | NULLABLE | Example: `three_month` |
| `selected_add_ons` | `jsonb` | NULLABLE | Example: `[{"service_code":"INT_WINDOW","price":125}]` |
| `selected_total` | `numeric(10,2)` | NULLABLE | First cleaning total |
| `options_snapshot` | `jsonb` | NOT NULL | All generated quote options shown |
| `line_items_snapshot` | `jsonb` | NOT NULL | Line items/prices at generation |
| `price_snapshot` | `jsonb` | NOT NULL | Final immutable price data |
| `calculation_snapshot` | `jsonb` | NOT NULL | Inputs, assumptions, minimum applied, warnings |
| `property_snapshot` | `jsonb` | NULLABLE | Sqft and property data used |
| `source` | `text` | NULLABLE | |
| `tracking_code` | `text` | NULLABLE | |
| `created_from_app_surface_id` | `uuid` | NULLABLE, FK → `app_surfaces(id)` | |
| `quote_page_interaction_id` | `uuid` | NULLABLE | Plugin-owned interaction id |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### Quote Status Rules

- Phase 1 CTA is “Schedule My Cleaning,” not “Accept Quote.”
- Phase 1 does not create jobs from quotes.
- Expired quotes remain visible internally.
- Expired quotes are not customer-acceptable without generating a new quote later.
- Existing quote snapshots never recalculate when pricing rules change.

---

## 14. Customer Quote / Sales Page Plugin Tables

### `quote_page_interactions`

Plugin-owned table. Tracks anonymous and converted customer quote page activity.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `app_surface_id` | `uuid` | NOT NULL, FK → `app_surfaces(id)` | |
| `installed_plugin_id` | `uuid` | NULLABLE, FK → `installed_plugins(id)` | Customer Quote / Sales Page Plugin |
| `plugin_version` | `text` | NOT NULL | |
| `session_key` | `text` | NULLABLE | Anonymous browser/session id if used |
| `address_input` | `text` | NULLABLE | What user typed/selected |
| `normalized_address` | `jsonb` | NULLABLE | Google normalized address |
| `normalized_city` | `text` | NULLABLE | |
| `google_place_id` | `text` | NULLABLE | |
| `latitude` | `numeric(10,7)` | NULLABLE | |
| `longitude` | `numeric(10,7)` | NULLABLE | |
| `service_area_status` | `text` | NOT NULL, default `'unknown'` | `in_area`, `out_of_area`, `unknown` |
| `property_data_status` | `text` | NOT NULL, default `'not_requested'` | `not_requested`, `found`, `missing`, `partial`, `error` |
| `property_data_summary` | `jsonb` | NULLABLE | Sqft/type/provider summary |
| `provider_error` | `text` | NULLABLE | |
| `interaction_status` | `text` | NOT NULL | `address_entered`, `out_of_area`, `property_data_missing`, `quote_generated`, `contact_submitted`, `converted`, `abandoned`, `error` |
| `quote_preview_data` | `jsonb` | NULLABLE | Quote options shown before conversion |
| `selected_option_key` | `text` | NULLABLE | If user clicked option before contact |
| `selected_add_ons` | `jsonb` | NULLABLE | |
| `selected_total` | `numeric(10,2)` | NULLABLE | |
| `source` | `text` | NULLABLE | |
| `tracking_code` | `text` | NULLABLE | |
| `utm_source` | `text` | NULLABLE | |
| `utm_medium` | `text` | NULLABLE | |
| `utm_campaign` | `text` | NULLABLE | |
| `referrer` | `text` | NULLABLE | |
| `converted_contact_id` | `uuid` | NULLABLE, FK → `contacts(id)` | |
| `converted_property_id` | `uuid` | NULLABLE, FK → `properties(id)` | |
| `converted_lead_id` | `uuid` | NULLABLE, FK → `leads(id)` | |
| `converted_quote_id` | `uuid` | NULLABLE, FK → `quotes(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `converted_at` | `timestamptz` | NULLABLE | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Indexes:

- `(business_id, created_at)`
- `(business_id, interaction_status)`
- `(business_id, converted_lead_id)`
- `(business_id, tracking_code)`

---

## 15. Tasks

### `tasks`

Simple Phase 1 admin task queue for quote-related work only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `status` | `text` | NOT NULL, default `'open'` | `open`, `completed`, `canceled` |
| `priority` | `text` | NOT NULL, default `'normal'` | `low`, `normal`, `high`, `urgent` |
| `task_category` | `text` | NOT NULL, default `'admin_review'` | `admin_review`, `manual_quote`, `schedule_request`, `issue_review` |
| `assigned_role_id` | `uuid` | NULLABLE, FK → `business_roles(id)` | |
| `assigned_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `related_object_type` | `text` | NULLABLE | `lead`, `quote`, `property`, `issue`, `quote_page_interaction` |
| `related_object_id` | `uuid` | NULLABLE | |
| `source_plugin_key` | `text` | NULLABLE | |
| `source_event_id` | `uuid` | NULLABLE, FK → `events(id)` | |
| `due_at` | `timestamptz` | NULLABLE | |
| `completed_at` | `timestamptz` | NULLABLE | |
| `completed_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Phase 1 tasks:

- Follow up to schedule quote request
- Prepare manual quote
- Review out-of-area quote request
- Review quote issue
- Fix failed property lookup

Do not build reviewed/followed-up/archive CRM workflow in Phase 1.

---

## 16. Events

### `event_types`

Registry of allowed event types and schemas.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `event_type` | `text` | NOT NULL | Example: `quote_app.address_entered` |
| `schema_version` | `integer` | NOT NULL, default `1` | |
| `description` | `text` | NULLABLE | |
| `payload_schema` | `jsonb` | NOT NULL | JSON schema-like structure |
| `owner_type` | `text` | NOT NULL | `core`, `plugin` |
| `owner_key` | `text` | NULLABLE | Plugin key if plugin-owned |
| `is_active` | `boolean` | NOT NULL, default `true` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraint:** UNIQUE `(event_type, schema_version)`

### `events`

Machine-readable system/plugin events.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `event_type` | `text` | NOT NULL | |
| `schema_version` | `integer` | NOT NULL, default `1` | |
| `payload` | `jsonb` | NOT NULL | Validate in app code for Phase 1 |
| `source_type` | `text` | NOT NULL | `core`, `plugin`, `system` |
| `source_key` | `text` | NULLABLE | Plugin key or core module |
| `related_object_type` | `text` | NULLABLE | |
| `related_object_id` | `uuid` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

Phase 1 event types:

- `quote_app.address_entered`
- `auto_quote.quote_generated`
- `quote_app.contact_submitted`
- `quote_app.schedule_requested`
- `lead.created`
- `quote.created`
- `task.created`
- `issue.flagged`

---

## 17. Activities

### `activities`

Human-readable activity list entries. Phase 1 uses this for quote/lead interactions only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `event_id` | `uuid` | NULLABLE, FK → `events(id)` | Some activities originate from events |
| `actor_type` | `text` | NOT NULL, default `'system'` | `visitor`, `user`, `system`, `plugin` |
| `actor_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `source_plugin_key` | `text` | NULLABLE | |
| `activity_type` | `text` | NOT NULL | Example: `quote_generated` |
| `summary` | `text` | NOT NULL | Human-readable line |
| `details` | `jsonb` | NULLABLE | |
| `related_object_type` | `text` | NULLABLE | |
| `related_object_id` | `uuid` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

Phase 1 example summaries:

- Visitor entered address.
- Quote generated.
- Contact info submitted.
- Lead created.
- Quote created.
- Schedule request task created.
- Issue flagged.

---

## 18. Notes

### `notes`

Lightweight internal notes. Notes are separate from messages.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `body` | `text` | NOT NULL | |
| `visibility` | `text` | NOT NULL, default `'all_internal'` | `all_internal`, `admin_only`, `role_specific`, `private_to_author` |
| `author_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `related_object_type` | `text` | NOT NULL | Example: `quote`, `lead`, `property`, `issue` |
| `related_object_id` | `uuid` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

A note can create an activity like:

> Sam left a note on Quote — “Customer asked about exterior-only.”

---

## 19. Issues / Bugs

### `issues`

Lightweight internal QA/debug issues for Phase 1 testing.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULLABLE | |
| `issue_type` | `text` | NOT NULL | See below |
| `status` | `text` | NOT NULL, default `'open'` | `open`, `fixed`, `ignored` |
| `severity` | `text` | NOT NULL, default `'medium'` | `low`, `medium`, `high`, `critical` |
| `source_plugin_key` | `text` | NULLABLE | |
| `app_surface_id` | `uuid` | NULLABLE, FK → `app_surfaces(id)` | |
| `related_object_type` | `text` | NULLABLE | |
| `related_object_id` | `uuid` | NULLABLE | |
| `plugin_version` | `text` | NULLABLE | |
| `created_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | NULL for system-created issue |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

Issue types:

- `quote_calculation_issue`
- `property_data_missing`
- `geocoding_failed`
- `plugin_ui_error`
- `plugin_action_error`
- `customer_page_bug`
- `other`

---

## 20. Messages / Conversations Placeholder

Phase 1 may include schema placeholders if useful, but no live SMS/email/GHL code.

### `conversations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `contact_id` | `uuid` | NULLABLE, FK → `contacts(id)` | |
| `channel` | `text` | NOT NULL | `sms`, `email`, `call`, `chat` |
| `provider` | `text` | NULLABLE | Future: `gohighlevel` |
| `provider_conversation_id` | `text` | NULLABLE | |
| `status` | `text` | NOT NULL, default `'open'` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

### `messages`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `conversation_id` | `uuid` | NULLABLE, FK → `conversations(id)` | |
| `contact_id` | `uuid` | NULLABLE, FK → `contacts(id)` | |
| `channel` | `text` | NOT NULL | `sms`, `email`, `call`, `voicemail`, `chat` |
| `direction` | `text` | NOT NULL | `inbound`, `outbound`, `internal` |
| `message_type` | `text` | NULLABLE | `message`, `missed_call`, `call_transcript`, etc. |
| `body` | `text` | NULLABLE | |
| `status` | `text` | NULLABLE | |
| `provider` | `text` | NULLABLE | Future: `gohighlevel` |
| `provider_message_id` | `text` | NULLABLE | |
| `sent_at` | `timestamptz` | NULLABLE | |
| `received_at` | `timestamptz` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

Do not implement GoHighLevel adapter in Phase 1.

---

## 21. Record Links

### `record_links`

Flexible relationship table for connecting core and plugin records.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` | |
| `source_object_type` | `text` | NOT NULL | |
| `source_object_id` | `uuid` | NOT NULL | |
| `target_object_type` | `text` | NOT NULL | |
| `target_object_id` | `uuid` | NOT NULL | |
| `relationship_type` | `text` | NOT NULL | Example: `related_to`, `created_from`, `converted_to` |
| `source_plugin_key` | `text` | NULLABLE | |
| `created_by_user_id` | `uuid` | NULLABLE, FK → `user_profiles(id)` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

## 22. Seed Data

### Business

Seed one business:

- name: Crystal Bear Window Cleaning
- slug: crystal-bear
- primary_industry: window_cleaning
- timezone: America/New_York
- currency: USD

### Service Areas

Seed:

- Boynton Beach
- Boca Raton
- Delray Beach

Use `match_type = city` and lowercase `match_value`.

### Roles

Seed:

- Owner/Admin

Optional future role blueprints for structure only:

- Office Manager
- Door Hanger
- Technician

### App Surfaces

Seed:

- Admin App Surface
- Customer Quote App Surface

### Plugins

Seed definitions/installations:

- `window_cleaning_auto_quote`
- `customer_quote_sales_page`

### Services

Seed:

- Exterior Window Cleaning
  - base service
  - service code: `EXT_WINDOW`
  - metadata: screen cleaning included
- Interior Window Cleaning
  - add-on
  - service code: `INT_WINDOW`
  - requires Exterior Window Cleaning

### Service Plans

Seed:

- One-Time Clean: `one_time`
- Every 6 Months: `six_month`
- Every 3 Months: `three_month`, recommended

### Business Settings

Seed:

- quote expiration days: `30`
- fallback message when property data missing:
  - “We don’t have your home in our system yet! Enter your contact information and our team will send you a quote as soon as it’s ready.”
- out-of-service-area message:
  - “Looks like this address may be outside our current service area. Enter your contact information and our team will let you know if we can help.”

### Pricing

Seed current Crystal Bear Phase 1 pricing rules in `price_rules`.

Do not build a pricing editor in Phase 1.

---

## 22b. Door Hanger Plugin (Phase 5B-1)

Plugin-owned tables for the Door Hanger marketing-channel plugin.
Migration: `supabase/migrations/20260525120000_phase_5_door_hanger.sql`.
Source-of-truth doc: `docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md`
(Appendix A — Phase 5A-2 product/design addendum).

Phase 5B-1 ships the data model only — no admin UI, no RentCast route
generation, no simulation, no CRM lead generation from door hangers.
All money is stored as `bigint` **cents** to avoid floating-point
math. RLS follows Pattern B (members SELECT only; writes via
controlled admin server actions using the service-role client).

### `door_hanger_designs`

Inventory line-items / printed designs.

| Column | Type | Notes |
|---|---|---|
| `id` / `business_id` | uuid | standard |
| `name` | text NOT NULL | |
| `version_or_offer` | text NULLABLE | optional label |
| `quantity_received` | integer NOT NULL | CHECK >= 0 |
| `quantity_used` | integer NOT NULL default 0 | CHECK >= 0 AND <= received |
| `total_print_cost_cents` | bigint NULLABLE | what the printer charged |
| `cost_per_hanger_cents` | bigint NULLABLE | optionally cached = total / received |
| `received_at` | date NULLABLE | |
| `notes` | text NULLABLE | |
| timestamps | standard | |

### `door_hanger_campaigns`

Campaign-first organizing object. Assumption fields support future ROI
and simulation but stay optional in Phase 5B.

| Column | Type | Notes |
|---|---|---|
| `id` / `business_id` | uuid | |
| `name` | text NOT NULL | |
| `offer_summary` / `target_area` / `notes` | text NULLABLE | |
| `status` | text NOT NULL default 'draft' | CHECK in (draft, active, paused, complete) |
| `response_rate_assumption` | numeric(6,4) NULLABLE | 0 ≤ x ≤ 1 |
| `quote_to_booking_assumption` | numeric(6,4) NULLABLE | 0 ≤ x ≤ 1 |
| `average_job_value_cents` | bigint NULLABLE | |
| timestamps | standard | |

### `door_hanger_routes`

Route shell. `generated_from_source='manual'` is the Phase 5B fallback;
`'rentcast'` lands in Phase 5C.

| Column | Type | Notes |
|---|---|---|
| `id` / `business_id` | uuid | |
| `campaign_id` | uuid NULLABLE FK | ON DELETE SET NULL |
| `name` | text NOT NULL | |
| `center_address` | text NULLABLE | |
| `center_lat` / `center_lng` | numeric(10,7) NULLABLE | |
| `radius_miles` | numeric(6,2) NULLABLE | CHECK > 0 |
| `target_home_count` | integer NULLABLE | CHECK > 0 |
| `generated_from_source` | text NOT NULL default 'manual' | CHECK in (manual, rentcast) |
| `status` | text NOT NULL default 'draft' | CHECK in (draft, ready, in_progress, completed, paused) |
| `total_route_stops` | integer NOT NULL default 0 | CHECK >= 0 |
| `estimated_time_seconds` | integer NULLABLE | CHECK >= 0 |
| `notes` | text NULLABLE | |
| timestamps | standard | |

### `door_hanger_route_stops`

One row per candidate / actual home on a route. Designed for the Phase
5C RentCast generation flow.

| Column | Type | Notes |
|---|---|---|
| `id` / `business_id` | uuid | |
| `route_id` | uuid NOT NULL FK | ON DELETE CASCADE |
| `stop_order` | integer NULLABLE | CHECK >= 0 when set |
| `address` | text NOT NULL | |
| `city` / `state` / `postal_code` | text NULLABLE | |
| `lat` / `lng` | numeric(10,7) NULLABLE | |
| `property_type` | text NULLABLE | |
| `square_footage` | integer NULLABLE | CHECK >= 0 |
| `estimated_value_cents` | bigint NULLABLE | |
| `rentcast_snapshot` | jsonb NULLABLE | safe-subset of provider response |
| `status` | text NOT NULL default 'pending' | CHECK in (pending, completed, skipped) |
| timestamps | standard | |

### `door_hanger_distribution_sessions`

One row per distribution session. Phase 5B writes only `mode='real'`;
Phase 6+ simulation will write `mode='simulated'` through the same
table.

| Column | Type | Notes |
|---|---|---|
| `id` / `business_id` | uuid | |
| `campaign_id` / `route_id` / `design_id` | uuid NULLABLE FK | ON DELETE SET NULL |
| `distributed_at` | timestamptz NOT NULL | |
| `hangers_distributed` | integer NOT NULL | CHECK >= 0 |
| `time_spent_seconds` | integer NULLABLE | CHECK >= 0 |
| `material_cost_cents` | bigint NULLABLE | display helper |
| `notes` | text NULLABLE | |
| `mode` | text NOT NULL default 'real' | CHECK in (real, simulated) |
| timestamps | standard | |

### Seed (Phase 5B-1)

- One `plugin_definitions` row for `door_hanger` (v0.1.0, internal).
- One `installed_plugins` row per Crystal Bear (`status='enabled'`).
- **No** demo campaigns / inventory / routes / sessions — operator
  creates these manually once the Marketing UI ships in Phase 5B-2.

---

## 22c. Simulation (Phase 6)

The Phase 6 simulation workspace is **not** a new table — it is a row
in `businesses` with `is_simulation = true`. The §1 table now carries
that boolean (default `false`, real workspaces unaffected).

Save files / runs are a new plugin-style table that lives only inside
a simulation workspace and is gated to it by application code (server
actions verify `businesses.is_simulation` before insert).

### `simulation_runs` (Phase 6C)

One row per save file / playable timeline inside a simulation
workspace.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | Must be a workspace with `is_simulation=true` (enforced in server actions). |
| `name` | `text` | NOT NULL, CHECK `length(btrim(name)) > 0` | Required, human-readable. |
| `starting_cash_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | Immutable by convention (no edit flow in Phase 6C). |
| `current_cash_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | Seeded equal to `starting_cash_cents`; future gameplay mutates. |
| `simulated_start_at` | `timestamptz` | NOT NULL | Initial simulated date/time. |
| `simulated_current_at` | `timestamptz` | NOT NULL, CHECK ≥ `simulated_start_at` | Seeded equal to `simulated_start_at`; future gameplay advances. |
| `status` | `text` | NOT NULL, default `'draft'`, CHECK in (`draft`, `active`, `paused`, `archived`) | Single-active-save rule enforced in server actions. |
| `notes` | `text` | NULLABLE | Operator notes. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Indexes:**
- `idx_simulation_runs_business` on `(business_id)`
- `idx_simulation_runs_business_status` on `(business_id, status)`
- `idx_simulation_runs_business_created` on `(business_id, created_at desc)`

**RLS:** Pattern B (matches Phase 1 `contacts/leads/quotes/tasks` and
Phase 5 `door_hanger_*`). Authenticated business members may
`SELECT`; `INSERT / UPDATE / DELETE` go through the Phase 6C admin
server actions using the service-role client.

**Single-active-save rule:** at most one row per `business_id` has
`status = 'active'`. The rule is enforced by
`markSimulationRunActiveAction` / `createSimulationRunAction` (in
`src/app/admin/simulation/actions.ts`) — when a save is marked
active, every other `status='active'` row on the same workspace drops
to `paused`. `draft` and `archived` rows are not touched. A partial
unique index was considered and rejected for Phase 6C because the
demote-then-promote sequence is cleaner in app code.

**Phase 6C does NOT seed any rows.** The operator creates their first
save in the `/admin/simulation` UI.

---


## 22d. Simulation Play (Phase 7B)

Phase 7B is **additive**. It does not create new core CRM tables and
does not modify `simulation_runs`. It extends three existing Door
Hanger tables with nullable simulation columns and introduces one new
table — `simulation_activity` — that holds the gameplay feed shown on
the future `/admin/simulation/play` page (Phase 7C+).

Source of truth:
`docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md` §§5, 7, 9,
10, 11, 12.

### `door_hanger_distribution_sessions` (additive columns)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `simulation_run_id` | `uuid` | NULLABLE, FK → `simulation_runs(id)` ON DELETE SET NULL | NULL for `mode='real'`. Simulated sessions carry the active save's id (enforced in application code). |
| `seconds_per_hanger` | `integer` | NULLABLE, CHECK `seconds_per_hanger IS NULL OR >= 1` | Session-level time cost. Default 30 set at insert time by the Phase 7D adapter (not a DB default). |
| `status` | `text` | NOT NULL default `'completed'`, CHECK in (`active`, `completed`, `paused`) | Existing Phase 5B real-mode rows backfill to `'completed'` via the default. Simulated sessions start `'active'` and flip on Finish (§11). |
| `started_at` | `timestamptz` | NULLABLE | Set when status flips to `active`. Mirrors `distributed_at` for historical real-mode rows when needed. |
| `ended_at` | `timestamptz` | NULLABLE, CHECK `started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at` | Set when status flips to `completed` or `paused`. |

**Indexes:**
- `idx_door_hanger_sessions_simulation_run` on `(simulation_run_id)`
- `idx_door_hanger_sessions_business_status` on `(business_id, status)`

The existing `mode` column (`real | simulated`) continues to gate
which rows participate in Phase 7 gameplay queries. Phase 7B does not
change RLS posture on this table.

### `door_hanger_routes` (additive column)

| Column | Type | Notes |
|---|---|---|
| `last_completed_at` | `timestamptz` NULLABLE | Set when a route is genuinely completed (Phase 7D Finish flow). NULL until the route is finished. Cooldown filtering (default 2-month) is deferred. |

### `door_hanger_route_stops` (additive column)

| Column | Type | Notes |
|---|---|---|
| `completed_at` | `timestamptz` NULLABLE | Set when a stop's `status` flips to `completed` by the Phase 7D Hang actions. NULL otherwise. |

### `simulation_activity` (new table)

One row per gameplay event inside a simulation save. Deliberately
separate from core `events` and `activities` so simulation traffic
does not pollute real CRM observability and existing queries do not
need a simulation filter.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | Simulation workspace. |
| `simulation_run_id` | `uuid` | NOT NULL, FK → `simulation_runs(id)` ON DELETE CASCADE | Save file the event belongs to. Cascade matches expected reset semantics. |
| `plugin_key` | `text` | NULLABLE | `door_hanger` for Phase 7 rows. Future plugins write their own key. |
| `action_type` | `text` | NOT NULL, CHECK `length(btrim(action_type)) > 0` | e.g. `door_hanger.session_started`, `door_hanger.hang_one`. Taxonomy lives in `src/plugins/door-hanger/simulation/adapter.ts`. |
| `summary` | `text` | NOT NULL, CHECK `length(btrim(summary)) > 0` | One-line human-readable string for the feed. |
| `simulated_at` | `timestamptz` | NOT NULL | Value of `simulation_runs.simulated_current_at` **after** the action committed. |
| `metadata` | `jsonb` | NULLABLE | Optional structured payload (route id, stop count, inventory delta). Schema not enforced. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Real wall-clock insert. Feed ordering uses this. |

**Indexes:**
- `idx_simulation_activity_business` on `(business_id)`
- `idx_simulation_activity_run_created` on `(simulation_run_id, created_at desc)`
- `idx_simulation_activity_business_created` on `(business_id, created_at desc)`
- `idx_simulation_activity_action_type` on `(action_type)`

**RLS:** Pattern B. Authenticated business members may `SELECT`;
`INSERT / UPDATE / DELETE` go through `appendSimulationActivity`
(`src/core/simulation/activity.ts`) using the service-role client.

**Phase 7B does NOT seed any rows** — the operator generates these by
playing the simulation in Phase 7D+. No gameplay UI exists yet at the
close of Phase 7B; the table sits ready for Phase 7C/7D to write
into.

## 22e. Door Hanger route cooldown (Phase 8B)

Phase 8B is additive. It adds a single column to `door_hanger_routes`
to support the Phase 8 map workspace's cooldown display. No other
table changes; no new RLS policies or grants.

Source of truth:
`docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md` §11.

### `door_hanger_routes` (additive column)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `cooldown_days` | `integer` NOT NULL default `60` | CHECK `cooldown_days >= 0` | Per-route retargeting window in days. Combined with `door_hanger_route_stops.completed_at` to compute per-stop `next_eligible_at` (`completed_at + cooldown_days days`). Existing routes back-fill to 60 via the column default. |

**Display-only in Phase 8.** RentCast route generation does **not**
filter candidates by cooldown — that remains deferred. Cross-route
property dedupe is also still deferred.

The Phase 8 reference time for cooldown calculations is `now()` in
real workspaces and the active save's `simulated_current_at` in
simulation workspaces (see `getDoorHangerRouteMapReferenceTime` in
`src/core/door-hanger/cooldown.ts`).

---

## 22f. Jobs + Job Line Items (Phase 9B)

Phase 9B introduces the core **Job** object — a Jobber-style work
order — and per-job line items. Two new tables, both `business_id`-
scoped with RLS Pattern B. No invoices, payments, visits, or
scheduling-calendar tables in Phase 9.

Source of truth:
`docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md` §§14, 18.

### `jobs`

One row per work order. Created from a quote (snapshot) or
manually from a contact + property.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | Scope + RLS. |
| `contact_id` | `uuid` | NOT NULL, FK → `contacts(id)` ON DELETE CASCADE | A job without a customer is meaningless. |
| `property_id` | `uuid` | NULLABLE, FK → `properties(id)` ON DELETE SET NULL | Indoor add-ons / future product sales may not bind to a property. |
| `quote_id` | `uuid` | NULLABLE, FK → `quotes(id)` ON DELETE SET NULL | Set on quote → job conversion. Not unique; a quote may seed multiple jobs over time. |
| `title` | `text` | NOT NULL, CHECK `length(btrim(title)) > 0` | Required. |
| `summary` | `text` | NULLABLE | Optional longer description. |
| `status` | `text` | NOT NULL default `'draft'`, CHECK in (`draft`, `unscheduled`, `scheduled`, `in_progress`, `completed`, `canceled`) | Plain text enum; no guarded state machine in Phase 9. |
| `source` | `text` | NOT NULL default `'manual'`, CHECK in (`manual`, `quote`) | Drives "Created from quote" display. |
| `scheduled_start_at` | `timestamptz` | NULLABLE | Phase 9 stores a simple timestamp; no calendar UI yet. |
| `scheduled_end_at` | `timestamptz` | NULLABLE, CHECK `end >= start` when both present | |
| `arrival_window_label` | `text` | NULLABLE | Free-form ("8–10 AM"). |
| `estimated_total_cents` | `bigint` | NOT NULL default `0`, CHECK ≥ 0 | App-maintained snapshot recomputed from `job_line_items` after every line-item mutation. |
| `created_at` / `updated_at` | `timestamptz` | standard | |

**Indexes:**
- `(business_id)`
- `(business_id, status)`
- `(business_id, created_at desc)`
- `(business_id, scheduled_start_at)`
- `(contact_id)` — contact-hub jobs list (Phase 9C)
- `(quote_id)` — jumping from a quote to its jobs

**RLS:** Pattern B. Authenticated members may `SELECT`; INSERT /
UPDATE / DELETE go through the Phase 9B server helpers
(`src/core/jobs/admin-create.ts`) using the service-role client.

### `job_line_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | |
| `job_id` | `uuid` | NOT NULL, FK → `jobs(id)` ON DELETE CASCADE | |
| `service_id` | `uuid` | NULLABLE, FK → `services(id)` ON DELETE SET NULL | Set when the line came from the service catalog. |
| `name` | `text` | NOT NULL, CHECK non-empty | Human label. |
| `description` | `text` | NULLABLE | Optional notes for the line. |
| `quantity` | `numeric(10,2)` | NOT NULL default `1`, CHECK > 0 | Numeric so half-units / time-based services work later. |
| `unit_price_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | |
| `total_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | App-computed `round(quantity * unit_price_cents)`. The DB CHECKs are the safety net; the pure helper `computeJobLineItemTotal` is the source of truth. |
| `sort_order` | `integer` | NULLABLE | Render order. NULL = end. |
| `source` | `text` | NOT NULL, CHECK in (`quote`, `service`, `custom`) | Records how the line originated. |
| `created_at` / `updated_at` | `timestamptz` | standard | |

**Indexes:**
- `(business_id)`
- `(business_id, job_id)`
- `(job_id, sort_order asc nulls last, created_at asc)` — render order

**RLS:** Pattern B.

### Line items are the source of truth for job totals

`jobs.estimated_total_cents` is a maintained **snapshot** of
`sum(job_line_items.total_cents)`. Every Phase 9B server helper
that touches line items (create job, add / update / remove line
item) calls `recomputeJobEstimatedTotal(businessId, jobId)` in the
same handler. The DB CHECK `estimated_total_cents >= 0` is the
safety net. The application code is the source of truth.

### What Phase 9B does NOT add

- No invoice / invoice_line_items table.
- No payments / payment_methods / refunds tables.
- No visits / appointments / calendar_events table.
- No crew / technician / assignment tables.
- No recurring schedule / agreement tables.
- No taxes / discounts / deposits columns.
- No customer notifications / job_reminder rows.
- No simulation-specific jobs table.

Each belongs to a future foundation phase.

**Phase 9B does NOT seed any rows** — operators create jobs through
the Phase 9D manual flow and the Phase 9E quote-to-job conversion.

---

## 22g. Invoices + Invoice Line Items + Invoice Payments (Phase 11B)

Phase 11B introduces the **billing snapshot** layer after Jobs +
Schedule. Three new tables, all `business_id`-scoped with RLS
Pattern B. No payment-processor integration, no refund table, no
taxes / discounts / deposits columns, no receipt-template tables,
no customer-facing public columns in Phase 11.

Source of truth:
`docs/PHASE_11_INVOICE_AND_PAYMENT_RECORDING_FOUNDATION.md`
§§20–21.

### `invoices`

One row per billing snapshot. Created from a completed job (via
the Phase 11D Complete Job confirmation modal) or manually from
the job detail page fallback. **Every invoice anchors to a job**
— no free-floating invoices in Phase 11.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | Scope + RLS. |
| `contact_id` | `uuid` | NOT NULL, FK → `contacts(id)` ON DELETE CASCADE | Copied from the source job. |
| `property_id` | `uuid` | NULLABLE, FK → `properties(id)` ON DELETE SET NULL | Copied from the source job. |
| `job_id` | `uuid` | NOT NULL, FK → `jobs(id)` ON DELETE CASCADE | The source job. Not unique; a job may have multiple invoices over time (§6). |
| `invoice_number` | `text` | NULLABLE, CHECK non-empty when present | Human-friendly id. Auto-numbering deferred to Phase 11F. |
| `status` | `text` | NOT NULL default `'unpaid'`, CHECK in (`draft`, `unpaid`, `paid`, `void`) | Plain text enum; status flips `unpaid → paid` automatically when balance hits zero. |
| `source` | `text` | NOT NULL default `'job_completion'`, CHECK in (`job_completion`, `manual`) | Drives display + activity. |
| `subtotal_cents` | `bigint` | NOT NULL default `0`, CHECK ≥ 0 | App-maintained snapshot. |
| `total_cents` | `bigint` | NOT NULL default `0`, CHECK ≥ 0 | Phase 11 = `subtotal_cents`. |
| `amount_paid_cents` | `bigint` | NOT NULL default `0`, CHECK ≥ 0 | App-maintained snapshot of `sum(invoice_payments.amount_cents)`. |
| `balance_cents` | `bigint` | NOT NULL default `0`, CHECK ≥ 0 | App-maintained `total_cents - amount_paid_cents`. Overpayment is rejected at the action layer (§12 of the Phase 11 doc); the DB CHECK is the safety net. |
| `paid_at` | `timestamptz` | NULLABLE | Set when status flips `unpaid → paid`. |
| `receipt_sent_at` | `timestamptz` | NULLABLE | Manual operator timestamp; Phase 11E "Mark Receipt Sent" action sets it. No SMS/email/automation. |
| `created_at` / `updated_at` | `timestamptz` | standard | |

**Indexes:**
- `(business_id)`
- `(business_id, status)`
- `(business_id, created_at desc)`
- `(business_id, paid_at)` — "paid in the last X" queries
- `(contact_id)` — contact-hub invoices list
- `(job_id)` — job-detail invoices section

**RLS:** Pattern B. Authenticated members may `SELECT`; INSERT /
UPDATE / DELETE go through the Phase 11B server helpers
(`src/core/invoices/admin-create.ts`) using the service-role
client.

### `invoice_line_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | |
| `invoice_id` | `uuid` | NOT NULL, FK → `invoices(id)` ON DELETE CASCADE | |
| `job_line_item_id` | `uuid` | NULLABLE, FK → `job_line_items(id)` ON DELETE SET NULL | Traceability to the source job line. |
| `service_id` | `uuid` | NULLABLE, FK → `services(id)` ON DELETE SET NULL | Copied from the source line when set. |
| `name` | `text` | NOT NULL, CHECK non-empty | Human label. |
| `description` | `text` | NULLABLE | Optional notes. |
| `quantity` | `numeric(10,2)` | NOT NULL default `1`, CHECK > 0 | |
| `unit_price_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | |
| `total_cents` | `bigint` | NOT NULL, CHECK ≥ 0 | App-computed `round(quantity * unit_price_cents)`. |
| `sort_order` | `integer` | NULLABLE | Render order. NULL = end. |
| `source` | `text` | NOT NULL, CHECK in (`job`, `custom`) | Phase 11 primarily uses `job`; `custom` reserved for a future "add line item to invoice" path. |
| `created_at` / `updated_at` | `timestamptz` | standard | |

**Indexes:**
- `(business_id)`
- `(business_id, invoice_id)`
- `(invoice_id, sort_order asc nulls last, created_at asc)`
- `(job_line_item_id)` — traceability

**RLS:** Pattern B.

### `invoice_payments`

Append-only audit trail. No edit / delete UI in Phase 11.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `business_id` | `uuid` | NOT NULL, FK → `businesses(id)` ON DELETE CASCADE | |
| `invoice_id` | `uuid` | NOT NULL, FK → `invoices(id)` ON DELETE CASCADE | |
| `amount_cents` | `bigint` | NOT NULL, CHECK > 0 | Refunds / negative rows are out of scope. |
| `payment_method` | `text` | NOT NULL, CHECK in (`cash`, `check`, `card`, `zelle`, `other`) | No payment-processor integration in Phase 11. |
| `paid_at` | `timestamptz` | NOT NULL | Operator-supplied; defaults to `now()` in the modal. |
| `notes` | `text` | NULLABLE | Check number, confirmation hash, etc. |
| `created_at` | `timestamptz` | standard | No `updated_at` — payments are append-only. |

**Indexes:**
- `(business_id)`
- `(business_id, invoice_id)`
- `(business_id, paid_at desc)`

**RLS:** Pattern B.

### Line items + payments are the source of truth for invoice totals

`invoices.{subtotal_cents, total_cents, amount_paid_cents,
balance_cents}` are maintained **snapshots** of the underlying
sums. Every Phase 11B server helper that touches line items or
payments calls `recomputeInvoiceTotals(businessId, invoiceId)` in
the same handler. The DB CHECKs (`*_cents >= 0`,
`balance_cents >= 0`) are the safety net. The application code is
the source of truth.

### Status flip rule

After a payment lands, the pure helper
`deriveInvoicePaymentStatus` (in `src/core/invoices/totals.ts`)
decides whether to flip `unpaid` / `draft` → `paid` and set
`paid_at` to the payment's `paid_at`. `paid` stays `paid`; `void`
never auto-flips. The action layer enforces the same rule the
helper expresses; the helper is the testable single source of
truth.

### What Phase 11B does NOT add

- No payment-processor / Stripe / Square / payment-link tables.
- No `invoice_refunds` table.
- No taxes / discounts / deposits / surcharges columns.
- No `due_at` / `overdue_at` columns.
- No `sent_at` / email / SMS receipt-delivery columns (only the
  manual `receipt_sent_at`).
- No QuickBooks / Xero / accounting-sync columns.
- No customer-facing / public-token columns.
- No changes to `jobs` / `contacts` / `properties` / `services`.
- No unique constraint on `(job_id)` — a job may have multiple
  invoices (§6, §16 of the Phase 11 doc).

Each belongs to a future foundation phase.

**Phase 11B does NOT seed any rows** — operators create invoices
through the Phase 11D Complete Job flow and the manual fallback.

---

## 23. Deferred Tables

Do not implement these in Phase 1 unless explicitly re-scoped later:

- jobs
- appointments
- scheduling calendar
- invoices
- payments
- receipts
- recurring service agreements
- job pool
- technician workflows
- workflow blueprints/instances
- files/attachments
- data importer
- campaigns
- goals
- strategies
- outcomes
- attribution engine
- full reporting snapshots
- AI agents
- context engine advanced tables

Document them in future planning docs, but do not create Phase 1 migrations for them.
