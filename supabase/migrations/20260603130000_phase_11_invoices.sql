-- =========================================================================
-- Home Service Operating Platform — Phase 11B Invoices + Payments
-- Source of truth:
--   docs/PHASE_11_INVOICE_AND_PAYMENT_RECORDING_FOUNDATION.md §§20, 21
--
-- Scope (Phase 11B):
--   - three new tables: invoices + invoice_line_items + invoice_payments
--   - indexes, CHECK constraints, RLS Pattern B (members SELECT;
--     INSERT / UPDATE / DELETE through controlled admin server actions
--     using the service-role client)
--
-- Phase 11B does NOT:
--   - build any UI (Phase 11C+)
--   - touch jobs / contacts / properties / quotes / services schema
--   - create payment processor / Stripe / Square tables
--   - create refunds / taxes / discounts / deposits tables or columns
--   - create receipt-template / receipt-delivery tables
--   - create customer-facing or public-token columns
--   - touch the message-automation engine
--   - generate invoices from simulation outcomes
--   - change public /q behavior
--
-- Money convention: bigint cents (matches Phase 5+ door-hanger,
-- Phase 6+ simulation, Phase 7B distribution sessions, Phase 9B jobs).
--
-- Atomicity: Phase 11B server helpers use ordered writes + a recompute
-- step for invoices.{subtotal_cents, total_cents, amount_paid_cents,
-- balance_cents} (mirrors Phase 9B recomputeJobEstimatedTotal). No
-- Postgres RPC is created for Phase 11B.
--
-- Overpayment posture: the action layer rejects payments that would
-- drive balance_cents below 0 (§12 of the Phase 11 doc). The DB CHECK
-- `balance_cents >= 0` is the safety net.
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS
-- so the migration is safely re-runnable in dev. All work runs inside
-- a single transaction.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. invoices
-- -------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  invoice_number text,
  status text not null default 'unpaid',
  source text not null default 'job_completion',
  subtotal_cents bigint not null default 0,
  total_cents bigint not null default 0,
  amount_paid_cents bigint not null default 0,
  balance_cents bigint not null default 0,
  paid_at timestamptz,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_invoice_number_nonempty
    check (invoice_number is null or length(btrim(invoice_number)) > 0),
  constraint invoices_status_check
    check (status in ('draft','unpaid','paid','void')),
  constraint invoices_source_check
    check (source in ('job_completion','manual')),
  constraint invoices_subtotal_nonneg
    check (subtotal_cents >= 0),
  constraint invoices_total_nonneg
    check (total_cents >= 0),
  constraint invoices_amount_paid_nonneg
    check (amount_paid_cents >= 0),
  constraint invoices_balance_nonneg
    check (balance_cents >= 0)
);
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index idx_invoices_business
  on public.invoices(business_id);
create index idx_invoices_business_status
  on public.invoices(business_id, status);
create index idx_invoices_business_created
  on public.invoices(business_id, created_at desc);
create index idx_invoices_business_paid_at
  on public.invoices(business_id, paid_at);
create index idx_invoices_contact
  on public.invoices(contact_id);
create index idx_invoices_job
  on public.invoices(job_id);

-- -------------------------------------------------------------------------
-- 2. invoice_line_items
-- -------------------------------------------------------------------------
create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  job_line_item_id uuid references public.job_line_items(id) on delete set null,
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
  constraint invoice_line_items_name_nonempty
    check (length(btrim(name)) > 0),
  constraint invoice_line_items_quantity_positive
    check (quantity > 0),
  constraint invoice_line_items_unit_price_nonneg
    check (unit_price_cents >= 0),
  constraint invoice_line_items_total_nonneg
    check (total_cents >= 0),
  constraint invoice_line_items_source_check
    check (source in ('job','custom'))
);
create trigger invoice_line_items_set_updated_at
  before update on public.invoice_line_items
  for each row execute function public.set_updated_at();

create index idx_invoice_line_items_business
  on public.invoice_line_items(business_id);
create index idx_invoice_line_items_business_invoice
  on public.invoice_line_items(business_id, invoice_id);
create index idx_invoice_line_items_invoice_order
  on public.invoice_line_items(invoice_id, sort_order asc nulls last, created_at asc);
create index idx_invoice_line_items_job_line_item
  on public.invoice_line_items(job_line_item_id);

-- -------------------------------------------------------------------------
-- 3. invoice_payments
-- -------------------------------------------------------------------------
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents bigint not null,
  payment_method text not null,
  paid_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint invoice_payments_amount_positive
    check (amount_cents > 0),
  constraint invoice_payments_method_check
    check (payment_method in ('cash','check','card','zelle','other'))
);

create index idx_invoice_payments_business
  on public.invoice_payments(business_id);
create index idx_invoice_payments_business_invoice
  on public.invoice_payments(business_id, invoice_id);
create index idx_invoice_payments_business_paid_at
  on public.invoice_payments(business_id, paid_at desc);

-- -------------------------------------------------------------------------
-- RLS — Pattern B (matches every Phase 4–10 core table):
-- authenticated business members may SELECT; INSERT / UPDATE / DELETE
-- go through controlled admin server actions using the service-role
-- client (added in Phase 11D/E).
-- -------------------------------------------------------------------------
alter table public.invoices            enable row level security;
alter table public.invoice_line_items  enable row level security;
alter table public.invoice_payments    enable row level security;

drop policy if exists "invoices_members_select" on public.invoices;
create policy "invoices_members_select" on public.invoices
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "invoice_line_items_members_select" on public.invoice_line_items;
create policy "invoice_line_items_members_select" on public.invoice_line_items
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "invoice_payments_members_select" on public.invoice_payments;
create policy "invoice_payments_members_select" on public.invoice_payments
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
