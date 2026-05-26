-- =========================================================================
-- Home Service Operating Platform — Phase 6B-1 Simulation Workspace
-- Source of truth: docs/PHASE_6_SIMULATION_WORKSPACE_AND_SAVE_FILES.md
--
-- Scope (Phase 6B): add a single `is_simulation` boolean to
-- `public.businesses`. Pairs with `supabase/seed/phase_6_seed.sql`
-- (Crystal Bear Simulation workspace + Door Hanger plugin install).
--
-- The §3 sentinel decision in the Phase 6 doc lands on Option B: one
-- boolean on `businesses` (recommended). We deliberately do NOT add
-- `is_simulation` to any other table — the workspace boundary is the
-- safety boundary, enforced by existing `business_id` scoping + RLS.
--
-- Phase 6B-1 does NOT:
--   - create the `simulation_runs` table (Phase 6C)
--   - add a workspace switcher or Simulation Mode banner (Phase 6D)
--   - add side-effect guardrails to adapters (Phase 6D)
--   - build any gameplay (Phase 7+)
--
-- Idempotency: `add column if not exists` so this migration can be
-- re-run safely. All work runs inside a single transaction.
-- =========================================================================

begin;

alter table public.businesses
  add column if not exists is_simulation boolean not null default false;

-- Optional comment for future operators / inspectors.
comment on column public.businesses.is_simulation is
  'Phase 6: true for simulation workspaces (Crystal Bear Simulation, etc.). '
  'Real customer-facing workspaces stay false. Read by adapters (SMS / '
  'email / payments / future integrations) to short-circuit real external '
  'side effects when the active business is a simulation workspace.';

commit;
