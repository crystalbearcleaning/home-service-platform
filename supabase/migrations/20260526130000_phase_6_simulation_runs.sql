-- =========================================================================
-- Home Service Operating Platform — Phase 6C simulation_runs schema
-- Source of truth: docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md §4–5
--
-- Scope (Phase 6C):
--   - one new table: simulation_runs (save files for a simulation workspace)
--   - indexes, CHECK constraints, RLS enable + members-SELECT policy
--
-- Phase 6C does NOT:
--   - build the workspace switcher / Simulation Mode banner (Phase 6D)
--   - add side-effect guardrails to adapters (Phase 6D)
--   - build any gameplay (Phase 7+)
--   - generate CRM leads / quotes / tasks from simulation activity
--
-- Single-active-save rule (§5) is enforced in application code, not at
-- the DB level — a partial UNIQUE index would force-deactivate via raw
-- SQL ordering and complicate the create flow more than it helps in
-- Phase 6C. The DB still enforces "exactly one row per (business, name)"
-- by user choice; multi-row "active" cleanup is the server action's
-- responsibility (see createSimulationRunAction / markSimulationRunActiveAction).
--
-- "Business must be a simulation workspace" is also enforced in the
-- server actions, not at the DB level. A CHECK against another table is
-- not allowed in Postgres; a trigger would push the rule too far from
-- the action that violates it. Phase 6C accepts that posture.
--
-- Idempotency: `create table` without IF NOT EXISTS to match Phase 1's
-- forward-only style; CREATE POLICY is preceded by DROP POLICY IF EXISTS
-- so re-runs in dev are safe.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- simulation_runs
-- -------------------------------------------------------------------------
-- Each row is one playable timeline ("save file") inside a simulation
-- workspace. starting_cash_cents + simulated_start_at are immutable
-- after creation by convention (Phase 6C has no edit flow); the
-- *current* values advance only via gameplay (Phase 7+). For now,
-- current_* fields are seeded equal to their starting_* counterparts.
--
-- Money columns are bigint cents to match the Door Hanger convention.
-- All times are timestamptz so the simulated clock is timezone-clean
-- when surfaced in the admin UI.
-- -------------------------------------------------------------------------
create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  starting_cash_cents bigint not null,
  current_cash_cents bigint not null,
  simulated_start_at timestamptz not null,
  simulated_current_at timestamptz not null,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint simulation_runs_name_nonempty
    check (length(btrim(name)) > 0),
  constraint simulation_runs_starting_cash_nonneg
    check (starting_cash_cents >= 0),
  constraint simulation_runs_current_cash_nonneg
    check (current_cash_cents >= 0),
  constraint simulation_runs_status_check
    check (status in ('draft','active','paused','archived')),
  constraint simulation_runs_simulated_current_ge_start
    check (simulated_current_at >= simulated_start_at)
);
create trigger simulation_runs_set_updated_at
  before update on public.simulation_runs
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------------
create index idx_simulation_runs_business
  on public.simulation_runs(business_id);
create index idx_simulation_runs_business_status
  on public.simulation_runs(business_id, status);
create index idx_simulation_runs_business_created
  on public.simulation_runs(business_id, created_at desc);

-- -------------------------------------------------------------------------
-- RLS — Pattern B
-- -------------------------------------------------------------------------
-- authenticated business members may SELECT;
-- INSERT / UPDATE / DELETE go through controlled admin server actions
-- using the service-role client.
-- -------------------------------------------------------------------------
alter table public.simulation_runs enable row level security;

drop policy if exists "simulation_runs_members_select" on public.simulation_runs;
create policy "simulation_runs_members_select" on public.simulation_runs
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
