-- =========================================================================
-- Home Service Operating Platform — Phase 5B-1 Door Hanger Plugin schema
-- Source of truth:
--   docs/PHASE_5_DOOR_HANGER_PLUGIN_AND_SIMULATION_ARCHITECTURE.md
--   (especially Appendix A — Phase 5A-2 product/design addendum)
--
-- Scope: tables, FKs, indexes, CHECK constraints, RLS enable + members
-- SELECT policies for the five new Door Hanger plugin tables.
--
-- Pairs with: supabase/seed/phase_5_seed.sql (plugin_definition +
-- installed_plugin rows for Crystal Bear; no demo campaigns / inventory
-- / routes / sessions are seeded).
--
-- Phase 5B-1 does NOT:
--   - build the Marketing admin UI (Phase 5B-2)
--   - generate routes from RentCast (Phase 5C)
--   - simulate door hanger distribution (Phase 6+)
--   - generate CRM leads from door hanger activity (Phase 6+)
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS
-- so this migration can be re-run safely in development. All work runs
-- inside a single transaction. Money columns store cents as bigint to
-- avoid floating-point money math.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. door_hanger_designs (inventory)
-- -------------------------------------------------------------------------
create table public.door_hanger_designs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  version_or_offer text,
  quantity_received integer not null,
  quantity_used integer not null default 0,
  total_print_cost_cents bigint,
  cost_per_hanger_cents bigint,
  received_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_hanger_designs_quantity_received_nonneg
    check (quantity_received >= 0),
  constraint door_hanger_designs_quantity_used_nonneg
    check (quantity_used >= 0),
  constraint door_hanger_designs_quantity_used_le_received
    check (quantity_used <= quantity_received),
  constraint door_hanger_designs_total_cost_nonneg
    check (total_print_cost_cents is null or total_print_cost_cents >= 0),
  constraint door_hanger_designs_cost_per_hanger_nonneg
    check (cost_per_hanger_cents is null or cost_per_hanger_cents >= 0)
);
create trigger door_hanger_designs_set_updated_at
  before update on public.door_hanger_designs
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 2. door_hanger_campaigns
-- -------------------------------------------------------------------------
create table public.door_hanger_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  offer_summary text,
  target_area text,
  status text not null default 'draft',
  response_rate_assumption numeric(6,4),
  quote_to_booking_assumption numeric(6,4),
  average_job_value_cents bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_hanger_campaigns_status_check
    check (status in ('draft','active','paused','complete')),
  constraint door_hanger_campaigns_response_rate_range
    check (
      response_rate_assumption is null
      or (response_rate_assumption >= 0 and response_rate_assumption <= 1)
    ),
  constraint door_hanger_campaigns_booking_rate_range
    check (
      quote_to_booking_assumption is null
      or (quote_to_booking_assumption >= 0 and quote_to_booking_assumption <= 1)
    ),
  constraint door_hanger_campaigns_avg_job_value_nonneg
    check (average_job_value_cents is null or average_job_value_cents >= 0)
);
create trigger door_hanger_campaigns_set_updated_at
  before update on public.door_hanger_campaigns
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 3. door_hanger_routes
-- -------------------------------------------------------------------------
-- Manual route shells are allowed (generated_from_source='manual') as a
-- Phase 5B fallback. RentCast-generated routes land in Phase 5C and use
-- generated_from_source='rentcast'.
-- -------------------------------------------------------------------------
create table public.door_hanger_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid references public.door_hanger_campaigns(id) on delete set null,
  name text not null,
  center_address text,
  center_lat numeric(10,7),
  center_lng numeric(10,7),
  radius_miles numeric(6,2),
  target_home_count integer,
  generated_from_source text not null default 'manual',
  status text not null default 'draft',
  total_route_stops integer not null default 0,
  estimated_time_seconds integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_hanger_routes_status_check
    check (status in ('draft','ready','in_progress','completed','paused')),
  constraint door_hanger_routes_source_check
    check (generated_from_source in ('manual','rentcast')),
  constraint door_hanger_routes_radius_positive
    check (radius_miles is null or radius_miles > 0),
  constraint door_hanger_routes_target_count_positive
    check (target_home_count is null or target_home_count > 0),
  constraint door_hanger_routes_total_stops_nonneg
    check (total_route_stops >= 0),
  constraint door_hanger_routes_estimated_time_nonneg
    check (estimated_time_seconds is null or estimated_time_seconds >= 0)
);
create trigger door_hanger_routes_set_updated_at
  before update on public.door_hanger_routes
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 4. door_hanger_route_stops
-- -------------------------------------------------------------------------
-- Designed for the Phase 5C RentCast generation flow. Each row is one
-- candidate home; rentcast_snapshot stores the safe-subset response.
-- -------------------------------------------------------------------------
create table public.door_hanger_route_stops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  route_id uuid not null references public.door_hanger_routes(id) on delete cascade,
  stop_order integer,
  address text not null,
  city text,
  state text,
  postal_code text,
  lat numeric(10,7),
  lng numeric(10,7),
  property_type text,
  square_footage integer,
  estimated_value_cents bigint,
  rentcast_snapshot jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_hanger_route_stops_status_check
    check (status in ('pending','completed','skipped')),
  constraint door_hanger_route_stops_square_footage_nonneg
    check (square_footage is null or square_footage >= 0),
  constraint door_hanger_route_stops_estimated_value_nonneg
    check (estimated_value_cents is null or estimated_value_cents >= 0),
  constraint door_hanger_route_stops_stop_order_nonneg
    check (stop_order is null or stop_order >= 0)
);
create trigger door_hanger_route_stops_set_updated_at
  before update on public.door_hanger_route_stops
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 5. door_hanger_distribution_sessions
-- -------------------------------------------------------------------------
-- Logs one distribution session. Phase 5B writes only mode='real'.
-- Phase 6+ simulation adapter will write mode='simulated' through the
-- same table — no separate "simulated_*" table.
-- -------------------------------------------------------------------------
create table public.door_hanger_distribution_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid references public.door_hanger_campaigns(id) on delete set null,
  route_id uuid references public.door_hanger_routes(id) on delete set null,
  design_id uuid references public.door_hanger_designs(id) on delete set null,
  distributed_at timestamptz not null,
  hangers_distributed integer not null,
  time_spent_seconds integer,
  material_cost_cents bigint,
  notes text,
  mode text not null default 'real',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint door_hanger_distribution_sessions_mode_check
    check (mode in ('real','simulated')),
  constraint door_hanger_distribution_sessions_hangers_nonneg
    check (hangers_distributed >= 0),
  constraint door_hanger_distribution_sessions_time_nonneg
    check (time_spent_seconds is null or time_spent_seconds >= 0),
  constraint door_hanger_distribution_sessions_material_cost_nonneg
    check (material_cost_cents is null or material_cost_cents >= 0)
);
create trigger door_hanger_distribution_sessions_set_updated_at
  before update on public.door_hanger_distribution_sessions
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------------
create index idx_door_hanger_designs_business
  on public.door_hanger_designs(business_id);
create index idx_door_hanger_designs_business_created
  on public.door_hanger_designs(business_id, created_at desc);

create index idx_door_hanger_campaigns_business
  on public.door_hanger_campaigns(business_id);
create index idx_door_hanger_campaigns_business_status
  on public.door_hanger_campaigns(business_id, status);
create index idx_door_hanger_campaigns_business_created
  on public.door_hanger_campaigns(business_id, created_at desc);

create index idx_door_hanger_routes_business
  on public.door_hanger_routes(business_id);
create index idx_door_hanger_routes_business_campaign
  on public.door_hanger_routes(business_id, campaign_id);
create index idx_door_hanger_routes_business_status
  on public.door_hanger_routes(business_id, status);
create index idx_door_hanger_routes_business_created
  on public.door_hanger_routes(business_id, created_at desc);

create index idx_door_hanger_route_stops_business_route
  on public.door_hanger_route_stops(business_id, route_id);
create index idx_door_hanger_route_stops_route_order
  on public.door_hanger_route_stops(route_id, stop_order);

create index idx_door_hanger_distribution_sessions_business
  on public.door_hanger_distribution_sessions(business_id);
create index idx_door_hanger_distribution_sessions_business_campaign
  on public.door_hanger_distribution_sessions(business_id, campaign_id);
create index idx_door_hanger_distribution_sessions_business_route
  on public.door_hanger_distribution_sessions(business_id, route_id);
create index idx_door_hanger_distribution_sessions_business_design
  on public.door_hanger_distribution_sessions(business_id, design_id);
create index idx_door_hanger_distribution_sessions_business_distributed
  on public.door_hanger_distribution_sessions(business_id, distributed_at desc);

-- -------------------------------------------------------------------------
-- RLS — enable + policies
-- -------------------------------------------------------------------------
-- Pattern B (matches the Phase 1 contacts/leads/quotes/tasks/events
-- treatment and the Phase 3 notification tables):
--   authenticated business members may SELECT;
--   INSERT / UPDATE / DELETE go through controlled admin server actions
--   using the service-role client (added in Phase 5B-2).
-- -------------------------------------------------------------------------
alter table public.door_hanger_designs                 enable row level security;
alter table public.door_hanger_campaigns               enable row level security;
alter table public.door_hanger_routes                  enable row level security;
alter table public.door_hanger_route_stops             enable row level security;
alter table public.door_hanger_distribution_sessions   enable row level security;

drop policy if exists "door_hanger_designs_members_select" on public.door_hanger_designs;
create policy "door_hanger_designs_members_select" on public.door_hanger_designs
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "door_hanger_campaigns_members_select" on public.door_hanger_campaigns;
create policy "door_hanger_campaigns_members_select" on public.door_hanger_campaigns
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "door_hanger_routes_members_select" on public.door_hanger_routes;
create policy "door_hanger_routes_members_select" on public.door_hanger_routes
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "door_hanger_route_stops_members_select" on public.door_hanger_route_stops;
create policy "door_hanger_route_stops_members_select" on public.door_hanger_route_stops
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "door_hanger_distribution_sessions_members_select" on public.door_hanger_distribution_sessions;
create policy "door_hanger_distribution_sessions_members_select" on public.door_hanger_distribution_sessions
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
