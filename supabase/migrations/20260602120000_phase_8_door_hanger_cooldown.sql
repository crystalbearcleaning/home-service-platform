-- =========================================================================
-- Home Service Operating Platform — Phase 8B Door Hanger cooldown column
-- Source of truth:
--   docs/PHASE_8_DOOR_HANGER_ROUTE_MAP_AND_COOLDOWN.md §11
--
-- Scope (Phase 8B):
--   - one new column on door_hanger_routes:
--       cooldown_days integer NOT NULL DEFAULT 60, CHECK >= 0
--   - existing rows back-fill to 60 via the column default
--
-- Phase 8B does NOT:
--   - build any map UI (Phase 8C)
--   - build overlays (Phase 8D)
--   - reuse the Phase 5C RentCast generator (Phase 8E, optional)
--   - filter cooldown candidates inside route generation (still
--     deferred — Phase 8 only displays cooldown)
--   - touch any other table, RLS policy, function, or grant
--
-- Idempotency: `add column if not exists` so re-running in dev is
-- safe; the CHECK is added inside a guarded DO block.
-- =========================================================================

begin;

alter table public.door_hanger_routes
  add column if not exists cooldown_days integer not null default 60;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'door_hanger_routes_cooldown_days_nonneg'
  ) then
    alter table public.door_hanger_routes
      add constraint door_hanger_routes_cooldown_days_nonneg
      check (cooldown_days >= 0);
  end if;
end $$;

comment on column public.door_hanger_routes.cooldown_days is
  'Phase 8: route-level retargeting cooldown window in days. Default 60. '
  'Used with door_hanger_route_stops.completed_at to compute per-stop '
  'next_eligible_at and per-route cooldown status. Display only in '
  'Phase 8 — RentCast generation does not filter on cooldown yet.';

commit;
