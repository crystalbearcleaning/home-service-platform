-- =========================================================================
-- Phase 8B follow-up — add the cooldown_days CHECK constraint.
--
-- The original Phase 8B migration wrapped the constraint creation in a
-- guarded `do $$ ... end $$` block. The column was added cleanly but
-- the constraint did not land (verified by `select … from pg_constraint
-- where conrelid='public.door_hanger_routes'::regclass`). This migration
-- adds the CHECK directly, guarded by a fresh existence check so
-- re-applying is safe.
-- =========================================================================

begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.door_hanger_routes'::regclass
      and conname = 'door_hanger_routes_cooldown_days_nonneg'
  ) then
    alter table public.door_hanger_routes
      add constraint door_hanger_routes_cooldown_days_nonneg
      check (cooldown_days >= 0);
  end if;
end $$;

commit;
