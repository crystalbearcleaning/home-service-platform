-- =========================================================================
-- Home Service Operating Platform — Phase 1 RLS policies
-- Pairs with: 20260511120000_phase_1_schema.sql
-- Source: docs/decisions/0002-rls-policy-draft.md plus reviewer adjustments.
-- =========================================================================
-- Categories:
--   Pattern A — full member CRUD for low-risk admin/config tables (11 tables).
--   Pattern B — authenticated members SELECT only; writes service_role only.
--   Special  — bespoke policies (businesses, business_memberships,
--              data_dictionary_fields, notes, user_profiles).
--   Reference— authenticated SELECT only; writes service_role only.
--   Locked   — RLS enabled with NO policies (service_role only).
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS so
-- this migration can be re-run safely in development. All policy creation
-- runs inside a single transaction.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- Helper function: is the caller an active member of the given business?
-- -------------------------------------------------------------------------
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Enable RLS on tables not already enabled by the schema migration.
-- -------------------------------------------------------------------------
alter table public.user_profiles               enable row level security;
alter table public.role_blueprints             enable row level security;
alter table public.app_surface_blueprints      enable row level security;
alter table public.plugin_definitions          enable row level security;
alter table public.plugin_action_registrations enable row level security;
alter table public.event_types                 enable row level security;
alter table public.rate_limit_events           enable row level security;

-- =========================================================================
-- PATTERN A — full member CRUD (11 tables)
-- business_roles, membership_roles, role_permissions,
-- user_permission_overrides, app_surfaces, role_app_surface_access,
-- user_app_surface_overrides, app_surface_domains, installed_plugins,
-- plugin_ui_registrations, record_links
-- =========================================================================

-- business_roles ----------------------------------------------------------
drop policy if exists "business_roles_members_select" on public.business_roles;
drop policy if exists "business_roles_members_insert" on public.business_roles;
drop policy if exists "business_roles_members_update" on public.business_roles;
drop policy if exists "business_roles_members_delete" on public.business_roles;

create policy "business_roles_members_select" on public.business_roles
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "business_roles_members_insert" on public.business_roles
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "business_roles_members_update" on public.business_roles
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "business_roles_members_delete" on public.business_roles
  for delete to authenticated
  using (public.is_business_member(business_id));

-- membership_roles --------------------------------------------------------
drop policy if exists "membership_roles_members_select" on public.membership_roles;
drop policy if exists "membership_roles_members_insert" on public.membership_roles;
drop policy if exists "membership_roles_members_update" on public.membership_roles;
drop policy if exists "membership_roles_members_delete" on public.membership_roles;

create policy "membership_roles_members_select" on public.membership_roles
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "membership_roles_members_insert" on public.membership_roles
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "membership_roles_members_update" on public.membership_roles
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "membership_roles_members_delete" on public.membership_roles
  for delete to authenticated
  using (public.is_business_member(business_id));

-- role_permissions --------------------------------------------------------
drop policy if exists "role_permissions_members_select" on public.role_permissions;
drop policy if exists "role_permissions_members_insert" on public.role_permissions;
drop policy if exists "role_permissions_members_update" on public.role_permissions;
drop policy if exists "role_permissions_members_delete" on public.role_permissions;

create policy "role_permissions_members_select" on public.role_permissions
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "role_permissions_members_insert" on public.role_permissions
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "role_permissions_members_update" on public.role_permissions
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "role_permissions_members_delete" on public.role_permissions
  for delete to authenticated
  using (public.is_business_member(business_id));

-- user_permission_overrides ----------------------------------------------
drop policy if exists "user_permission_overrides_members_select" on public.user_permission_overrides;
drop policy if exists "user_permission_overrides_members_insert" on public.user_permission_overrides;
drop policy if exists "user_permission_overrides_members_update" on public.user_permission_overrides;
drop policy if exists "user_permission_overrides_members_delete" on public.user_permission_overrides;

create policy "user_permission_overrides_members_select" on public.user_permission_overrides
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "user_permission_overrides_members_insert" on public.user_permission_overrides
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "user_permission_overrides_members_update" on public.user_permission_overrides
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "user_permission_overrides_members_delete" on public.user_permission_overrides
  for delete to authenticated
  using (public.is_business_member(business_id));

-- app_surfaces ------------------------------------------------------------
drop policy if exists "app_surfaces_members_select" on public.app_surfaces;
drop policy if exists "app_surfaces_members_insert" on public.app_surfaces;
drop policy if exists "app_surfaces_members_update" on public.app_surfaces;
drop policy if exists "app_surfaces_members_delete" on public.app_surfaces;

create policy "app_surfaces_members_select" on public.app_surfaces
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "app_surfaces_members_insert" on public.app_surfaces
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "app_surfaces_members_update" on public.app_surfaces
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "app_surfaces_members_delete" on public.app_surfaces
  for delete to authenticated
  using (public.is_business_member(business_id));

-- role_app_surface_access ------------------------------------------------
drop policy if exists "role_app_surface_access_members_select" on public.role_app_surface_access;
drop policy if exists "role_app_surface_access_members_insert" on public.role_app_surface_access;
drop policy if exists "role_app_surface_access_members_update" on public.role_app_surface_access;
drop policy if exists "role_app_surface_access_members_delete" on public.role_app_surface_access;

create policy "role_app_surface_access_members_select" on public.role_app_surface_access
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "role_app_surface_access_members_insert" on public.role_app_surface_access
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "role_app_surface_access_members_update" on public.role_app_surface_access
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "role_app_surface_access_members_delete" on public.role_app_surface_access
  for delete to authenticated
  using (public.is_business_member(business_id));

-- user_app_surface_overrides ---------------------------------------------
drop policy if exists "user_app_surface_overrides_members_select" on public.user_app_surface_overrides;
drop policy if exists "user_app_surface_overrides_members_insert" on public.user_app_surface_overrides;
drop policy if exists "user_app_surface_overrides_members_update" on public.user_app_surface_overrides;
drop policy if exists "user_app_surface_overrides_members_delete" on public.user_app_surface_overrides;

create policy "user_app_surface_overrides_members_select" on public.user_app_surface_overrides
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "user_app_surface_overrides_members_insert" on public.user_app_surface_overrides
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "user_app_surface_overrides_members_update" on public.user_app_surface_overrides
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "user_app_surface_overrides_members_delete" on public.user_app_surface_overrides
  for delete to authenticated
  using (public.is_business_member(business_id));

-- app_surface_domains ----------------------------------------------------
drop policy if exists "app_surface_domains_members_select" on public.app_surface_domains;
drop policy if exists "app_surface_domains_members_insert" on public.app_surface_domains;
drop policy if exists "app_surface_domains_members_update" on public.app_surface_domains;
drop policy if exists "app_surface_domains_members_delete" on public.app_surface_domains;

create policy "app_surface_domains_members_select" on public.app_surface_domains
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "app_surface_domains_members_insert" on public.app_surface_domains
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "app_surface_domains_members_update" on public.app_surface_domains
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "app_surface_domains_members_delete" on public.app_surface_domains
  for delete to authenticated
  using (public.is_business_member(business_id));

-- installed_plugins ------------------------------------------------------
drop policy if exists "installed_plugins_members_select" on public.installed_plugins;
drop policy if exists "installed_plugins_members_insert" on public.installed_plugins;
drop policy if exists "installed_plugins_members_update" on public.installed_plugins;
drop policy if exists "installed_plugins_members_delete" on public.installed_plugins;

create policy "installed_plugins_members_select" on public.installed_plugins
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "installed_plugins_members_insert" on public.installed_plugins
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "installed_plugins_members_update" on public.installed_plugins
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "installed_plugins_members_delete" on public.installed_plugins
  for delete to authenticated
  using (public.is_business_member(business_id));

-- plugin_ui_registrations ------------------------------------------------
drop policy if exists "plugin_ui_registrations_members_select" on public.plugin_ui_registrations;
drop policy if exists "plugin_ui_registrations_members_insert" on public.plugin_ui_registrations;
drop policy if exists "plugin_ui_registrations_members_update" on public.plugin_ui_registrations;
drop policy if exists "plugin_ui_registrations_members_delete" on public.plugin_ui_registrations;

create policy "plugin_ui_registrations_members_select" on public.plugin_ui_registrations
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "plugin_ui_registrations_members_insert" on public.plugin_ui_registrations
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "plugin_ui_registrations_members_update" on public.plugin_ui_registrations
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "plugin_ui_registrations_members_delete" on public.plugin_ui_registrations
  for delete to authenticated
  using (public.is_business_member(business_id));

-- record_links -----------------------------------------------------------
drop policy if exists "record_links_members_select" on public.record_links;
drop policy if exists "record_links_members_insert" on public.record_links;
drop policy if exists "record_links_members_update" on public.record_links;
drop policy if exists "record_links_members_delete" on public.record_links;

create policy "record_links_members_select" on public.record_links
  for select to authenticated
  using (public.is_business_member(business_id));
create policy "record_links_members_insert" on public.record_links
  for insert to authenticated
  with check (public.is_business_member(business_id));
create policy "record_links_members_update" on public.record_links
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
create policy "record_links_members_delete" on public.record_links
  for delete to authenticated
  using (public.is_business_member(business_id));

-- =========================================================================
-- PATTERN B — members SELECT only; writes via service_role (16 tables)
-- contacts, properties, leads, quotes, quote_page_interactions,
-- events, activities, tasks, business_settings, services, service_plans,
-- price_rules, service_areas, conversations, messages, issues
-- =========================================================================

drop policy if exists "contacts_members_select" on public.contacts;
create policy "contacts_members_select" on public.contacts
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "properties_members_select" on public.properties;
create policy "properties_members_select" on public.properties
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "leads_members_select" on public.leads;
create policy "leads_members_select" on public.leads
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "quotes_members_select" on public.quotes;
create policy "quotes_members_select" on public.quotes
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "quote_page_interactions_members_select" on public.quote_page_interactions;
create policy "quote_page_interactions_members_select" on public.quote_page_interactions
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "events_members_select" on public.events;
create policy "events_members_select" on public.events
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "activities_members_select" on public.activities;
create policy "activities_members_select" on public.activities
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "tasks_members_select" on public.tasks;
create policy "tasks_members_select" on public.tasks
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "business_settings_members_select" on public.business_settings;
create policy "business_settings_members_select" on public.business_settings
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "services_members_select" on public.services;
create policy "services_members_select" on public.services
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "service_plans_members_select" on public.service_plans;
create policy "service_plans_members_select" on public.service_plans
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "price_rules_members_select" on public.price_rules;
create policy "price_rules_members_select" on public.price_rules
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "service_areas_members_select" on public.service_areas;
create policy "service_areas_members_select" on public.service_areas
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "conversations_members_select" on public.conversations;
create policy "conversations_members_select" on public.conversations
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "messages_members_select" on public.messages;
create policy "messages_members_select" on public.messages
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "issues_members_select" on public.issues;
create policy "issues_members_select" on public.issues
  for select to authenticated
  using (public.is_business_member(business_id));

-- =========================================================================
-- SPECIAL CASES
-- =========================================================================

-- businesses -------------------------------------------------------------
drop policy if exists "businesses_members_select" on public.businesses;
drop policy if exists "businesses_members_update" on public.businesses;

create policy "businesses_members_select" on public.businesses
  for select to authenticated
  using (public.is_business_member(id));
create policy "businesses_members_update" on public.businesses
  for update to authenticated
  using (public.is_business_member(id))
  with check (public.is_business_member(id));
-- INSERT and DELETE: service_role only.

-- business_memberships ---------------------------------------------------
drop policy if exists "business_memberships_self_select" on public.business_memberships;
drop policy if exists "business_memberships_members_select" on public.business_memberships;

create policy "business_memberships_self_select" on public.business_memberships
  for select to authenticated
  using (user_id = auth.uid());
create policy "business_memberships_members_select" on public.business_memberships
  for select to authenticated
  using (public.is_business_member(business_id));
-- Writes: service_role only.

-- data_dictionary_fields -------------------------------------------------
drop policy if exists "data_dictionary_fields_select" on public.data_dictionary_fields;

create policy "data_dictionary_fields_select" on public.data_dictionary_fields
  for select to authenticated
  using (
    business_id is null
    or public.is_business_member(business_id)
  );
-- Writes: service_role only.

-- notes ------------------------------------------------------------------
-- Members may select and insert notes for their business.
-- Update and delete are restricted to the note's author.
-- Visibility modes are enforced in app code for Phase 1.
drop policy if exists "notes_members_select" on public.notes;
drop policy if exists "notes_members_insert" on public.notes;
drop policy if exists "notes_author_update" on public.notes;
drop policy if exists "notes_author_delete" on public.notes;

create policy "notes_members_select" on public.notes
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "notes_members_insert" on public.notes
  for insert to authenticated
  with check (
    public.is_business_member(business_id)
    and author_user_id = auth.uid()
  );

create policy "notes_author_update" on public.notes
  for update to authenticated
  using (
    public.is_business_member(business_id)
    and author_user_id = auth.uid()
  )
  with check (
    public.is_business_member(business_id)
    and author_user_id = auth.uid()
  );

create policy "notes_author_delete" on public.notes
  for delete to authenticated
  using (
    public.is_business_member(business_id)
    and author_user_id = auth.uid()
  );

-- user_profiles ----------------------------------------------------------
drop policy if exists "user_profiles_self_select" on public.user_profiles;
drop policy if exists "user_profiles_fellow_members_select" on public.user_profiles;
drop policy if exists "user_profiles_self_update" on public.user_profiles;

create policy "user_profiles_self_select" on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy "user_profiles_fellow_members_select" on public.user_profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.business_memberships me
      join public.business_memberships them
        on me.business_id = them.business_id
      where me.user_id = auth.uid()
        and them.user_id = public.user_profiles.id
        and me.status = 'active'
        and them.status = 'active'
    )
  );

create policy "user_profiles_self_update" on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- INSERT/DELETE: service_role only.

-- =========================================================================
-- REFERENCE TABLES — authenticated SELECT only (5 tables)
-- role_blueprints, app_surface_blueprints, plugin_definitions,
-- plugin_action_registrations, event_types
-- =========================================================================

drop policy if exists "role_blueprints_authenticated_select" on public.role_blueprints;
create policy "role_blueprints_authenticated_select" on public.role_blueprints
  for select to authenticated using (true);

drop policy if exists "app_surface_blueprints_authenticated_select" on public.app_surface_blueprints;
create policy "app_surface_blueprints_authenticated_select" on public.app_surface_blueprints
  for select to authenticated using (true);

drop policy if exists "plugin_definitions_authenticated_select" on public.plugin_definitions;
create policy "plugin_definitions_authenticated_select" on public.plugin_definitions
  for select to authenticated using (true);

drop policy if exists "plugin_action_registrations_authenticated_select" on public.plugin_action_registrations;
create policy "plugin_action_registrations_authenticated_select" on public.plugin_action_registrations
  for select to authenticated using (true);

drop policy if exists "event_types_authenticated_select" on public.event_types;
create policy "event_types_authenticated_select" on public.event_types
  for select to authenticated using (true);

-- =========================================================================
-- LOCKED — RLS enabled, NO policies (service_role only)
-- rate_limit_events
-- =========================================================================
-- Intentionally no policies. anon and authenticated are denied all access.

commit;
