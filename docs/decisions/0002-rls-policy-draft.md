# 0002 — RLS Policy Draft (Phase 1)

Status: Draft — awaiting review
Date: 2026-05-11
Supersedes: none
Related: decision 0001 §11

## Purpose

This document drafts the Row Level Security (RLS) policies for the Phase 1
schema before any policy is applied to the database. The migration
`20260511120000_phase_1_schema.sql` enables RLS on every business-owned
table but **does not** add any policies. With RLS enabled and no policies
in place, all access through the `anon` and `authenticated` Supabase roles
is denied by default. The `service_role` bypasses RLS as usual.

Phase 1 RLS goals:

1. Authenticated members can read/write records for businesses where they
   have an active membership.
2. Public (`anon`) visitors cannot read or write business tables directly.
3. Public quote submissions reach the database only through server actions
   that use the `service_role` key.
4. Cross-business reads are impossible from `anon` or `authenticated`.

Phase 1 explicitly avoids:

- Capability-based row filtering (`scope = 'assigned_to_me'` etc.) — those
  rules will be enforced at the action layer in Phase 1.
- Note `visibility` enforcement at the RLS layer beyond a single
  "all members can read" rule — the four visibility modes will be enforced
  in app code initially.
- Role-app-surface enforcement at the RLS layer — that gating is handled
  by route guards.

These can be tightened later. RLS in Phase 1 is the safety floor, not the
permission model.

---

## Roles and Conventions

Three Supabase roles matter:

| Role | RLS behavior |
|---|---|
| `anon` | Subject to RLS. No policies in Phase 1 → effectively no access. |
| `authenticated` | Subject to RLS. Member-of-business policies apply. |
| `service_role` | Bypasses RLS. Used by server actions and seed scripts. |

All Phase 1 policies are written for `authenticated`. Public quote writes
hit the database via server actions running under `service_role`.

---

## Shared Helper Function

A single `SECURITY DEFINER` function answers the question "is the current
auth user an active member of this business?"

```sql
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
```

Notes:

- `SECURITY DEFINER` is required so the function can read
  `business_memberships` even though that table has RLS enabled.
- `set search_path = public` prevents search-path attacks.
- The function is marked `stable` so the planner can hoist it.

---

## Policy Patterns

The bulk of Phase 1 tables use one of three patterns.

### Pattern A — standard business-scoped table

For tables that have a `business_id` column and no special access rules:

```sql
create policy "<table>_members_select"
  on public.<table>
  for select
  to authenticated
  using (public.is_business_member(business_id));

create policy "<table>_members_insert"
  on public.<table>
  for insert
  to authenticated
  with check (public.is_business_member(business_id));

create policy "<table>_members_update"
  on public.<table>
  for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "<table>_members_delete"
  on public.<table>
  for delete
  to authenticated
  using (public.is_business_member(business_id));
```

Applies to:

- `business_roles`, `membership_roles`, `role_permissions`,
  `user_permission_overrides`
- `app_surfaces`, `role_app_surface_access`, `user_app_surface_overrides`,
  `app_surface_domains`
- `installed_plugins`, `plugin_ui_registrations`
- `business_settings`, `service_areas`, `services`, `service_plans`,
  `price_rules`
- `tasks`, `events`, `activities`, `issues`, `notes`, `record_links`
- `conversations`, `messages`

Phase 1 reality check: the `events`, `activities`, `tasks`, and quote-side
tables are written by server actions running under `service_role`, so the
INSERT/UPDATE/DELETE policies above are mostly defensive. Admin users
reading these tables via `authenticated` use the SELECT policy.

### Pattern B — read-only for members; writes via service role only

For tables that hold customer-facing flow data. Members read in the admin
dashboard; public writes go through server actions (service role).

```sql
create policy "<table>_members_select"
  on public.<table>
  for select
  to authenticated
  using (public.is_business_member(business_id));

-- No INSERT/UPDATE/DELETE policies for authenticated.
-- service_role bypasses RLS and handles all writes from server actions.
```

Applies to:

- `contacts`, `properties`, `leads`, `quotes`, `quote_page_interactions`

Rationale: in Phase 1, no admin-side UI creates these records manually;
they only come from the public quote flow. Tightening the policies now
prevents accidental hand-edits from a logged-in admin during testing. The
staging reset button runs under `service_role` and is unaffected.

If admin-side edits become necessary later, add the matching write
policies under Pattern A.

### Pattern C — the `businesses` table itself

The `businesses` row is identified by `id`, not `business_id`.

```sql
create policy "businesses_members_select"
  on public.businesses
  for select
  to authenticated
  using (public.is_business_member(id));

create policy "businesses_members_update"
  on public.businesses
  for update
  to authenticated
  using (public.is_business_member(id))
  with check (public.is_business_member(id));

-- INSERT and DELETE for businesses are service_role only in Phase 1
-- (seed script creates Crystal Bear; no admin self-serve onboarding).
```

---

## Special Cases

### `business_memberships`

Users need to see their own memberships even before they are recognized as
"a member" of any specific business in the helper function (chicken/egg).

```sql
create policy "business_memberships_self_select"
  on public.business_memberships
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "business_memberships_members_select"
  on public.business_memberships
  for select
  to authenticated
  using (public.is_business_member(business_id));

-- Writes to business_memberships are service_role only in Phase 1.
```

Two SELECT policies are OR-combined by Postgres, so a user can see (a)
their own membership rows, and (b) any membership rows within a business
they are a member of (so admins see their colleagues).

### `notes` visibility

Phase 1 enforces visibility only at the "is in the business" level. The
four visibility modes (`all_internal`, `admin_only`, `role_specific`,
`private_to_author`) are enforced in app code for now. Pattern A applies.

Phase 2 candidate (not applied yet):

```sql
-- Future: layer visibility into the SELECT policy.
-- create policy "notes_visibility_select"
--   on public.notes
--   for select
--   to authenticated
--   using (
--     public.is_business_member(business_id)
--     and (
--       visibility = 'all_internal'
--       or (visibility = 'private_to_author' and author_user_id = auth.uid())
--       or (visibility = 'admin_only' and public.has_capability(business_id, 'notes.read_admin'))
--     )
--   );
```

### `data_dictionary_fields`

This table mixes business-scoped rows with global rows (`business_id IS NULL`).

```sql
create policy "data_dictionary_business_select"
  on public.data_dictionary_fields
  for select
  to authenticated
  using (
    business_id is null
    or public.is_business_member(business_id)
  );

-- Writes are service_role only in Phase 1.
```

Global field definitions are platform metadata; any authenticated user can
read them. Only the service role can write.

### Soft references

`leads.quote_page_interaction_id` and `quotes.quote_page_interaction_id`
have no FK constraint (decision 0001 §8). RLS treats those columns like
any other UUID. The matching row in `quote_page_interactions` is gated by
its own `business_id` policy, so soft references cannot leak data across
businesses.

---

## Tables Where RLS Is Already Enabled (from the migration)

The migration enabled RLS on these tables. Each needs at least one Phase 1
policy from the patterns above before authenticated users can access them
at all. Until policies are applied, the admin UI will see zero rows for
every business-owned table — that is the expected pre-policy state.

```
businesses
business_memberships
business_roles
membership_roles
role_permissions
user_permission_overrides
app_surfaces
role_app_surface_access
user_app_surface_overrides
app_surface_domains
installed_plugins
plugin_ui_registrations
data_dictionary_fields
business_settings
service_areas
services
service_plans
price_rules
contacts
properties
leads
quotes
quote_page_interactions
tasks
events
activities
notes
issues
conversations
messages
record_links
```

---

## Tables Where RLS Was NOT Enabled in the Migration

Seven global/system tables were intentionally left without RLS in Part 1.
Each needs a deliberate decision before Phase 1 ships. Proposed approach:

| Table | Proposed Phase 1 stance |
|---|---|
| `user_profiles` | Enable RLS. Allow user to read own row; allow members to read profiles of fellow business members. Writes via service role. |
| `role_blueprints` | Enable RLS. Authenticated SELECT only. No writes from authenticated. |
| `app_surface_blueprints` | Same as `role_blueprints`. |
| `plugin_definitions` | Same. Authenticated read-only; service role writes. |
| `plugin_action_registrations` | Same. |
| `event_types` | Same. |
| `rate_limit_events` | Enable RLS with **no** policies. Only `service_role` should ever read or write this table. |

Proposed SQL for these:

```sql
-- user_profiles
alter table public.user_profiles enable row level security;

create policy "user_profiles_self_select"
  on public.user_profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "user_profiles_fellow_members_select"
  on public.user_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.business_memberships me
      join public.business_memberships them
        on me.business_id = them.business_id
      where me.user_id = auth.uid()
        and them.user_id = public.user_profiles.id
        and me.status = 'active'
        and them.status = 'active'
    )
  );

-- Reference tables (read-only for authenticated)
alter table public.role_blueprints enable row level security;
create policy "role_blueprints_authenticated_select"
  on public.role_blueprints for select to authenticated using (true);

alter table public.app_surface_blueprints enable row level security;
create policy "app_surface_blueprints_authenticated_select"
  on public.app_surface_blueprints for select to authenticated using (true);

alter table public.plugin_definitions enable row level security;
create policy "plugin_definitions_authenticated_select"
  on public.plugin_definitions for select to authenticated using (true);

alter table public.plugin_action_registrations enable row level security;
create policy "plugin_action_registrations_authenticated_select"
  on public.plugin_action_registrations for select to authenticated using (true);

alter table public.event_types enable row level security;
create policy "event_types_authenticated_select"
  on public.event_types for select to authenticated using (true);

-- rate_limit_events: enabled with NO policies. service_role only.
alter table public.rate_limit_events enable row level security;
```

---

## Application Migration Plan

When approved, the policies will land in a single follow-up migration named
`<timestamp>_phase_1_rls_policies.sql`. Sequence:

1. Create the `is_business_member(uuid)` helper function.
2. Apply Pattern A policies to standard business-scoped tables.
3. Apply Pattern B policies to customer-flow tables.
4. Apply Pattern C policies to `businesses`.
5. Apply special-case policies to `business_memberships` and
   `data_dictionary_fields`.
6. Enable RLS on the seven global tables and apply their policies (or
   intentional no-policy lockdown for `rate_limit_events`).
7. Run a smoke test from a fresh `authenticated` session against a
   non-member business and confirm zero rows are returned.

The migration will be idempotent (using `create policy if not exists` is
not supported — instead the migration drops each policy by name first).

---

## Open Questions for the Reviewer

1. Confirm Pattern B (read-only for `contacts`, `properties`, `leads`,
   `quotes`, `quote_page_interactions`) is acceptable for Phase 1.
2. Confirm `notes` should use Pattern A in Phase 1 with visibility
   enforced in app code only.
3. Confirm the seven global tables should be handled as proposed (Phase 1
   enables RLS on all of them; only `rate_limit_events` is service-role only).
4. Confirm the `is_business_member` helper should be `SECURITY DEFINER`
   with locked `search_path`.

Awaiting approval before writing the policy migration file.
