-- =========================================================================
-- Phase 5B-1 seed — register the Door Hanger Plugin for Crystal Bear.
-- Idempotent: safe to re-run. ON CONFLICT keys derive from the unique
-- constraints declared in 20260511120000_phase_1_schema.sql.
--
-- Run via: supabase/seed/run_seed.sh
--
-- Phase 5B-1 seed scope:
--   - one plugin_definitions row (door_hanger v0.1.0, internal)
--   - one installed_plugins row per Crystal Bear (status='enabled')
--
-- Deliberately NOT seeded:
--   - door_hanger_designs (inventory)
--   - door_hanger_campaigns
--   - door_hanger_routes
--   - door_hanger_route_stops
--   - door_hanger_distribution_sessions
--
-- The operator creates these manually once Phase 5B-2 ships the
-- /admin/marketing/door-hangers UI.
-- =========================================================================

begin;

do $phase5$
declare
  v_business_id          uuid;
  v_door_hanger_def_id   uuid;
begin
  select id into v_business_id
    from public.businesses
   where slug = 'crystal-bear'
   limit 1;
  if v_business_id is null then
    raise exception
      'Phase 5 seed: Crystal Bear business (slug=crystal-bear) was not found. '
      'Run phase_1_seed.sql first.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. Plugin definition
  -- -------------------------------------------------------------------
  insert into public.plugin_definitions
    (plugin_key, name, description, current_version, manifest, is_internal)
  values
    ('door_hanger',
     'Door Hanger',
     'Real marketing-channel plugin: door hanger campaigns, inventory, routes, and distribution sessions. Phase 5B-1 ships only the data model and plugin registration.',
     '0.1.0',
     jsonb_build_object(
       'plugin_key', 'door_hanger',
       'name',       'Door Hanger',
       'version',    '0.1.0',
       'permissions', jsonb_build_array(
         'core.property_data.use',
         'door_hanger.campaigns.read',
         'door_hanger.campaigns.create',
         'door_hanger.inventory.read',
         'door_hanger.inventory.create',
         'door_hanger.routes.read',
         'door_hanger.routes.create',
         'door_hanger.route_stops.read',
         'door_hanger.distribution_sessions.read',
         'door_hanger.distribution_sessions.create',
         'ui.admin_marketing.render'
       ),
       'actions',          jsonb_build_array(),
       'events',           jsonb_build_array(),
       'ui_registrations', jsonb_build_array()
     ),
     true)
  on conflict (plugin_key) do update
    set name            = excluded.name,
        description     = excluded.description,
        current_version = excluded.current_version,
        manifest        = excluded.manifest,
        is_internal     = excluded.is_internal,
        updated_at      = now()
  returning id into v_door_hanger_def_id;

  -- -------------------------------------------------------------------
  -- 2. Installed plugin row for Crystal Bear
  -- -------------------------------------------------------------------
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

  raise notice 'Phase 5 seed: Door Hanger plugin (v0.1.0) installed for Crystal Bear.';
  raise notice 'No campaigns / inventory / routes / sessions are seeded — the operator creates these manually.';
end
$phase5$;

commit;
