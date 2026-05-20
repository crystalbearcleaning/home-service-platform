-- =========================================================================
-- Home Service Operating Platform — Phase 3 Message Automations schema
-- Source of truth: docs/PHASE_3_MESSAGE_AUTOMATIONS_AND_REQUEST_HANDLING.md
-- Pairs with: supabase/seed/phase_3_seed.sql
--
-- Scope (Phase 3B): tables, FKs, indexes, CHECK constraints, RLS enable +
-- policies for the four Phase 3 tables only:
--   - notification_recipients
--   - message_automations
--   - automation_recipients
--   - notification_logs
--
-- Phase 3B does NOT:
--   - introduce a provider config / secrets table (GHL config lives in env)
--   - send SMS, call GoHighLevel, or wire quote-flow triggers
--   - add or change any Phase 1 / Phase 2 table
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS so
-- this migration can be re-run safely in development. All work runs inside
-- a single transaction. The schema portion uses CREATE TABLE without
-- IF NOT EXISTS to match the Phase 1 pattern — re-running this migration
-- on a database that already contains these tables will error, which is
-- the desired forward-only behavior.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. notification_recipients
-- -------------------------------------------------------------------------
-- Global per-business list of people who can receive internal notifications.
-- Phase 3 only writes SMS via GoHighLevel; the table is provider-agnostic.
-- phone_e164 is checked against a basic E.164 shape ("+" + 7–15 digits).
-- -------------------------------------------------------------------------
create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone_e164 text not null,
  role_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_recipients_phone_e164_format
    check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  unique (business_id, phone_e164)
);
create trigger notification_recipients_set_updated_at
  before update on public.notification_recipients
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 2. message_automations
-- -------------------------------------------------------------------------
-- One row per configurable automation rule. Triggers and templates are
-- code/seed-owned in Phase 3; the admin can only toggle is_enabled and
-- manage recipients (see automation_recipients).
-- -------------------------------------------------------------------------
create table public.message_automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_key text not null,
  name text not null,
  description text,
  trigger_type text not null,
  trigger_filters jsonb not null default '{}'::jsonb,
  channel text not null default 'sms',
  provider_key text not null default 'gohighlevel',
  template_key text not null,
  template_preview text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_automations_channel_check
    check (channel in ('sms')),
  constraint message_automations_provider_key_check
    check (provider_key in ('gohighlevel')),
  unique (business_id, automation_key)
);
create trigger message_automations_set_updated_at
  before update on public.message_automations
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 3. automation_recipients
-- -------------------------------------------------------------------------
-- Join row: which recipients are subscribed to which automation. An
-- automation only sends to recipients whose join row AND own
-- is_active flag are true.
-- -------------------------------------------------------------------------
create table public.automation_recipients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid not null references public.message_automations(id) on delete cascade,
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, recipient_id)
);
create trigger automation_recipients_set_updated_at
  before update on public.automation_recipients
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- 4. notification_logs
-- -------------------------------------------------------------------------
-- One row per (automation, recipient, send attempt). Status transitions
-- pending → sent / failed / skipped. Manual retry creates a NEW row with
-- retried_from_log_id pointing at the original failed row; the original
-- row is never mutated. Related-object FKs are nullable + ON DELETE
-- SET NULL so log history survives downstream record deletion.
-- -------------------------------------------------------------------------
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  automation_id uuid references public.message_automations(id) on delete set null,
  recipient_id uuid references public.notification_recipients(id) on delete set null,
  provider_key text not null,
  channel text not null,
  status text not null,
  recipient_phone_e164 text not null,
  rendered_message text,
  provider_message_id text,
  provider_response jsonb,
  error_code text,
  error_message text,
  related_task_id uuid references public.tasks(id) on delete set null,
  related_lead_id uuid references public.leads(id) on delete set null,
  related_quote_id uuid references public.quotes(id) on delete set null,
  related_contact_id uuid references public.contacts(id) on delete set null,
  related_property_id uuid references public.properties(id) on delete set null,
  retried_from_log_id uuid references public.notification_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  constraint notification_logs_status_check
    check (status in ('pending','sent','failed','skipped')),
  constraint notification_logs_channel_check
    check (channel in ('sms')),
  constraint notification_logs_provider_key_check
    check (provider_key in ('gohighlevel'))
);

-- -------------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------------
create index idx_notification_recipients_business
  on public.notification_recipients(business_id);
create index idx_notification_recipients_business_active
  on public.notification_recipients(business_id, is_active);

create index idx_message_automations_business
  on public.message_automations(business_id);
create index idx_message_automations_business_enabled
  on public.message_automations(business_id, is_enabled);
create index idx_message_automations_business_trigger
  on public.message_automations(business_id, trigger_type);

create index idx_automation_recipients_business
  on public.automation_recipients(business_id);
create index idx_automation_recipients_automation
  on public.automation_recipients(business_id, automation_id);
create index idx_automation_recipients_recipient
  on public.automation_recipients(business_id, recipient_id);

create index idx_notification_logs_business_created
  on public.notification_logs(business_id, created_at desc);
create index idx_notification_logs_business_status
  on public.notification_logs(business_id, status);
create index idx_notification_logs_business_automation
  on public.notification_logs(business_id, automation_id);
create index idx_notification_logs_business_recipient
  on public.notification_logs(business_id, recipient_id);
create index idx_notification_logs_related_task
  on public.notification_logs(business_id, related_task_id);
create index idx_notification_logs_related_lead
  on public.notification_logs(business_id, related_lead_id);
create index idx_notification_logs_retried_from
  on public.notification_logs(business_id, retried_from_log_id);

-- -------------------------------------------------------------------------
-- RLS — enable + policies
-- -------------------------------------------------------------------------
-- All four Phase 3 tables follow PATTERN B from Phase 1:
--   authenticated business members may SELECT;
--   INSERT / UPDATE / DELETE go through the service-role client only.
--
-- Why pattern B everywhere:
--   - notification_logs is system-written by the automation engine.
--   - notification_recipients, message_automations, and
--     automation_recipients are configured through controlled admin
--     server actions (Phase 3D). Centralising writes through the
--     service role keeps audit, validation, and rate-limit decisions in
--     one place rather than scattering INSERT/UPDATE rights across
--     client-callable APIs.
-- -------------------------------------------------------------------------
alter table public.notification_recipients enable row level security;
alter table public.message_automations     enable row level security;
alter table public.automation_recipients   enable row level security;
alter table public.notification_logs       enable row level security;

drop policy if exists "notification_recipients_members_select" on public.notification_recipients;
create policy "notification_recipients_members_select" on public.notification_recipients
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "message_automations_members_select" on public.message_automations;
create policy "message_automations_members_select" on public.message_automations
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "automation_recipients_members_select" on public.automation_recipients;
create policy "automation_recipients_members_select" on public.automation_recipients
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "notification_logs_members_select" on public.notification_logs;
create policy "notification_logs_members_select" on public.notification_logs
  for select to authenticated
  using (public.is_business_member(business_id));

commit;
