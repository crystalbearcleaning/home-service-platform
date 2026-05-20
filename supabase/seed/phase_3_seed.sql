-- =========================================================================
-- Phase 3 seed — Message Automations for Crystal Bear
-- Idempotent: safe to re-run. ON CONFLICT keys derive from the unique
-- constraints declared in 20260520120000_phase_3_message_automations.sql.
--
-- Run via:  supabase/seed/run_seed.sh
-- The runner replaces __SEED_NOTIFICATION_PHONE_E164__ with
-- $SEED_NOTIFICATION_PHONE_E164 from .env.local before piping the file to
-- `supabase db query --linked`.
--
-- If SEED_NOTIFICATION_PHONE_E164 is empty/missing the placeholder is
-- substituted with an empty string and the recipient block is skipped
-- with a clear RAISE NOTICE. The three automations are still seeded so
-- the admin UI has something to show once Phase 3D ships.
-- =========================================================================

begin;

do $phase3$
declare
  v_business_id        uuid;

  -- Automation seed ids (resolved after upsert)
  v_automation_schedule_id     uuid;
  v_automation_manual_quote_id uuid;
  v_automation_service_area_id uuid;

  -- Recipient seed (env-driven)
  v_recipient_phone text := '__SEED_NOTIFICATION_PHONE_E164__';
  v_recipient_id    uuid;
begin
  -- ---------------------------------------------------------------------
  -- Resolve Crystal Bear business id (seeded in phase_1_seed.sql)
  -- ---------------------------------------------------------------------
  select id into v_business_id
    from public.businesses
   where slug = 'crystal-bear'
   limit 1;

  if v_business_id is null then
    raise exception
      'Phase 3 seed: Crystal Bear business (slug=crystal-bear) was not found. '
      'Run phase_1_seed.sql first.';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Seed the three automations (idempotent on (business_id, automation_key))
  -- ---------------------------------------------------------------------
  insert into public.message_automations
    (business_id, automation_key, name, description,
     trigger_type, trigger_filters,
     channel, provider_key, template_key, template_preview, is_enabled)
  values
    (v_business_id,
     'schedule_request',
     'Schedule Request',
     'A lead requests to schedule.',
     'task.created',
     jsonb_build_object('category', 'schedule_request'),
     'sms',
     'gohighlevel',
     'internal_schedule_request_v1',
     $tpl$New schedule request: {{customer_name}}, {{address}}, {{city}}. {{plan_label}}, {{total}}. Call/text them to confirm scheduling.$tpl$,
     true)
  on conflict (business_id, automation_key) do update
    set name             = excluded.name,
        description      = excluded.description,
        trigger_type     = excluded.trigger_type,
        trigger_filters  = excluded.trigger_filters,
        channel          = excluded.channel,
        provider_key     = excluded.provider_key,
        template_key     = excluded.template_key,
        template_preview = excluded.template_preview,
        updated_at       = now()
  returning id into v_automation_schedule_id;

  insert into public.message_automations
    (business_id, automation_key, name, description,
     trigger_type, trigger_filters,
     channel, provider_key, template_key, template_preview, is_enabled)
  values
    (v_business_id,
     'manual_quote_needed',
     'Manual Quote Needed',
     'A property could not be quoted automatically.',
     'task.created',
     jsonb_build_object('category', 'manual_quote'),
     'sms',
     'gohighlevel',
     'internal_manual_quote_needed_v1',
     $tpl$Manual quote needed: {{customer_name}}, {{address}}, {{city}}. We don't have property data — call/text them to gather details and quote.$tpl$,
     true)
  on conflict (business_id, automation_key) do update
    set name             = excluded.name,
        description      = excluded.description,
        trigger_type     = excluded.trigger_type,
        trigger_filters  = excluded.trigger_filters,
        channel          = excluded.channel,
        provider_key     = excluded.provider_key,
        template_key     = excluded.template_key,
        template_preview = excluded.template_preview,
        updated_at       = now()
  returning id into v_automation_manual_quote_id;

  insert into public.message_automations
    (business_id, automation_key, name, description,
     trigger_type, trigger_filters,
     channel, provider_key, template_key, template_preview, is_enabled)
  values
    (v_business_id,
     'service_area_review',
     'Service Area Review',
     'A lead is outside the normal service area and needs review.',
     'task.created',
     jsonb_build_object('category', 'service_area_review'),
     'sms',
     'gohighlevel',
     'internal_service_area_review_v1',
     $tpl$Out-of-area lead: {{customer_name}}, {{city}}. Review whether we can help and follow up.$tpl$,
     true)
  on conflict (business_id, automation_key) do update
    set name             = excluded.name,
        description      = excluded.description,
        trigger_type     = excluded.trigger_type,
        trigger_filters  = excluded.trigger_filters,
        channel          = excluded.channel,
        provider_key     = excluded.provider_key,
        template_key     = excluded.template_key,
        template_preview = excluded.template_preview,
        updated_at       = now()
  returning id into v_automation_service_area_id;

  -- ---------------------------------------------------------------------
  -- 2. Seed Sam as the initial notification recipient — ONLY when the
  --    SEED_NOTIFICATION_PHONE_E164 env var is provided. The phone number
  --    is never hardcoded in this file.
  -- ---------------------------------------------------------------------
  if v_recipient_phone is null or length(trim(v_recipient_phone)) = 0 then
    raise notice '------------------------------------------------------------';
    raise notice 'SEED_NOTIFICATION_PHONE_E164 is empty.';
    raise notice 'Phase 3 automations were seeded, but no notification recipient was created.';
    raise notice 'Add the recipient later by setting SEED_NOTIFICATION_PHONE_E164 in .env.local';
    raise notice 'and re-running supabase/seed/run_seed.sh — or insert directly:';
    raise notice '  insert into public.notification_recipients';
    raise notice '    (business_id, name, phone_e164, role_label, is_active)';
    raise notice '  values (<crystal-bear business_id>, ''Sam'', ''+1XXXXXXXXXX'', ''Owner'', true);';
    raise notice '------------------------------------------------------------';
  else
    insert into public.notification_recipients
      (business_id, name, phone_e164, role_label, is_active)
    values
      (v_business_id, 'Sam', v_recipient_phone, 'Owner', true)
    on conflict (business_id, phone_e164) do update
      set name       = excluded.name,
          role_label = excluded.role_label,
          is_active  = excluded.is_active,
          updated_at = now()
    returning id into v_recipient_id;

    -- ---------------------------------------------------------------------
    -- 3. Assign the recipient to all three automations.
    -- ---------------------------------------------------------------------
    insert into public.automation_recipients
      (business_id, automation_id, recipient_id, is_enabled)
    values
      (v_business_id, v_automation_schedule_id,     v_recipient_id, true),
      (v_business_id, v_automation_manual_quote_id, v_recipient_id, true),
      (v_business_id, v_automation_service_area_id, v_recipient_id, true)
    on conflict (automation_id, recipient_id) do update
      set is_enabled = excluded.is_enabled,
          updated_at = now();

    raise notice 'Phase 3 seed: linked Sam (phone provided via env) to all three automations.';
  end if;

  raise notice 'Phase 3 seed complete.';
end
$phase3$;

commit;
