-- Phase 1 verification queries (run-once, do not commit results).
-- Pair with: 20260511120000_phase_1_schema.sql + 20260511130000_phase_1_rls_policies.sql
-- Safe to run repeatedly; SELECT only.

\echo '=== 1. Migrations applied ==='
select version, name
from supabase_migrations.schema_migrations
order by version;

\echo
\echo '=== 2. Public table count ==='
select count(*) as total_public_tables
from pg_tables
where schemaname = 'public';

\echo
\echo '=== 3. RLS coverage ==='
select count(*) filter (where rowsecurity)        as tables_with_rls,
       count(*) filter (where not rowsecurity)    as tables_without_rls
from pg_tables
where schemaname = 'public';

\echo 'Tables without RLS (should be empty):'
select tablename
from pg_tables
where schemaname = 'public' and rowsecurity = false
order by tablename;

\echo
\echo '=== 4. rate_limit_events policy count (expect 0) ==='
select count(*) as rate_limit_events_policy_count
from pg_policies
where schemaname = 'public' and tablename = 'rate_limit_events';

\echo
\echo '=== 5. is_business_member helper ==='
select proname,
       pg_get_function_arguments(oid)  as args,
       prosecdef                        as security_definer,
       provolatile                      as volatility
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'is_business_member';

\echo
\echo '=== 6. Total policies in public (expect 77) ==='
select count(*) as total_policies
from pg_policies
where schemaname = 'public';

\echo 'Per-table policy count:'
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
