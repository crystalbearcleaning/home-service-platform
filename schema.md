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
- door hanger routes
- door hanger route stops
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
