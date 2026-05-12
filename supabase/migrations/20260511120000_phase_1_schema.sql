-- =========================================================================
-- Home Service Operating Platform — Phase 1 schema migration
-- Source of truth: schema.md
-- Scope: tables, FKs, indexes, partial unique indexes, RLS enables only.
-- This migration does NOT add RLS policies (drafted separately for review).
-- This migration does NOT seed data.
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- updated_at trigger helper
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- 1. Platform / Business
-- =========================================================================

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  primary_industry text,
  phone text,
  email text,
  website text,
  logo_url text,
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger businesses_set_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. Users, Memberships, Roles, Permissions
-- =========================================================================

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_profiles_set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

create table public.role_blueprints (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  default_permissions jsonb,
  created_at timestamptz not null default now()
);

create table public.business_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role_blueprint_id uuid references public.role_blueprints(id) on delete set null,
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);
create trigger business_roles_set_updated_at before update on public.business_roles
  for each row execute function public.set_updated_at();

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  status text not null default 'active',
  default_role_id uuid references public.business_roles(id) on delete set null,
  invited_by_user_id uuid references public.user_profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create trigger business_memberships_set_updated_at before update on public.business_memberships
  for each row execute function public.set_updated_at();

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  role_id uuid not null references public.business_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, role_id)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role_id uuid not null references public.business_roles(id) on delete cascade,
  capability text not null,
  scope text not null default 'all_business',
  conditions jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, role_id, capability, scope)
);

create table public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  capability text not null,
  scope text not null,
  effect text not null,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 3. App Surfaces and Custom Domains
-- =========================================================================

create table public.app_surface_blueprints (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  surface_type text not null,
  description text,
  default_config jsonb,
  created_at timestamptz not null default now()
);

create table public.app_surfaces (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  blueprint_id uuid references public.app_surface_blueprints(id) on delete set null,
  name text not null,
  slug text not null,
  surface_type text not null,
  status text not null default 'active',
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);
create trigger app_surfaces_set_updated_at before update on public.app_surfaces
  for each row execute function public.set_updated_at();

create table public.role_app_surface_access (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role_id uuid not null references public.business_roles(id) on delete cascade,
  app_surface_id uuid not null references public.app_surfaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, app_surface_id)
);

create table public.user_app_surface_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  app_surface_id uuid not null references public.app_surfaces(id) on delete cascade,
  effect text not null,
  created_at timestamptz not null default now()
);

create table public.app_surface_domains (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  app_surface_id uuid not null references public.app_surfaces(id) on delete cascade,
  domain text not null unique,
  domain_type text not null,
  status text not null default 'pending',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_surface_domains_set_updated_at before update on public.app_surface_domains
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 4. Plugin Registry
-- =========================================================================

create table public.plugin_definitions (
  id uuid primary key default gen_random_uuid(),
  plugin_key text not null unique,
  name text not null,
  description text,
  current_version text not null,
  manifest jsonb not null,
  is_internal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plugin_definitions_set_updated_at before update on public.plugin_definitions
  for each row execute function public.set_updated_at();

create table public.installed_plugins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plugin_definition_id uuid not null references public.plugin_definitions(id) on delete restrict,
  plugin_key text not null,
  installed_version text not null,
  status text not null default 'enabled',
  settings jsonb,
  installed_by_user_id uuid references public.user_profiles(id) on delete set null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, plugin_key)
);
create trigger installed_plugins_set_updated_at before update on public.installed_plugins
  for each row execute function public.set_updated_at();

create table public.plugin_ui_registrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  installed_plugin_id uuid not null references public.installed_plugins(id) on delete cascade,
  ui_key text not null,
  surface_type text not null,
  slot text not null,
  component_key text not null,
  config jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plugin_action_registrations (
  id uuid primary key default gen_random_uuid(),
  plugin_definition_id uuid not null references public.plugin_definitions(id) on delete cascade,
  action_key text not null,
  name text not null,
  description text,
  input_schema jsonb not null,
  output_schema jsonb not null,
  risk_level text not null default 'low',
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plugin_definition_id, action_key)
);

-- =========================================================================
-- 5. Data Dictionary / Schema Registry
-- =========================================================================

create table public.data_dictionary_fields (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  object_type text not null,
  field_key text not null,
  display_name text not null,
  description text,
  data_type text not null,
  owner_type text not null,
  owner_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 6. Business Settings
-- =========================================================================

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  value jsonb not null,
  category text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);
create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 7. Service Areas
-- =========================================================================

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  match_type text not null default 'city',
  match_value text not null,
  status text not null default 'active',
  pricing_modifier jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, match_type, match_value)
);
create trigger service_areas_set_updated_at before update on public.service_areas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 8. Services, Service Plans, Add-ons
-- =========================================================================

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  service_code text not null,
  description text,
  is_base_service boolean not null default true,
  is_add_on boolean not null default false,
  requires_service_id uuid references public.services(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, service_code)
);
create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

create table public.service_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  name text not null,
  frequency_months integer,
  display_label text not null,
  is_recurring_intent boolean not null default false,
  is_recommended boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);
create trigger service_plans_set_updated_at before update on public.service_plans
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 9. Pricing
-- =========================================================================

create table public.price_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  service_id uuid references public.services(id) on delete set null,
  service_plan_id uuid references public.service_plans(id) on delete set null,
  rule_type text not null,
  rule_config jsonb not null,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);
create trigger price_rules_set_updated_at before update on public.price_rules
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 10. Contacts
-- =========================================================================

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null,
  first_name text,
  last_name text,
  phone text not null,
  email text not null,
  status text not null default 'active',
  source text,
  created_from_app_surface_id uuid references public.app_surfaces(id) on delete set null,
  created_from_plugin_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 11. Properties
-- =========================================================================

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text,
  country text not null default 'US',
  formatted_address text not null,
  google_place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  service_area_id uuid references public.service_areas(id) on delete set null,
  service_area_status text not null default 'unknown',
  square_footage integer,
  property_type text,
  lot_size_sqft integer,
  year_built integer,
  bedrooms numeric(4,1),
  bathrooms numeric(4,1),
  property_data_source text,
  property_data_provider_id text,
  property_data_confidence text,
  property_data_status text not null default 'unknown',
  last_enriched_at timestamptz,
  provider_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 12. Leads
-- =========================================================================
-- Note: quote_page_interaction_id is a soft reference (no FK) per decision 0001 §8.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null,
  customer_intent text not null default 'schedule_requested',
  source text,
  tracking_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  created_from_app_surface_id uuid references public.app_surfaces(id) on delete set null,
  created_from_plugin_key text,
  quote_page_interaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 13. Quotes
-- =========================================================================
-- Note: quote_page_interaction_id is a soft reference (no FK) per decision 0001 §8.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'submitted',
  customer_intent text not null default 'schedule_requested',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source_plugin_key text not null,
  source_plugin_version text not null,
  selected_service_plan_id uuid references public.service_plans(id) on delete set null,
  selected_option_key text,
  selected_add_ons jsonb,
  selected_total numeric(10,2),
  options_snapshot jsonb not null,
  line_items_snapshot jsonb not null,
  price_snapshot jsonb not null,
  calculation_snapshot jsonb not null,
  property_snapshot jsonb,
  source text,
  tracking_code text,
  created_from_app_surface_id uuid references public.app_surfaces(id) on delete set null,
  quote_page_interaction_id uuid,
  updated_at timestamptz not null default now()
);
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 14. Customer Quote / Sales Page Plugin Tables
-- =========================================================================

create table public.quote_page_interactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  app_surface_id uuid not null references public.app_surfaces(id) on delete cascade,
  installed_plugin_id uuid references public.installed_plugins(id) on delete set null,
  plugin_version text not null,
  session_key text,
  address_input text,
  normalized_address jsonb,
  normalized_city text,
  google_place_id text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  service_area_status text not null default 'unknown',
  property_data_status text not null default 'not_requested',
  property_data_summary jsonb,
  provider_error text,
  interaction_status text not null,
  quote_preview_data jsonb,
  selected_option_key text,
  selected_add_ons jsonb,
  selected_total numeric(10,2),
  source text,
  tracking_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  converted_contact_id uuid references public.contacts(id) on delete set null,
  converted_property_id uuid references public.properties(id) on delete set null,
  converted_lead_id uuid references public.leads(id) on delete set null,
  converted_quote_id uuid references public.quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger quote_page_interactions_set_updated_at before update on public.quote_page_interactions
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 16. Events (created before tasks because tasks reference events)
-- =========================================================================

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  schema_version integer not null default 1,
  description text,
  payload_schema jsonb not null,
  owner_type text not null,
  owner_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_type, schema_version)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  schema_version integer not null default 1,
  payload jsonb not null,
  source_type text not null,
  source_key text,
  related_object_type text,
  related_object_id uuid,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 15. Tasks
-- =========================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  task_category text not null default 'admin_review',
  assigned_role_id uuid references public.business_roles(id) on delete set null,
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  related_object_type text,
  related_object_id uuid,
  source_plugin_key text,
  source_event_id uuid references public.events(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 17. Activities
-- =========================================================================

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  actor_type text not null default 'system',
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  source_plugin_key text,
  activity_type text not null,
  summary text not null,
  details jsonb,
  related_object_type text,
  related_object_id uuid,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 18. Notes
-- =========================================================================

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  body text not null,
  visibility text not null default 'all_internal',
  author_user_id uuid references public.user_profiles(id) on delete set null,
  related_object_type text not null,
  related_object_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 19. Issues / Bugs
-- =========================================================================

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  issue_type text not null,
  status text not null default 'open',
  severity text not null default 'medium',
  source_plugin_key text,
  app_surface_id uuid references public.app_surfaces(id) on delete set null,
  related_object_type text,
  related_object_id uuid,
  plugin_version text,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger issues_set_updated_at before update on public.issues
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 20. Messages / Conversations placeholder
-- =========================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null,
  provider text,
  provider_conversation_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null,
  direction text not null,
  message_type text,
  body text,
  status text,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 21. Record Links
-- =========================================================================

create table public.record_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_object_type text not null,
  source_object_id uuid not null,
  target_object_type text not null,
  target_object_id uuid not null,
  relationship_type text not null,
  source_plugin_key text,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- 22. Rate-limit events (decision 0001 §4)
-- Phase 1 Supabase-backed rate limiter store.
-- Service-role only access; no business_id scope.
-- =========================================================================

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  action_key text not null,
  normalized_address_hash text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Indexes
-- =========================================================================

-- business_id baseline for high-traffic business-owned tables
create index idx_business_memberships_business on public.business_memberships(business_id);
create index idx_business_memberships_user on public.business_memberships(user_id);
create index idx_business_roles_business on public.business_roles(business_id);
create index idx_membership_roles_business on public.membership_roles(business_id);
create index idx_membership_roles_membership on public.membership_roles(membership_id);
create index idx_role_permissions_role on public.role_permissions(business_id, role_id);
create index idx_user_permission_overrides_user on public.user_permission_overrides(business_id, user_id);

create index idx_app_surfaces_business on public.app_surfaces(business_id);
create index idx_app_surface_domains_business on public.app_surface_domains(business_id);
create index idx_app_surface_domains_surface on public.app_surface_domains(app_surface_id);

create index idx_installed_plugins_business on public.installed_plugins(business_id);
create index idx_installed_plugins_definition on public.installed_plugins(plugin_definition_id);
create index idx_plugin_ui_registrations_business on public.plugin_ui_registrations(business_id);
create index idx_plugin_ui_registrations_plugin on public.plugin_ui_registrations(installed_plugin_id);
create index idx_plugin_action_registrations_definition on public.plugin_action_registrations(plugin_definition_id);

create index idx_data_dictionary_fields_business on public.data_dictionary_fields(business_id);
create index idx_data_dictionary_fields_object on public.data_dictionary_fields(object_type, field_key);

create index idx_business_settings_business on public.business_settings(business_id);
create index idx_service_areas_business on public.service_areas(business_id);
create index idx_service_areas_match on public.service_areas(business_id, match_type, match_value);

create index idx_services_business on public.services(business_id);
create index idx_service_plans_business on public.service_plans(business_id);
create index idx_price_rules_business on public.price_rules(business_id);
create index idx_price_rules_service on public.price_rules(business_id, service_id);

-- contacts per schema.md
create index idx_contacts_business on public.contacts(business_id);
create index idx_contacts_business_email on public.contacts(business_id, email);
create index idx_contacts_business_phone on public.contacts(business_id, phone);

-- properties per schema.md
create index idx_properties_business on public.properties(business_id);
create index idx_properties_business_place_id on public.properties(business_id, google_place_id);
create index idx_properties_business_formatted on public.properties(business_id, formatted_address);
create index idx_properties_business_contact on public.properties(business_id, contact_id);

-- leads
create index idx_leads_business on public.leads(business_id);
create index idx_leads_business_status on public.leads(business_id, status);
create index idx_leads_business_contact on public.leads(business_id, contact_id);
create index idx_leads_business_created_at on public.leads(business_id, created_at desc);
create index idx_leads_quote_page_interaction on public.leads(business_id, quote_page_interaction_id);

-- quotes
create index idx_quotes_business on public.quotes(business_id);
create index idx_quotes_business_status on public.quotes(business_id, status);
create index idx_quotes_business_contact on public.quotes(business_id, contact_id);
create index idx_quotes_business_lead on public.quotes(business_id, lead_id);
create index idx_quotes_business_created_at on public.quotes(business_id, created_at desc);
create index idx_quotes_business_expires_at on public.quotes(business_id, expires_at);
create index idx_quotes_quote_page_interaction on public.quotes(business_id, quote_page_interaction_id);

-- quote_page_interactions per schema.md
create index idx_qpi_business_created on public.quote_page_interactions(business_id, created_at desc);
create index idx_qpi_business_status on public.quote_page_interactions(business_id, interaction_status);
create index idx_qpi_business_converted_lead on public.quote_page_interactions(business_id, converted_lead_id);
create index idx_qpi_business_tracking on public.quote_page_interactions(business_id, tracking_code);
create index idx_qpi_business_surface on public.quote_page_interactions(business_id, app_surface_id);

-- tasks
create index idx_tasks_business on public.tasks(business_id);
create index idx_tasks_business_status on public.tasks(business_id, status);
create index idx_tasks_business_category on public.tasks(business_id, task_category);
create index idx_tasks_related_object on public.tasks(business_id, related_object_type, related_object_id);
create index idx_tasks_assigned_user on public.tasks(business_id, assigned_user_id);

-- events
create index idx_events_business_created on public.events(business_id, created_at desc);
create index idx_events_business_type on public.events(business_id, event_type);
create index idx_events_related_object on public.events(business_id, related_object_type, related_object_id);

-- activities
create index idx_activities_business_created on public.activities(business_id, created_at desc);
create index idx_activities_business_type on public.activities(business_id, activity_type);
create index idx_activities_related_object on public.activities(business_id, related_object_type, related_object_id);

-- notes
create index idx_notes_business on public.notes(business_id);
create index idx_notes_related_object on public.notes(business_id, related_object_type, related_object_id);

-- issues
create index idx_issues_business on public.issues(business_id);
create index idx_issues_business_status on public.issues(business_id, status);
create index idx_issues_business_type on public.issues(business_id, issue_type);

-- conversations / messages
create index idx_conversations_business on public.conversations(business_id);
create index idx_conversations_business_contact on public.conversations(business_id, contact_id);
create index idx_messages_business_conversation on public.messages(business_id, conversation_id);
create index idx_messages_business_contact on public.messages(business_id, contact_id);

-- record_links
create index idx_record_links_business on public.record_links(business_id);
create index idx_record_links_source on public.record_links(business_id, source_object_type, source_object_id);
create index idx_record_links_target on public.record_links(business_id, target_object_type, target_object_id);

-- rate_limit_events (decision 0001 §4)
create index idx_rate_limit_ip on public.rate_limit_events(action_key, ip_hash, created_at desc);
create index idx_rate_limit_address on public.rate_limit_events(action_key, normalized_address_hash, created_at desc);
create index idx_rate_limit_created_at on public.rate_limit_events(created_at);

-- -------------------------------------------------------------------------
-- Partial unique indexes for data_dictionary_fields
-- (decision 0001 §9 — global vs business-scoped fields must not duplicate;
-- NULLS NOT DISTINCT handles the nullable owner_key column).
-- -------------------------------------------------------------------------
create unique index data_dictionary_fields_business_unique
  on public.data_dictionary_fields (business_id, object_type, field_key, owner_type, owner_key)
  nulls not distinct
  where business_id is not null;

create unique index data_dictionary_fields_global_unique
  on public.data_dictionary_fields (object_type, field_key, owner_type, owner_key)
  nulls not distinct
  where business_id is null;

-- =========================================================================
-- RLS enable (no policies in this migration — drafted in decision 0002)
-- Enabled on businesses + every table with business_id.
-- Global/system tables (user_profiles, role_blueprints, app_surface_blueprints,
-- plugin_definitions, plugin_action_registrations, event_types, rate_limit_events)
-- are NOT enabled here; their RLS treatment is deferred to the policy review.
-- =========================================================================

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_roles enable row level security;
alter table public.membership_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.app_surfaces enable row level security;
alter table public.role_app_surface_access enable row level security;
alter table public.user_app_surface_overrides enable row level security;
alter table public.app_surface_domains enable row level security;
alter table public.installed_plugins enable row level security;
alter table public.plugin_ui_registrations enable row level security;
alter table public.data_dictionary_fields enable row level security;
alter table public.business_settings enable row level security;
alter table public.service_areas enable row level security;
alter table public.services enable row level security;
alter table public.service_plans enable row level security;
alter table public.price_rules enable row level security;
alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_page_interactions enable row level security;
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.activities enable row level security;
alter table public.notes enable row level security;
alter table public.issues enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.record_links enable row level security;
