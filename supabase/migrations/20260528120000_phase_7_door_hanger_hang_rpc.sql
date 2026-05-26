-- =========================================================================
-- Home Service Operating Platform — Phase 7D-2 Door Hanger Hang RPC
-- Source of truth:
--   docs/PHASE_7_SIMULATION_PLAY_AND_DOOR_HANGER_ADAPTER.md §§5–11
--
-- Scope (Phase 7D-2):
--   - one Postgres function `door_hanger_simulation_hang` that performs
--     ALL writes for Hang 1 / Hang custom / Hang route atomically:
--       1. SELECT FOR UPDATE on session + design + route + run
--       2. compute effective hang count (min of requested, inventory, target)
--       3. UPDATE door_hanger_designs.quantity_used
--       4. UPDATE door_hanger_distribution_sessions counters
--       5. UPDATE next N door_hanger_route_stops to status='completed'
--          (only when route_stops exist)
--       6. UPDATE simulation_runs.simulated_current_at
--       7. INSERT primary simulation_activity row
--       8. If route is complete: UPDATE route status + last_completed_at,
--          UPDATE session status='completed' + ended_at, INSERT
--          route_completed + session_completed activity rows.
--
-- Atomicity:
--   The function runs inside a single transaction (PL/pgSQL functions
--   are atomic). SELECT FOR UPDATE serialises concurrent Hang calls on
--   the same session. Validation `raise exception` rolls back any
--   uncommitted work — partial writes are impossible.
--
-- Phase 7D-2 does NOT:
--   - generate CRM outcomes (no contacts / leads / quotes / tasks /
--     notifications / events / activities-core rows)
--   - call the GHL SMS adapter (Phase 6D guardrail is not reached)
--   - build maps / GPS / pin / drawing UI
--   - build route cooldown filtering
--   - build the Finish-route operator action (auto-finish only when a
--     Hang action exhausts the route)
--
-- Security:
--   `security definer` because the function writes to tables that have
--   RLS enabled (Pattern B — members SELECT only). Write paths in the
--   project are gated to service-role; this function preserves that
--   pattern by only granting EXECUTE to service_role.
--
-- Idempotency: `create or replace function` so the migration is safe
-- to re-apply in dev.
-- =========================================================================

begin;

create or replace function public.door_hanger_simulation_hang(
  p_business_id uuid,
  p_simulation_run_id uuid,
  p_session_id uuid,
  p_action_kind text,
  p_requested_count integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_design record;
  v_route record;
  v_run record;
  v_pending_stops integer;
  v_remaining_after integer;
  v_remaining_inventory integer;
  v_remaining_target integer;
  v_route_has_stops boolean;
  v_effective integer;
  v_capped_by text;
  v_time_advanced integer;
  v_new_simulated_at timestamptz;
  v_new_material_cost bigint;
  v_route_complete boolean;
  v_action_type text;
  v_summary text;
  v_activity_id uuid;
  v_route_completed_activity_id uuid;
  v_session_completed_activity_id uuid;
begin
  if p_business_id is null or p_simulation_run_id is null or p_session_id is null then
    raise exception 'INVALID_INPUT';
  end if;
  if p_action_kind not in ('hang_one','hang_custom','hang_route') then
    raise exception 'INVALID_ACTION_KIND';
  end if;
  if p_action_kind = 'hang_custom' and (p_requested_count is null or p_requested_count < 1) then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- 1. Lock the session — this is the serialisation point for concurrent
  --    Hang calls on the same session. If two requests arrive at once,
  --    one waits here while the other completes.
  select id, business_id, simulation_run_id, route_id, design_id,
         hangers_distributed, time_spent_seconds, material_cost_cents,
         seconds_per_hanger, status, mode
    into v_session
    from public.door_hanger_distribution_sessions
   where id = p_session_id
     and business_id = p_business_id
     and simulation_run_id = p_simulation_run_id
     and mode = 'simulated'
     and status = 'active'
     for update;
  if not found then
    raise exception 'NO_ACTIVE_SESSION';
  end if;

  if v_session.seconds_per_hanger is null or v_session.seconds_per_hanger < 1 then
    raise exception 'SESSION_MISSING_SECONDS_PER_HANGER';
  end if;
  if v_session.design_id is null then
    raise exception 'SESSION_MISSING_DESIGN';
  end if;
  if v_session.route_id is null then
    raise exception 'SESSION_MISSING_ROUTE';
  end if;

  -- 2. Lock the design (inventory).
  select id, business_id, quantity_received, quantity_used, cost_per_hanger_cents
    into v_design
    from public.door_hanger_designs
   where id = v_session.design_id
     and business_id = p_business_id
     for update;
  if not found then
    raise exception 'DESIGN_NOT_FOUND';
  end if;
  v_remaining_inventory := greatest(0, v_design.quantity_received - v_design.quantity_used);

  -- 3. Lock the route + look up its target / stops totals.
  select id, business_id, name, status, total_route_stops, target_home_count
    into v_route
    from public.door_hanger_routes
   where id = v_session.route_id
     and business_id = p_business_id
     for update;
  if not found then
    raise exception 'ROUTE_NOT_FOUND';
  end if;

  -- 4. Lock the simulation run (we mutate simulated_current_at later).
  select id, business_id, simulated_current_at
    into v_run
    from public.simulation_runs
   where id = p_simulation_run_id
     and business_id = p_business_id
     for update;
  if not found then
    raise exception 'NO_ACTIVE_SAVE';
  end if;

  -- 5. Count pending route stops up-front. Used both for cap and for
  --    completion check after writes.
  select count(*) into v_pending_stops
    from public.door_hanger_route_stops
   where route_id = v_route.id
     and business_id = p_business_id
     and status = 'pending';

  v_route_has_stops := (v_route.total_route_stops > 0) or (v_pending_stops > 0);

  -- 6. Compute remaining target.
  if v_route_has_stops then
    v_remaining_target := v_pending_stops;
  elsif v_route.target_home_count is not null then
    v_remaining_target := greatest(0, v_route.target_home_count - v_session.hangers_distributed);
  else
    -- Count-only fallback with no documented target — let inventory
    -- be the only cap. Hang Route in this branch always completes.
    v_remaining_target := v_remaining_inventory;
  end if;

  -- 7. Compute effective N.
  if p_action_kind = 'hang_route' then
    v_effective := least(v_remaining_inventory, v_remaining_target);
    if v_remaining_inventory < v_remaining_target then
      v_capped_by := 'INVENTORY';
    else
      v_capped_by := null;
    end if;
  else
    v_effective := least(p_requested_count, v_remaining_inventory, v_remaining_target);
    if v_effective < p_requested_count then
      if v_remaining_target <= v_remaining_inventory then
        v_capped_by := 'STOPS';
      else
        v_capped_by := 'INVENTORY';
      end if;
    else
      v_capped_by := null;
    end if;
  end if;

  if v_effective <= 0 then
    if v_remaining_inventory <= 0 then
      raise exception 'INSUFFICIENT_INVENTORY';
    end if;
    if v_remaining_target <= 0 then
      raise exception 'ROUTE_ALREADY_COMPLETE';
    end if;
    raise exception 'INVALID_AMOUNT';
  end if;

  v_time_advanced := v_effective * v_session.seconds_per_hanger;
  v_new_simulated_at := v_run.simulated_current_at + make_interval(secs => v_time_advanced);

  if v_design.cost_per_hanger_cents is not null then
    v_new_material_cost :=
      coalesce(v_session.material_cost_cents, 0)
      + (v_effective::bigint * v_design.cost_per_hanger_cents);
  else
    v_new_material_cost := v_session.material_cost_cents;
  end if;

  -- 8. Decrement inventory. The Phase 5B CHECK
  --    `quantity_used <= quantity_received` is the DB-side safety net.
  update public.door_hanger_designs
     set quantity_used = quantity_used + v_effective
   where id = v_design.id;

  -- 9. Update session counters + simulated `distributed_at` cursor.
  update public.door_hanger_distribution_sessions
     set hangers_distributed = hangers_distributed + v_effective,
         time_spent_seconds = coalesce(time_spent_seconds, 0) + v_time_advanced,
         material_cost_cents = v_new_material_cost,
         distributed_at = v_new_simulated_at
   where id = v_session.id;

  -- 10. Complete N pending route stops when stops exist. Ordered by
  --     `stop_order asc nulls last, created_at asc` — same ordering
  --     the future real-execution UI is expected to use.
  if v_route_has_stops and v_pending_stops > 0 then
    with next_stops as (
      select id
        from public.door_hanger_route_stops
       where route_id = v_route.id
         and business_id = p_business_id
         and status = 'pending'
       order by stop_order asc nulls last, created_at asc
       limit v_effective
         for update
    )
    update public.door_hanger_route_stops s
       set status = 'completed',
           completed_at = v_new_simulated_at
      from next_stops n
     where s.id = n.id;
  end if;

  -- 11. Advance the simulated clock.
  update public.simulation_runs
     set simulated_current_at = v_new_simulated_at
   where id = v_run.id;

  -- 12. Determine route completion.
  if v_route_has_stops then
    select count(*) into v_remaining_after
      from public.door_hanger_route_stops
     where route_id = v_route.id
       and business_id = p_business_id
       and status = 'pending';
    v_route_complete := v_remaining_after = 0;
  elsif v_route.target_home_count is not null then
    v_route_complete :=
      (v_session.hangers_distributed + v_effective) >= v_route.target_home_count;
  elsif p_action_kind = 'hang_route' then
    -- Count fallback with no target — Hang Route always completes.
    v_route_complete := true;
  else
    v_route_complete := false;
  end if;

  -- 13. Write the primary activity row.
  if p_action_kind = 'hang_one' then
    v_action_type := 'door_hanger.hang_one';
    v_summary := 'Hung 1 door hanger';
  elsif p_action_kind = 'hang_custom' then
    v_action_type := 'door_hanger.hang_custom';
    v_summary := 'Hung ' || v_effective || ' door hanger'
                 || case when v_effective = 1 then '' else 's' end;
  else
    v_action_type := 'door_hanger.hang_route';
    v_summary := 'Hung ' || v_effective || ' door hanger'
                 || case when v_effective = 1 then '' else 's' end
                 || ' (route completion)';
  end if;

  insert into public.simulation_activity (
    business_id, simulation_run_id, plugin_key, action_type,
    summary, simulated_at, metadata
  ) values (
    p_business_id, p_simulation_run_id, 'door_hanger', v_action_type,
    v_summary, v_new_simulated_at,
    jsonb_build_object(
      'session_id', v_session.id,
      'route_id', v_route.id,
      'design_id', v_design.id,
      'requested_count', p_requested_count,
      'effective_count', v_effective,
      'seconds_per_hanger', v_session.seconds_per_hanger,
      'time_advanced_seconds', v_time_advanced,
      'capped_by', v_capped_by
    )
  ) returning id into v_activity_id;

  -- 14. On route completion: close session + route, write two activity rows.
  if v_route_complete then
    update public.door_hanger_routes
       set status = 'completed',
           last_completed_at = v_new_simulated_at
     where id = v_route.id;

    update public.door_hanger_distribution_sessions
       set status = 'completed',
           ended_at = v_new_simulated_at
     where id = v_session.id;

    insert into public.simulation_activity (
      business_id, simulation_run_id, plugin_key, action_type,
      summary, simulated_at, metadata
    ) values (
      p_business_id, p_simulation_run_id, 'door_hanger',
      'door_hanger.route_completed',
      'Route ' || v_route.name || ' completed',
      v_new_simulated_at,
      jsonb_build_object(
        'route_id', v_route.id,
        'session_id', v_session.id
      )
    ) returning id into v_route_completed_activity_id;

    insert into public.simulation_activity (
      business_id, simulation_run_id, plugin_key, action_type,
      summary, simulated_at, metadata
    ) values (
      p_business_id, p_simulation_run_id, 'door_hanger',
      'door_hanger.session_completed',
      'Session completed',
      v_new_simulated_at,
      jsonb_build_object(
        'session_id', v_session.id,
        'route_id', v_route.id
      )
    ) returning id into v_session_completed_activity_id;
  end if;

  return jsonb_build_object(
    'effective_count', v_effective,
    'requested_count', p_requested_count,
    'capped_by', v_capped_by,
    'time_advanced_seconds', v_time_advanced,
    'new_simulated_at', v_new_simulated_at,
    'route_completed', v_route_complete,
    'summary', v_summary,
    'activity_id', v_activity_id,
    'route_completed_activity_id', v_route_completed_activity_id,
    'session_completed_activity_id', v_session_completed_activity_id
  );
end;
$$;

-- The service-role client is the only caller in the application code
-- (writes go through service-role per Pattern B). Locking down EXECUTE
-- avoids any accidental call from authenticated/anon clients.
revoke all on function public.door_hanger_simulation_hang(uuid, uuid, uuid, text, integer)
  from public;
grant execute on function public.door_hanger_simulation_hang(uuid, uuid, uuid, text, integer)
  to service_role;

comment on function public.door_hanger_simulation_hang(uuid, uuid, uuid, text, integer) is
  'Phase 7D-2: atomic Door Hanger Hang action. Locks session+design+route+run, '
  'computes effective N, decrements inventory, updates session counters, '
  'completes route stops, advances simulated clock, appends simulation_activity, '
  'and marks route+session completed when fully walked. No CRM writes.';

commit;
