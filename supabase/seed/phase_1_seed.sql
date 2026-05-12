-- =========================================================================
-- Phase 1 seed — Crystal Bear Window Cleaning
-- Idempotent: safe to re-run. ON CONFLICT keys derive from the unique
-- constraints declared in 20260511120000_phase_1_schema.sql.
--
-- Run via:  supabase/seed/run_seed.sh
-- The runner replaces __SEED_ADMIN_EMAIL__ with $SEED_ADMIN_EMAIL from
-- .env.local before piping the file to `supabase db query --linked`.
-- Do NOT run this file directly with the placeholder unsubstituted.
-- =========================================================================

begin;

do $seed$
declare
  -- IDs filled in as the seed progresses
  v_business_id               uuid;
  v_role_blueprint_id         uuid;
  v_business_role_id          uuid;
  v_admin_blueprint_id        uuid;
  v_quote_blueprint_id        uuid;
  v_admin_surface_id          uuid;
  v_quote_surface_id          uuid;
  v_exterior_service_id       uuid;
  v_interior_service_id       uuid;
  v_plan_one_time_id          uuid;
  v_plan_six_month_id         uuid;
  v_plan_three_month_id       uuid;
  v_auto_quote_plugin_def_id  uuid;
  v_sales_page_plugin_def_id  uuid;
  v_auto_quote_installed_id   uuid;
  v_sales_page_installed_id   uuid;

  -- Admin linking
  v_seed_admin_email          text := '__SEED_ADMIN_EMAIL__';
  v_auth_user_id              uuid;
  v_membership_id             uuid;
begin
  -- ---------------------------------------------------------------------
  -- 1. Business
  -- ---------------------------------------------------------------------
  insert into public.businesses
    (slug, name, primary_industry, timezone, currency, status)
  values
    ('crystal-bear', 'Crystal Bear Window Cleaning', 'window_cleaning',
     'America/New_York', 'USD', 'active')
  on conflict (slug) do update
    set name             = excluded.name,
        primary_industry = excluded.primary_industry,
        timezone         = excluded.timezone,
        currency         = excluded.currency,
        status           = excluded.status,
        updated_at       = now()
  returning id into v_business_id;

  -- ---------------------------------------------------------------------
  -- 2. Role blueprint + business role (Owner / Admin)
  -- ---------------------------------------------------------------------
  insert into public.role_blueprints
    (key, name, description, default_permissions)
  values
    ('owner_admin', 'Owner / Admin',
     'Full business owner/admin role with all Phase 1 capabilities.',
     jsonb_build_object(
       'capabilities', jsonb_build_array(
         'admin.view',
         'plugins.manage',
         'quotes.view',
         'leads.view',
         'properties.view',
         'tasks.view',
         'tasks.complete',
         'activities.view',
         'issues.view',
         'settings.manage',
         'staging.reset'
       )
     ))
  on conflict (key) do update
    set name                = excluded.name,
        description         = excluded.description,
        default_permissions = excluded.default_permissions
  returning id into v_role_blueprint_id;

  insert into public.business_roles
    (business_id, role_blueprint_id, key, name, description, is_system, status)
  values
    (v_business_id, v_role_blueprint_id, 'owner_admin', 'Owner / Admin',
     'Crystal Bear owner/admin role.', true, 'active')
  on conflict (business_id, key) do update
    set name              = excluded.name,
        description       = excluded.description,
        role_blueprint_id = excluded.role_blueprint_id,
        is_system         = excluded.is_system,
        status            = excluded.status,
        updated_at        = now()
  returning id into v_business_role_id;

  -- ---------------------------------------------------------------------
  -- 3. App surface blueprints
  -- ---------------------------------------------------------------------
  insert into public.app_surface_blueprints
    (key, name, surface_type, description)
  values
    ('admin', 'Admin', 'admin', 'Internal admin app surface.')
  on conflict (key) do update
    set name         = excluded.name,
        surface_type = excluded.surface_type,
        description  = excluded.description
  returning id into v_admin_blueprint_id;

  insert into public.app_surface_blueprints
    (key, name, surface_type, description)
  values
    ('customer_quote', 'Customer Quote', 'customer',
     'Public customer-facing quote app surface.')
  on conflict (key) do update
    set name         = excluded.name,
        surface_type = excluded.surface_type,
        description  = excluded.description
  returning id into v_quote_blueprint_id;

  -- ---------------------------------------------------------------------
  -- 4. App surfaces (per-business instances)
  -- ---------------------------------------------------------------------
  insert into public.app_surfaces
    (business_id, blueprint_id, name, slug, surface_type, status)
  values
    (v_business_id, v_admin_blueprint_id, 'Crystal Bear Admin', 'admin',
     'admin', 'active')
  on conflict (business_id, slug) do update
    set name         = excluded.name,
        blueprint_id = excluded.blueprint_id,
        surface_type = excluded.surface_type,
        status       = excluded.status,
        updated_at   = now()
  returning id into v_admin_surface_id;

  insert into public.app_surfaces
    (business_id, blueprint_id, name, slug, surface_type, status)
  values
    (v_business_id, v_quote_blueprint_id, 'Crystal Bear Customer Quote', 'quote',
     'customer', 'active')
  on conflict (business_id, slug) do update
    set name         = excluded.name,
        blueprint_id = excluded.blueprint_id,
        surface_type = excluded.surface_type,
        status       = excluded.status,
        updated_at   = now()
  returning id into v_quote_surface_id;

  -- Default access: Owner/Admin role can use the Admin surface.
  insert into public.role_app_surface_access (business_id, role_id, app_surface_id)
  values (v_business_id, v_business_role_id, v_admin_surface_id)
  on conflict (role_id, app_surface_id) do nothing;

  -- ---------------------------------------------------------------------
  -- 5. Service areas (Phase 1: city matching only, normalized lowercase)
  -- ---------------------------------------------------------------------
  insert into public.service_areas
    (business_id, name, match_type, match_value, status)
  values
    (v_business_id, 'Boynton Beach', 'city', 'boynton beach', 'active'),
    (v_business_id, 'Boca Raton',    'city', 'boca raton',    'active'),
    (v_business_id, 'Delray Beach',  'city', 'delray beach',  'active')
  on conflict (business_id, match_type, match_value) do update
    set name       = excluded.name,
        status     = excluded.status,
        updated_at = now();

  -- ---------------------------------------------------------------------
  -- 6. Services (Exterior base + Interior add-on)
  -- ---------------------------------------------------------------------
  insert into public.services
    (business_id, name, service_code, description,
     is_base_service, is_add_on, is_active, sort_order, metadata)
  values
    (v_business_id, 'Exterior Window Cleaning', 'EXT_WINDOW',
     'Exterior window cleaning. Free screen cleaning included.',
     true, false, true, 10,
     jsonb_build_object('screen_cleaning_included', true))
  on conflict (business_id, service_code) do update
    set name             = excluded.name,
        description      = excluded.description,
        is_base_service  = excluded.is_base_service,
        is_add_on        = excluded.is_add_on,
        is_active        = excluded.is_active,
        sort_order       = excluded.sort_order,
        metadata         = excluded.metadata,
        updated_at       = now()
  returning id into v_exterior_service_id;

  insert into public.services
    (business_id, name, service_code, description,
     is_base_service, is_add_on, requires_service_id, is_active, sort_order)
  values
    (v_business_id, 'Interior Window Cleaning', 'INT_WINDOW',
     'Optional interior window cleaning add-on. Requires Exterior service.',
     false, true, v_exterior_service_id, true, 20)
  on conflict (business_id, service_code) do update
    set name                = excluded.name,
        description         = excluded.description,
        is_base_service     = excluded.is_base_service,
        is_add_on           = excluded.is_add_on,
        requires_service_id = excluded.requires_service_id,
        is_active           = excluded.is_active,
        sort_order          = excluded.sort_order,
        updated_at          = now()
  returning id into v_interior_service_id;

  -- ---------------------------------------------------------------------
  -- 7. Service plans (One-time, 6-month, 3-month recommended)
  -- ---------------------------------------------------------------------
  insert into public.service_plans
    (business_id, key, name, frequency_months, display_label,
     is_recurring_intent, is_recommended, sort_order, is_active)
  values
    (v_business_id, 'one_time', 'One-Time Clean', null, 'One-Time',
     false, false, 10, true)
  on conflict (business_id, key) do update
    set name                = excluded.name,
        frequency_months    = excluded.frequency_months,
        display_label       = excluded.display_label,
        is_recurring_intent = excluded.is_recurring_intent,
        is_recommended      = excluded.is_recommended,
        sort_order          = excluded.sort_order,
        is_active           = excluded.is_active,
        updated_at          = now()
  returning id into v_plan_one_time_id;

  insert into public.service_plans
    (business_id, key, name, frequency_months, display_label,
     is_recurring_intent, is_recommended, sort_order, is_active)
  values
    (v_business_id, 'six_month', 'Every 6 Months', 6, 'Every 6 Months',
     true, false, 20, true)
  on conflict (business_id, key) do update
    set name                = excluded.name,
        frequency_months    = excluded.frequency_months,
        display_label       = excluded.display_label,
        is_recurring_intent = excluded.is_recurring_intent,
        is_recommended      = excluded.is_recommended,
        sort_order          = excluded.sort_order,
        is_active           = excluded.is_active,
        updated_at          = now()
  returning id into v_plan_six_month_id;

  insert into public.service_plans
    (business_id, key, name, frequency_months, display_label,
     is_recurring_intent, is_recommended, sort_order, is_active)
  values
    (v_business_id, 'three_month', 'Every 3 Months', 3, 'Every 3 Months',
     true, true, 30, true)
  on conflict (business_id, key) do update
    set name                = excluded.name,
        frequency_months    = excluded.frequency_months,
        display_label       = excluded.display_label,
        is_recurring_intent = excluded.is_recurring_intent,
        is_recommended      = excluded.is_recommended,
        sort_order          = excluded.sort_order,
        is_active           = excluded.is_active,
        updated_at          = now()
  returning id into v_plan_three_month_id;

  -- ---------------------------------------------------------------------
  -- 8. Business settings (decision 0001 §1 + Phase 1 copy)
  -- ---------------------------------------------------------------------
  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'quote_expiration_days',
     to_jsonb(30), 'quote',
     'Default quote expiration in days.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'fallback_property_data_missing',
     to_jsonb($txt$We don't have your home in our system yet! Enter your contact information and our team will send you a quote as soon as it's ready.$txt$::text),
     'quote',
     'Shown when RentCast does not return square footage.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'fallback_out_of_service_area',
     to_jsonb($txt$Looks like this address may be outside our current service area. Enter your contact information and our team will let you know if we can help.$txt$::text),
     'quote',
     'Shown when normalized city is outside the seeded service areas.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'customer_quote_trust_points',
     jsonb_build_array(
       'Exterior window cleaning',
       'Free screen cleaning included',
       'Spotless guarantee',
       'Fast turnaround',
       'Owner-operated service',
       'Eco-friendly cleaning'
     ),
     'branding',
     'Trust / value bullet points on the customer quote page.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'customer_quote_scheduling_copy',
     to_jsonb($txt$Choose your cleaning option and request scheduling. We'll follow up to confirm the soonest available time.$txt$::text),
     'branding',
     'Soft scheduling CTA copy on the customer quote page.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  insert into public.business_settings
    (business_id, key, value, category, description, is_system)
  values
    (v_business_id, 'customer_quote_phone_secondary',
     to_jsonb($txt$Prefer to talk? Call us.$txt$::text),
     'branding',
     'Secondary contact CTA shown alongside Schedule My Cleaning.', true)
  on conflict (business_id, key) do update
    set value       = excluded.value,
        category    = excluded.category,
        description = excluded.description,
        is_system   = excluded.is_system,
        updated_at  = now();

  -- ---------------------------------------------------------------------
  -- 9. Price rules (decision 0001 §1)
  -- ---------------------------------------------------------------------
  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'minimum',
     'Minimum quote price',
     'Floor applied to all quote calculations.',
     null, null,
     'minimum',
     jsonb_build_object('min_price', 199, 'currency', 'USD'),
     0, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'base_exterior',
     'Base exterior formula',
     'Base price formula for exterior window cleaning before plan modifier and minimum.',
     v_exterior_service_id, null,
     'formula',
     jsonb_build_object(
       'formula', 'sqft * 0.10',
       'inputs', jsonb_build_array('sqft'),
       'rounding', 'none'
     ),
     10, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'one_time_exterior',
     'One-time exterior',
     'Exterior pricing for the one-time clean plan.',
     v_exterior_service_id, v_plan_one_time_id,
     'formula',
     jsonb_build_object(
       'formula',   'max(base_exterior, 199)',
       'multiplier', 1.0,
       'rounding',  'nearest_dollar'
     ),
     20, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'six_month_exterior',
     'Six-month exterior (per visit)',
     'Exterior pricing per visit on the 6-month recurring plan.',
     v_exterior_service_id, v_plan_six_month_id,
     'formula',
     jsonb_build_object(
       'formula',   'max(base_exterior * 0.90, 199)',
       'multiplier', 0.90,
       'rounding',  'nearest_dollar'
     ),
     30, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'three_month_exterior',
     'Three-month exterior (per visit)',
     'Exterior pricing per visit on the 3-month recurring plan.',
     v_exterior_service_id, v_plan_three_month_id,
     'formula',
     jsonb_build_object(
       'formula',   'max(base_exterior * 0.80, 199)',
       'multiplier', 0.80,
       'rounding',  'nearest_dollar'
     ),
     40, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  insert into public.price_rules
    (business_id, key, name, description, service_id, service_plan_id,
     rule_type, rule_config, priority, is_active)
  values
    (v_business_id, 'interior_add_on',
     'Interior add-on',
     'Interior window cleaning add-on price for the cleaning being scheduled now.',
     v_interior_service_id, null,
     'add_on',
     jsonb_build_object(
       'formula',   'one_time_exterior * 0.50',
       'multiplier', 0.50,
       'rounding',  'nearest_dollar'
     ),
     50, true)
  on conflict (business_id, key) do update
    set name            = excluded.name,
        description     = excluded.description,
        service_id      = excluded.service_id,
        service_plan_id = excluded.service_plan_id,
        rule_type       = excluded.rule_type,
        rule_config     = excluded.rule_config,
        priority        = excluded.priority,
        is_active       = excluded.is_active,
        updated_at      = now();

  -- ---------------------------------------------------------------------
  -- 10. Plugin definitions (with Phase 1 manifests + permission keys)
  -- ---------------------------------------------------------------------
  insert into public.plugin_definitions
    (plugin_key, name, description, current_version, manifest, is_internal)
  values
    ('window_cleaning_auto_quote',
     'Window Cleaning Auto-Quote',
     'Calculates exterior quote options and the interior add-on price using core pricing data.',
     '0.1.0',
     jsonb_build_object(
       'plugin_key', 'window_cleaning_auto_quote',
       'name',       'Window Cleaning Auto-Quote',
       'version',    '0.1.0',
       'permissions', jsonb_build_array(
         'core.pricing.read',
         'core.services.read',
         'core.property_data.read',
         'core.quotes.calculate'
       ),
       'actions', jsonb_build_array(
         jsonb_build_object(
           'action_key',        'window_cleaning_auto_quote.calculate_quote',
           'name',              'Calculate Quote',
           'description',       'Calculates exterior window cleaning quote options.',
           'risk_level',        'low',
           'requires_approval', false
         )
       ),
       'events', jsonb_build_array('auto_quote.quote_generated'),
       'ui_registrations', jsonb_build_array(
         jsonb_build_object(
           'ui_key',         'auto_quote_plugin_detail_analytics',
           'surface_type',   'admin',
           'slot',           'plugin.detail.analytics',
           'component_key',  'WindowCleaningAutoQuoteAnalytics'
         )
       )
     ),
     true)
  on conflict (plugin_key) do update
    set name            = excluded.name,
        description     = excluded.description,
        current_version = excluded.current_version,
        manifest        = excluded.manifest,
        is_internal     = excluded.is_internal,
        updated_at      = now()
  returning id into v_auto_quote_plugin_def_id;

  insert into public.plugin_definitions
    (plugin_key, name, description, current_version, manifest, is_internal)
  values
    ('customer_quote_sales_page',
     'Customer Quote / Sales Page',
     'Renders the public customer quote flow, tracks anonymous interactions, and submits quote requests through controlled core actions.',
     '0.1.0',
     jsonb_build_object(
       'plugin_key', 'customer_quote_sales_page',
       'name',       'Customer Quote / Sales Page',
       'version',    '0.1.0',
       'permissions', jsonb_build_array(
         'core.geo.use',
         'core.property_data.use',
         'plugins.window_cleaning_auto_quote.call',
         'core.contacts.create_from_public_quote',
         'core.properties.create_from_public_quote',
         'core.leads.create_from_public_quote',
         'core.quotes.create_from_public_quote',
         'core.tasks.create',
         'core.events.publish',
         'core.activities.create',
         'core.issues.create',
         'plugin.quote_interactions.write',
         'ui.customer_quote.render',
         'ui.admin_widgets.register'
       ),
       'actions', jsonb_build_array(
         jsonb_build_object(
           'action_key',        'customer_quote_sales_page.submit_quote_request',
           'name',              'Submit Quote Request',
           'description',       'Submits a public customer quote request; creates Contact/Property/Lead/Quote and converts the interaction.',
           'risk_level',        'medium',
           'requires_approval', false
         )
       ),
       'events', jsonb_build_array(
         'quote_app.address_entered',
         'quote_app.contact_submitted',
         'quote_app.schedule_requested'
       ),
       'ui_registrations', jsonb_build_array(
         jsonb_build_object(
           'ui_key',         'customer_quote_render',
           'surface_type',   'customer',
           'slot',           'customer.quote.root',
           'component_key',  'CustomerQuoteFlow'
         ),
         jsonb_build_object(
           'ui_key',         'quote_interactions_widget',
           'surface_type',   'admin',
           'slot',           'admin.dashboard.widgets',
           'component_key',  'QuoteInteractionsWidget'
         ),
         jsonb_build_object(
           'ui_key',         'sales_page_plugin_detail_analytics',
           'surface_type',   'admin',
           'slot',           'plugin.detail.analytics',
           'component_key',  'CustomerQuotePluginAnalytics'
         )
       )
     ),
     true)
  on conflict (plugin_key) do update
    set name            = excluded.name,
        description     = excluded.description,
        current_version = excluded.current_version,
        manifest        = excluded.manifest,
        is_internal     = excluded.is_internal,
        updated_at      = now()
  returning id into v_sales_page_plugin_def_id;

  -- ---------------------------------------------------------------------
  -- 11. Plugin action registrations (one row per declared action)
  -- ---------------------------------------------------------------------
  insert into public.plugin_action_registrations
    (plugin_definition_id, action_key, name, description,
     input_schema, output_schema, risk_level, requires_approval)
  values
    (v_auto_quote_plugin_def_id,
     'window_cleaning_auto_quote.calculate_quote',
     'Calculate Quote',
     'Calculates exterior window cleaning quote options and interior add-on price.',
     jsonb_build_object(
       'type', 'object',
       'required', jsonb_build_array('square_footage'),
       'properties', jsonb_build_object(
         'square_footage', jsonb_build_object('type', 'integer', 'minimum', 1),
         'include_interior_add_on', jsonb_build_object('type', 'boolean')
       )
     ),
     jsonb_build_object(
       'type', 'object',
       'required', jsonb_build_array('options', 'calculation'),
       'properties', jsonb_build_object(
         'options',     jsonb_build_object('type', 'array'),
         'calculation', jsonb_build_object('type', 'object'),
         'warnings',    jsonb_build_object('type', 'array')
       )
     ),
     'low', false)
  on conflict (plugin_definition_id, action_key) do update
    set name             = excluded.name,
        description      = excluded.description,
        input_schema     = excluded.input_schema,
        output_schema    = excluded.output_schema,
        risk_level       = excluded.risk_level,
        requires_approval= excluded.requires_approval;

  insert into public.plugin_action_registrations
    (plugin_definition_id, action_key, name, description,
     input_schema, output_schema, risk_level, requires_approval)
  values
    (v_sales_page_plugin_def_id,
     'customer_quote_sales_page.submit_quote_request',
     'Submit Quote Request',
     'Submits a public customer quote request: creates Contact, Property, Lead, Quote and marks the plugin interaction converted.',
     jsonb_build_object(
       'type', 'object',
       'required', jsonb_build_array('contact', 'interaction'),
       'properties', jsonb_build_object(
         'contact',     jsonb_build_object('type', 'object'),
         'interaction', jsonb_build_object('type', 'object')
       )
     ),
     jsonb_build_object(
       'type', 'object',
       'required', jsonb_build_array('success'),
       'properties', jsonb_build_object(
         'success',     jsonb_build_object('type', 'boolean'),
         'quote_id',    jsonb_build_object('type', 'string'),
         'lead_status', jsonb_build_object('type', 'string')
       )
     ),
     'medium', false)
  on conflict (plugin_definition_id, action_key) do update
    set name             = excluded.name,
        description      = excluded.description,
        input_schema     = excluded.input_schema,
        output_schema    = excluded.output_schema,
        risk_level       = excluded.risk_level,
        requires_approval= excluded.requires_approval;

  -- ---------------------------------------------------------------------
  -- 12. Installed plugins (per-business)
  -- ---------------------------------------------------------------------
  insert into public.installed_plugins
    (business_id, plugin_definition_id, plugin_key, installed_version,
     status, settings)
  values
    (v_business_id, v_auto_quote_plugin_def_id, 'window_cleaning_auto_quote',
     '0.1.0', 'enabled', jsonb_build_object())
  on conflict (business_id, plugin_key) do update
    set plugin_definition_id = excluded.plugin_definition_id,
        installed_version    = excluded.installed_version,
        status               = excluded.status,
        settings             = coalesce(installed_plugins.settings, excluded.settings),
        updated_at           = now()
  returning id into v_auto_quote_installed_id;

  insert into public.installed_plugins
    (business_id, plugin_definition_id, plugin_key, installed_version,
     status, settings)
  values
    (v_business_id, v_sales_page_plugin_def_id, 'customer_quote_sales_page',
     '0.1.0', 'enabled', jsonb_build_object())
  on conflict (business_id, plugin_key) do update
    set plugin_definition_id = excluded.plugin_definition_id,
        installed_version    = excluded.installed_version,
        status               = excluded.status,
        settings             = coalesce(installed_plugins.settings, excluded.settings),
        updated_at           = now()
  returning id into v_sales_page_installed_id;

  -- ---------------------------------------------------------------------
  -- 13. Plugin UI registrations
  -- plugin_ui_registrations has no unique constraint; sync by replacing
  -- the rows owned by each installed_plugin we just upserted.
  -- ---------------------------------------------------------------------
  delete from public.plugin_ui_registrations
   where installed_plugin_id in (v_auto_quote_installed_id, v_sales_page_installed_id);

  insert into public.plugin_ui_registrations
    (business_id, installed_plugin_id, ui_key, surface_type, slot,
     component_key, config, is_enabled)
  values
    (v_business_id, v_auto_quote_installed_id, 'auto_quote_plugin_detail_analytics',
     'admin', 'plugin.detail.analytics', 'WindowCleaningAutoQuoteAnalytics',
     null, true),
    (v_business_id, v_sales_page_installed_id, 'customer_quote_render',
     'customer', 'customer.quote.root', 'CustomerQuoteFlow',
     null, true),
    (v_business_id, v_sales_page_installed_id, 'quote_interactions_widget',
     'admin', 'admin.dashboard.widgets', 'QuoteInteractionsWidget',
     null, true),
    (v_business_id, v_sales_page_installed_id, 'sales_page_plugin_detail_analytics',
     'admin', 'plugin.detail.analytics', 'CustomerQuotePluginAnalytics',
     null, true);

  -- ---------------------------------------------------------------------
  -- 14. Admin user linking (decision 0001 §2)
  -- If SEED_ADMIN_EMAIL matches a Supabase auth user, create/link
  -- user_profile + business_membership + membership_role.
  -- If not, log a clear message telling the operator to sign up first.
  -- ---------------------------------------------------------------------
  if v_seed_admin_email is null or length(trim(v_seed_admin_email)) = 0 then
    raise notice 'SEED_ADMIN_EMAIL is empty in .env.local. Skipping admin user link.';
  else
    select id into v_auth_user_id
      from auth.users
     where lower(email) = lower(v_seed_admin_email)
     limit 1;

    if v_auth_user_id is null then
      raise notice '------------------------------------------------------------';
      raise notice 'SEED_ADMIN_EMAIL "%" was not found in auth.users.', v_seed_admin_email;
      raise notice 'Sign up with this email first:';
      raise notice '  Supabase Dashboard > Authentication > Users > Add user';
      raise notice '  (or sign up via the eventual /login page),';
      raise notice 'then rerun the seed to link the admin to Crystal Bear.';
      raise notice '------------------------------------------------------------';
    else
      -- 14a. user_profiles row keyed to auth.users.id
      insert into public.user_profiles (id, email, display_name)
      values (v_auth_user_id, v_seed_admin_email, null)
      on conflict (id) do update
        set email      = excluded.email,
            updated_at = now();

      -- 14b. business_memberships row (active)
      insert into public.business_memberships
        (business_id, user_id, status, default_role_id, joined_at)
      values
        (v_business_id, v_auth_user_id, 'active', v_business_role_id, now())
      on conflict (business_id, user_id) do update
        set status          = 'active',
            default_role_id = excluded.default_role_id,
            joined_at       = coalesce(business_memberships.joined_at, excluded.joined_at),
            updated_at      = now()
      returning id into v_membership_id;

      -- 14c. membership_roles join row
      insert into public.membership_roles (business_id, membership_id, role_id)
      values (v_business_id, v_membership_id, v_business_role_id)
      on conflict (membership_id, role_id) do nothing;

      raise notice 'Linked admin "%" to Crystal Bear as Owner / Admin.', v_seed_admin_email;
    end if;
  end if;

  raise notice 'Phase 1 seed complete.';
end
$seed$;

commit;
