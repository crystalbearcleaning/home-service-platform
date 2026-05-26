-- =========================================================================
-- Home Service Operating Platform — Phase 7B Simulation Play foundation
-- Source of truth:
--   docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md
--   (especially §§5, 7, 9, 10, 11, 12)
--
-- Scope (Phase 7B):
--   - additive nullable columns on door_hanger_distribution_sessions
--     (simulation_run_id, seconds_per_hanger, status, started_at, ended_at)
--   - additive nullable column on door_hanger_routes (last_completed_at)
--   - additive nullable column on door_hanger_route_stops (completed_at)
--   - new simulation_activity table (Phase 7 game feed) with RLS Pattern B
--
-- Phase 7B does NOT:
--   - build /admin/simulation/play (Phase 7C)
--   - wire Hang 1 / Hang custom / Hang route gameplay actions (Phase 7D)
--   - generate CRM outcomes from simulation (still forbidden — Phase 7+
--     deliberately stops short of CRM lead generation)
--   - change message-automation / SMS behavior
--   - modify the simulation_runs table (no new columns there)
--
-- The new session columns are NULL-allowed precisely so the existing
-- Phase 5B-2 manual real-mode log path keeps working with zero code
-- changes. Real-mode sessions carry simulation_run_id IS NULL and
-- seconds_per_hanger IS NULL; the application code enforces that
-- simulated sessions carry both values (no DB CHECK because it would
-- require a multi-column conditional).
--
-- Idempotency: every ALTER uses `add column if not exists`; every
-- CREATE POLICY is preceded by DROP POLICY IF EXISTS. All work runs
-- inside one transaction.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. door_hanger_distribution_sessions — additive columns
-- -------------------------------------------------------------------------
-- `status` defaults to 'completed' so existing Phase 5B real-mode rows
-- (which were always logged after the fact) backfill to the correct
-- terminal state. New Phase 7 simulated sessions explicitly write
-- status='active' at start and flip to 'completed' / 'paused' on finish.
-- -------------------------------------------------------------------------
alter table public.door_hanger_distribution_sessions
  add column if not exists simulation_run_id uuid
    references public.simulation_runs(id) on delete set null;

alter table public.door_hanger_distribution_sessions
  add column if not exists seconds_per_hanger integer;

alter table public.door_hanger_distribution_sessions
  add column if not exists status text not null default 'completed';

alter table public.door_hanger_distribution_sessions
  add column if not exists started_at timestamptz;

alter table public.door_hanger_distribution_sessions
  add column if not exists ended_at timestamptz;

-- CHECK constraints — wrap each in a guarded DO block so the migration
-- is safely re-runnable in dev environments where it was already applied.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'door_hanger_distribution_sessions_seconds_per_hanger_positive'
  ) then
    alter table public.door_hanger_distribution_sessions
      add constraint door_hanger_distribution_sessions_seconds_per_hanger_positive
      check (seconds_per_hanger is null or seconds_per_hanger >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'door_hanger_distribution_sessions_status_check'
  ) then
    alter table public.door_hanger_distribution_sessions
      add constraint door_hanger_distribution_sessions_status_check
      check (status in ('active','completed','paused'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'door_hanger_distribution_sessions_ended_after_started'
  ) then
    alter table public.door_hanger_distribution_sessions
      add constraint door_hanger_distribution_sessions_ended_after_started
      check (
        started_at is null
        or ended_at is null
        or ended_at >= started_at
      );
  end if;
end $$;

create index if not exists idx_door_hanger_sessions_simulation_run
  on public.door_hanger_distribution_sessions(simulation_run_id);
create index if not exists idx_door_hanger_sessions_business_status
  on public.door_hanger_distribution_sessions(business_id, status);

-- -------------------------------------------------------------------------
-- 2. door_hanger_routes — last_completed_at
-- -------------------------------------------------------------------------
alter table public.door_hanger_routes
  add column if not exists last_completed_at timestamptz;

-- -------------------------------------------------------------------------
-- 3. door_hanger_route_stops — completed_at
-- -------------------------------------------------------------------------
alter table public.door_hanger_route_stops
  add column if not exists completed_at timestamptz;

-- -------------------------------------------------------------------------
-- 4. simulation_activity — new table
-- -------------------------------------------------------------------------
-- One row per gameplay event inside a simulation save. Deliberately
-- separate from core `events` / `activities` so simulation traffic does
-- not pollute real CRM observability and existing queries do not need a
-- simulation filter.
--
-- `simulated_at` is the value of simulation_runs.simulated_current_at
-- AFTER the action committed. `created_at` is the wall-clock insert.
-- -------------------------------------------------------------------------
create table if not exists public.simulation_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  simulation_run_id uuid not null references public.simulation_runs(id) on delete cascade,
  plugin_key text,
  action_type text not null,
  summary text not null,
  simulated_at timestamptz not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint simulation_activity_summary_nonempty
    check (length(btrim(summary)) > 0),
  constraint simulation_activity_action_type_nonempty
    check (length(btrim(action_type)) > 0)
);

create index if not exists idx_simulation_activity_business
  on public.simulation_activity(business_id);
create index if not exists idx_simulation_activity_run_created
  on public.simulation_activity(simulation_run_id, created_at desc);
create index if not exists idx_simulation_activity_business_created
  on public.simulation_activity(business_id, created_at desc);
create index if not exists idx_simulation_activity_action_type
  on public.simulation_activity(action_type);

-- -------------------------------------------------------------------------
-- RLS — Pattern B (members SELECT; writes via service-role server actions)
-- -------------------------------------------------------------------------
alter table public.simulation_activity enable row level security;

drop policy if exists "simulation_activity_members_select" on public.simulation_activity;
create policy "simulation_activity_members_select" on public.simulation_activity
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
