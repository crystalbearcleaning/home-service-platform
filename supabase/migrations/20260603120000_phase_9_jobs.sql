-- =========================================================================
-- Home Service Operating Platform — Phase 9B Jobs + Job Line Items
-- Source of truth:
--   docs/PHASE_9_JOBS_AND_JOB_LINE_ITEMS_FOUNDATION.md §§14, 18
--
-- Scope (Phase 9B):
--   - two new tables: jobs + job_line_items
--   - indexes, CHECK constraints, RLS Pattern B (members SELECT;
--     INSERT / UPDATE / DELETE through controlled admin server actions
--     using the service-role client)
--
-- Phase 9B does NOT:
--   - build any UI (Phase 9C+)
--   - touch contacts / properties / quotes / services / tasks / notes
--     schema
--   - create invoices / payments / visits / appointments / calendar
--     tables
--   - touch the message-automation engine
--   - generate jobs from simulation outcomes
--   - change public /q behavior
--
-- Money convention: bigint cents (matches Phase 5+ door-hanger,
-- Phase 6+ simulation, Phase 7B distribution sessions).
--
-- Atomicity: Phase 9B server helpers use ordered writes + a recompute
-- step for jobs.estimated_total_cents (mirrors Phase 5B
-- createDistributionSession + Phase 7D-1 startDoorHangerSimulationSession).
-- No Postgres RPC is created for Phase 9B.
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS
-- so the migration is safely re-runnable in dev. All work runs inside
-- a single transaction.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. jobs
-- -------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  title text not null,
  summary text,
  status text not null default 'draft',
  source text not null default 'manual',
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  arrival_window_label text,
  estimated_total_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_title_nonempty
    check (length(btrim(title)) > 0),
  constraint jobs_status_check
    check (status in ('draft','unscheduled','scheduled','in_progress','completed','canceled')),
  constraint jobs_source_check
    check (source in ('manual','quote')),
  constraint jobs_estimated_total_nonneg
    check (estimated_total_cents >= 0),
  constraint jobs_scheduled_end_after_start
    check (
      scheduled_start_at is null
      or scheduled_end_at is null
      or scheduled_end_at >= scheduled_start_at
    )
);
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create index idx_jobs_business
  on public.jobs(business_id);
create index idx_jobs_business_status
  on public.jobs(business_id, status);
create index idx_jobs_business_created
  on public.jobs(business_id, created_at desc);
create index idx_jobs_business_scheduled_start
  on public.jobs(business_id, scheduled_start_at);
create index idx_jobs_contact
  on public.jobs(contact_id);
create index idx_jobs_quote
  on public.jobs(quote_id);

-- -------------------------------------------------------------------------
-- 2. job_line_items
-- -------------------------------------------------------------------------
create table public.job_line_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price_cents bigint not null,
  total_cents bigint not null,
  sort_order integer,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_line_items_name_nonempty
    check (length(btrim(name)) > 0),
  constraint job_line_items_quantity_positive
    check (quantity > 0),
  constraint job_line_items_unit_price_nonneg
    check (unit_price_cents >= 0),
  constraint job_line_items_total_nonneg
    check (total_cents >= 0),
  constraint job_line_items_source_check
    check (source in ('quote','service','custom'))
);
create trigger job_line_items_set_updated_at
  before update on public.job_line_items
  for each row execute function public.set_updated_at();

create index idx_job_line_items_business
  on public.job_line_items(business_id);
create index idx_job_line_items_business_job
  on public.job_line_items(business_id, job_id);
create index idx_job_line_items_job_order
  on public.job_line_items(job_id, sort_order asc nulls last, created_at asc);

-- -------------------------------------------------------------------------
-- RLS — Pattern B (matches Phase 1 contacts/leads/quotes/tasks/events
-- and the Phase 5+ door-hanger / simulation_runs / simulation_activity
-- treatment): authenticated business members may SELECT; INSERT /
-- UPDATE / DELETE go through controlled admin server actions using
-- the service-role client (added in Phase 9D+).
-- -------------------------------------------------------------------------
alter table public.jobs              enable row level security;
alter table public.job_line_items    enable row level security;

drop policy if exists "jobs_members_select" on public.jobs;
create policy "jobs_members_select" on public.jobs
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "job_line_items_members_select" on public.job_line_items;
create policy "job_line_items_members_select" on public.job_line_items
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
