-- =========================================================================
-- Phase 7D-2 follow-up — lock down door_hanger_simulation_hang EXECUTE.
--
-- The previous migration ran `revoke all on function ... from public` and
-- `grant execute on function ... to service_role`, but Supabase's default
-- privileges on `public.*` functions auto-grant EXECUTE to `anon` and
-- `authenticated`. Those default grants are applied even after our
-- migration's REVOKE FROM PUBLIC because they target named roles, not
-- PUBLIC.
--
-- This migration explicitly revokes EXECUTE from anon + authenticated so
-- the function is reachable only via service-role (matching the Pattern
-- B posture used for every other write path). The `postgres` role keeps
-- access as the function owner; that's expected.
-- =========================================================================

begin;

revoke execute on function public.door_hanger_simulation_hang(uuid, uuid, uuid, text, integer)
  from anon, authenticated;

commit;
