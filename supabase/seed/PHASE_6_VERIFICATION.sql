-- =========================================================================
-- Phase 6B-1 verification queries.
-- Run these after applying:
--   - supabase/migrations/20260526120000_phase_6_simulation_workspace.sql
--   - supabase/seed/phase_6_seed.sql (via supabase/seed/run_seed.sh)
--
-- Each block prints a single-row result the operator can eyeball. None of
-- these queries mutate data.
-- =========================================================================

-- 1. businesses.is_simulation column exists with the expected type/default.
select column_name,
       data_type,
       is_nullable,
       column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'businesses'
   and column_name  = 'is_simulation';

-- 2. Real Crystal Bear workspace is_simulation = false.
select slug, name, is_simulation
  from public.businesses
 where slug = 'crystal-bear';

-- 3. Simulation workspace exists and is_simulation = true.
select slug, name, is_simulation, status
  from public.businesses
 where slug = 'crystal-bear-simulation';

-- 4. Door Hanger plugin is installed + enabled on the simulation workspace.
select b.slug              as business_slug,
       ip.plugin_key,
       ip.installed_version,
       ip.status
  from public.installed_plugins ip
  join public.businesses b on b.id = ip.business_id
 where b.slug = 'crystal-bear-simulation'
   and ip.plugin_key = 'door_hanger';

-- 5. The simulation workspace has zero door-hanger records of any kind.
--    Every count should be 0.
with sim_business as (
  select id from public.businesses where slug = 'crystal-bear-simulation'
)
select 'door_hanger_designs'              as table_name,
       count(*)                            as row_count
  from public.door_hanger_designs
 where business_id = (select id from sim_business)
union all
select 'door_hanger_campaigns',
       count(*)
  from public.door_hanger_campaigns
 where business_id = (select id from sim_business)
union all
select 'door_hanger_routes',
       count(*)
  from public.door_hanger_routes
 where business_id = (select id from sim_business)
union all
select 'door_hanger_route_stops',
       count(*)
  from public.door_hanger_route_stops
 where business_id = (select id from sim_business)
union all
select 'door_hanger_distribution_sessions',
       count(*)
  from public.door_hanger_distribution_sessions
 where business_id = (select id from sim_business);

-- 6. The simulation workspace has zero core CRM records (sanity check that
--    no real data leaked across the workspace boundary). Every count = 0.
with sim_business as (
  select id from public.businesses where slug = 'crystal-bear-simulation'
)
select 'contacts'   as table_name, count(*) as row_count
  from public.contacts   where business_id = (select id from sim_business)
union all
select 'properties', count(*) from public.properties where business_id = (select id from sim_business)
union all
select 'leads',      count(*) from public.leads      where business_id = (select id from sim_business)
union all
select 'quotes',     count(*) from public.quotes     where business_id = (select id from sim_business)
union all
select 'tasks',      count(*) from public.tasks      where business_id = (select id from sim_business)
union all
select 'events',     count(*) from public.events     where business_id = (select id from sim_business)
union all
select 'activities', count(*) from public.activities where business_id = (select id from sim_business);

-- 7. Confirm the admin user is linked as Owner / Admin on the simulation
--    workspace (replace the email literal below before running locally if
--    you want a quick eyeball check; otherwise skip).
-- select up.email, br.key as role_key, bm.status as membership_status
--   from public.business_memberships bm
--   join public.user_profiles  up on up.id = bm.user_id
--   join public.businesses     b  on b.id  = bm.business_id
--   left join public.membership_roles mr on mr.membership_id = bm.id
--   left join public.business_roles   br on br.id = mr.role_id
--  where b.slug = 'crystal-bear-simulation';
