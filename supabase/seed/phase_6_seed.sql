-- =========================================================================
-- Phase 6B-1 seed — Crystal Bear Simulation workspace
-- Source of truth: docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md
--
-- Run via: supabase/seed/run_seed.sh
-- The runner replaces __SEED_ADMIN_EMAIL__ with $SEED_ADMIN_EMAIL from
-- .env.local before piping the file to `supabase db query --linked`.
-- Do NOT run this file directly with the placeholder unsubstituted.
--
-- Phase 6B-1 seed scope:
--   - one `businesses` row: Crystal Bear Simulation (is_simulation=true)
--   - one `business_roles` row: Owner / Admin (mirrors the real workspace)
--   - one `installed_plugins` row: Door Hanger plugin, status='enabled'
--   - admin membership + Owner/Admin role for SEED_ADMIN_EMAIL
--
-- Deliberately NOT seeded:
--   - service_areas, services, service_plans, price_rules, business_settings
--     (the simulation workspace will receive its own settings later if a
--     plugin needs them; Phase 6 does not require any of these to exist)
--   - app_surfaces (no admin/customer surfaces seeded — the admin shell
--     resolves by membership, not by surface, and there is no public quote
--     page for the simulation workspace)
--   - contacts / properties / leads / quotes / tasks / events / activities
--   - door_hanger_designs / campaigns / routes / route_stops /
--     distribution_sessions
--   - simulation_runs (Phase 6C — table does not exist yet)
--   - Window Cleaning Auto-Quote and Customer Quote / Sales Page plugins
--     (the simulation workspace only installs the Door Hanger plugin in
--     Phase 6B; other plugins land if/when the simulator needs them)
--
-- Idempotency: every insert uses ON CONFLICT; safe to re-run.
-- =========================================================================

begin;

do $phase6$
declare
  v_business_id           uuid;
  v_role_blueprint_id     uuid;
  v_business_role_id      uuid;
  v_door_hanger_def_id    uuid;
  v_seed_admin_email      text := '__SEED_ADMIN_EMAIL__';
  v_auth_user_id          uuid;
  v_membership_id         uuid;
begin
  -- ---------------------------------------------------------------------
  -- 0. Sanity check — Phase 6B-1 migration must have been applied.
  -- ---------------------------------------------------------------------
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'businesses'
       and column_name  = 'is_simulation'
  ) then
    raise exception
      'Phase 6 seed: businesses.is_simulation column is missing. '
      'Apply migration 20260526120000_phase_6_simulation_workspace.sql first.';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Simulation business
  -- ---------------------------------------------------------------------
  insert into public.businesses
    (slug, name, primary_industry, timezone, currency, status, is_simulation)
  values
    ('crystal-bear-simulation', 'Crystal Bear Simulation', 'window_cleaning',
     'America/New_York', 'USD', 'active', true)
  on conflict (slug) do update
    set name             = excluded.name,
        primary_industry = excluded.primary_industry,
        timezone         = excluded.timezone,
        currency         = excluded.currency,
        status           = excluded.status,
        is_simulation    = true,
        updated_at       = now()
  returning id into v_business_id;

  -- ---------------------------------------------------------------------
  -- 2. Owner / Admin role for the simulation workspace
  --    Reuses the `owner_admin` role blueprint seeded in Phase 1.
  -- ---------------------------------------------------------------------
  select id into v_role_blueprint_id
    from public.role_blueprints
   where key = 'owner_admin'
   limit 1;

  if v_role_blueprint_id is null then
    raise exception
      'Phase 6 seed: role_blueprints "owner_admin" was not found. '
      'Run phase_1_seed.sql first.';
  end if;

  insert into public.business_roles
    (business_id, role_blueprint_id, key, name, description, is_system, status)
  values
    (v_business_id, v_role_blueprint_id, 'owner_admin', 'Owner / Admin',
     'Crystal Bear Simulation owner/admin role.', true, 'active')
  on conflict (business_id, key) do update
    set name              = excluded.name,
        description       = excluded.description,
        role_blueprint_id = excluded.role_blueprint_id,
        is_system         = excluded.is_system,
        status            = excluded.status,
        updated_at        = now()
  returning id into v_business_role_id;

  -- ---------------------------------------------------------------------
  -- 3. Door Hanger plugin install for the simulation workspace
  --    Plugin definition was seeded in Phase 5 (phase_5_seed.sql).
  -- ---------------------------------------------------------------------
  select id into v_door_hanger_def_id
    from public.plugin_definitions
   where plugin_key = 'door_hanger'
   limit 1;

  if v_door_hanger_def_id is null then
    raise exception
      'Phase 6 seed: plugin_definitions "door_hanger" was not found. '
      'Run phase_5_seed.sql first.';
  end if;

  insert into public.installed_plugins
    (business_id, plugin_definition_id, plugin_key, installed_version,
     status, settings)
  values
    (v_business_id, v_door_hanger_def_id, 'door_hanger',
     '0.1.0', 'enabled', jsonb_build_object())
  on conflict (business_id, plugin_key) do update
    set plugin_definition_id = excluded.plugin_definition_id,
        installed_version    = excluded.installed_version,
        status               = excluded.status,
        settings             = coalesce(installed_plugins.settings, excluded.settings),
        updated_at           = now();

  -- ---------------------------------------------------------------------
  -- 4. Admin user linking (same pattern as Phase 1 §14).
  --    If SEED_ADMIN_EMAIL matches a Supabase auth user, link them as
  --    Owner / Admin on the simulation workspace too. Without this, the
  --    user can't see the simulation workspace through RLS.
  -- ---------------------------------------------------------------------
  if v_seed_admin_email is null or length(trim(v_seed_admin_email)) = 0 then
    raise notice 'SEED_ADMIN_EMAIL is empty. Skipping simulation-workspace admin link.';
  else
    select id into v_auth_user_id
      from auth.users
     where lower(email) = lower(v_seed_admin_email)
     limit 1;

    if v_auth_user_id is null then
      raise notice '------------------------------------------------------------';
      raise notice 'SEED_ADMIN_EMAIL "%" was not found in auth.users.', v_seed_admin_email;
      raise notice 'Sign up with this email first, then rerun the seed to link';
      raise notice 'the admin to Crystal Bear Simulation.';
      raise notice '------------------------------------------------------------';
    else
      insert into public.user_profiles (id, email, display_name)
      values (v_auth_user_id, v_seed_admin_email, null)
      on conflict (id) do update
        set email      = excluded.email,
            updated_at = now();

      insert into public.business_memberships
        (business_id, user_id, status, default_role_id, joined_at)
      values
        (v_business_id, v_auth_user_id, 'active', v_business_role_id, now())
      on conflict (business_id, user_id) do update
        set status          = 'active',
            default_role_id = excluded.default_role_id,
            joined_at       = coalesce(business_memberships.joined_at, excluded.joined_at),
            updated_at      = now()
      returning id into v_membership_id;

      insert into public.membership_roles (business_id, membership_id, role_id)
      values (v_business_id, v_membership_id, v_business_role_id)
      on conflict (membership_id, role_id) do nothing;

      raise notice 'Linked admin "%" to Crystal Bear Simulation as Owner / Admin.', v_seed_admin_email;
    end if;
  end if;

  raise notice 'Phase 6 seed: Crystal Bear Simulation workspace ready (is_simulation=true, door_hanger plugin enabled).';
  raise notice 'No CRM records, no door-hanger demo data, and no save files were seeded.';
end
$phase6$;

commit;
