-- =========================================================================
-- Phase 3B verification queries (read-only)
-- Run after applying:
--   - supabase/migrations/20260520120000_phase_3_message_automations.sql
--   - supabase/seed/phase_3_seed.sql   (via supabase/seed/run_seed.sh)
--
-- Each block is independent — copy/paste into Supabase Studio's SQL editor
-- or pipe through `supabase db query --linked --file ...`.
--
-- All four Phase 3 tables should exist, RLS should be enabled, the three
-- automations should be present, and the recipient + assignments should
-- exist only when SEED_NOTIFICATION_PHONE_E164 was set at seed time.
-- No notification_logs rows are seeded.
-- =========================================================================

-- 1. The four Phase 3 tables exist in the public schema.
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in (
     'notification_recipients',
     'message_automations',
     'automation_recipients',
     'notification_logs'
   )
 order by table_name;
-- expect: 4 rows.

-- 2. RLS is enabled on all four tables.
select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in (
     'notification_recipients',
     'message_automations',
     'automation_recipients',
     'notification_logs'
   )
 order by c.relname;
-- expect: 4 rows, rls_enabled = true for each.

-- 3. SELECT policies exist for each (members-only via is_business_member).
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in (
     'notification_recipients',
     'message_automations',
     'automation_recipients',
     'notification_logs'
   )
 order by tablename, policyname;
-- expect: one policy per table, named *_members_select, cmd = SELECT.

-- 4. The three seeded automations exist for Crystal Bear.
select ma.automation_key, ma.name, ma.trigger_type, ma.trigger_filters,
       ma.channel, ma.provider_key, ma.template_key, ma.is_enabled
  from public.message_automations ma
  join public.businesses b on b.id = ma.business_id
 where b.slug = 'crystal-bear'
 order by ma.automation_key;
-- expect: 3 rows — automation_key in
--   ('manual_quote_needed','schedule_request','service_area_review')
-- all enabled, channel='sms', provider_key='gohighlevel'.

-- 5. Recipient seed: present only when SEED_NOTIFICATION_PHONE_E164 was set.
select nr.name, nr.role_label, nr.is_active,
       length(nr.phone_e164) > 0 as phone_present
  from public.notification_recipients nr
  join public.businesses b on b.id = nr.business_id
 where b.slug = 'crystal-bear';
-- expect: 0 rows when SEED_NOTIFICATION_PHONE_E164 was empty at seed time.
-- expect: 1 row (Sam, Owner, active) when it was set. Phone value is not
--         echoed back — only its presence is checked.

-- 6. Recipient is assigned to all three automations when it exists.
select ar.is_enabled, ma.automation_key, nr.name as recipient_name
  from public.automation_recipients ar
  join public.message_automations ma   on ma.id = ar.automation_id
  join public.notification_recipients nr on nr.id = ar.recipient_id
  join public.businesses b              on b.id = ar.business_id
 where b.slug = 'crystal-bear'
 order by ma.automation_key;
-- expect: 3 rows when a recipient was seeded; 0 rows otherwise.

-- 7. No notification logs are seeded.
select count(*) as notification_logs_count
  from public.notification_logs;
-- expect: 0.

-- 8. CHECK constraints + UNIQUEs are present.
select conrelid::regclass as table_name, conname, contype
  from pg_constraint
 where conrelid in (
     'public.notification_recipients'::regclass,
     'public.message_automations'::regclass,
     'public.automation_recipients'::regclass,
     'public.notification_logs'::regclass
   )
   and contype in ('c','u')
 order by conrelid::regclass::text, conname;
-- expect:
--   notification_recipients: phone_e164_format (c), business_id+phone_e164 (u)
--   message_automations:    channel_check, provider_key_check (c),
--                           business_id+automation_key (u)
--   automation_recipients:  automation_id+recipient_id (u)
--   notification_logs:      channel_check, provider_key_check,
--                           status_check (c)
