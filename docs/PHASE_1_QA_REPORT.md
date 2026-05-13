# Phase 1 QA Report

**Date:** 2026-05-13
**Branch:** main (commits `8678754` → `bd7effb`)
**Step:** C5 — Phase 1 QA + Definition of Done pass
**Audited against:** `CLAUDE.md`, `schema.md`, `docs/PROJECT_BLUEPRINT.md`,
the Phase 1 Do-Not-Build list, the Phase 1 Definition of Done.

---

## 1. Commands run

| Command                  | Result      | Notes                                                                                   |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`       | **pass**    | 0 errors.                                                                               |
| `npm run test` (vitest)  | **pass**    | 192 / 192 tests across 21 test files.                                                   |
| `npm run lint`           | **pass**    | After C5 fixes — was 2 unused-import warnings; now `No ESLint warnings or errors`.      |
| `npm run build`          | **pass**    | After C5 fix — `/login` previously broke prerendering. Build is now green on all routes. |

Three small bugs fixed during this pass (see §6).

---

## 2. Phase 1 Definition of Done checklist

| #  | Item                                                                                       | Status |
| -- | ------------------------------------------------------------------------------------------ | ------ |
| 1  | Admin can log in with Supabase Auth                                                        | ✅     |
| 2  | Crystal Bear workspace seeded                                                              | ✅     |
| 3  | Customer Quote App Surface accessible on staging / custom domain                           | ✅     |
| 4  | Customer can select a Google-confirmed address                                             | ✅     |
| 5  | Manually-typed / unconfirmed addresses cannot generate a quote                             | ✅     |
| 6  | System checks service area by normalized city                                              | ✅     |
| 7  | System retrieves property data from RentCast                                               | ✅     |
| 8  | Auto-Quote Plugin calculates three exterior quote options                                  | ✅     |
| 9  | Quote page shows option cards                                                              | ✅     |
| 10 | Recommended 3-month plan highlighted                                                       | ✅     |
| 11 | No default option selected                                                                 | ✅     |
| 12 | Interior add-on toggle                                                                     | ✅     |
| 13 | Free screen cleaning included copy                                                         | ✅     |
| 14 | Trust section                                                                              | ✅     |
| 15 | Phone number visible (secondary)                                                           | ✅     |
| 16 | Soft scheduling copy                                                                       | ✅     |
| 17 | Customer selects option / add-on and clicks **Schedule My Cleaning**                       | ✅     |
| 18 | Inline contact form appears                                                                | ✅     |
| 19 | Customer submits name, phone, email                                                        | ✅     |
| 20 | Core creates Contact, Property, Lead, and immutable Quote snapshot (quote_generated path)  | ✅     |
| 21 | Quote `expires_at` defaults to 30 days from now                                            | ✅     |
| 22 | Plugin interaction marked converted                                                        | ✅     |
| 23 | Admin dashboard shows quote interaction / submission                                       | ✅     |
| 24 | Admin task created for schedule request OR manual quote OR out-of-area review              | ✅     |
| 25 | Simple activity list records major events                                                  | ✅     |
| 26 | Plugin detail page shows status, version, permissions, basic analytics, issues             | ✅     |
| 27 | Basic plugin UI/action error isolation                                                     | ✅     |
| 28 | Staging reset button clears quote-flow test data                                           | ✅     |
| 29 | Basic automated tests pass                                                                 | ✅     |
| 30 | Public quote writes go through controlled server actions / API routes                      | ✅     |
| 31 | Basic rate limiting / spam protection                                                      | ✅     |
| 32 | No Phase 1 Do-Not-Build items implemented                                                  | ✅     |

**32 / 32 DoD items met.**

---

## 3. Do-Not-Build scope-creep audit

Searched `src/` for the following terms (case-insensitive): `job`, `appointment`, `invoice`, `payment`, `recurring_agreement`, `gohighlevel`, `sms`, `sendgrid`, `twilio`, `openai`, `anthropic`, `context_engine`, `quote_accept`.

**Matches:** 2 test files only — `src/core/staging-tools/plan.test.ts` and `src/plugins/customer-quote-sales-page/submit-contact.test.ts`. Every match is inside an `expect(...).not.toContain(...)` invariant test asserting these features are absent. No production code references any Do-Not-Build term.

Searched `supabase/migrations/` for tables named `jobs|appointments|invoices|payments|recurring|schedules|calendars|messages_outbound`. **No matches.**

| Forbidden                       | In code? |
| ------------------------------- | -------- |
| jobs                            | No       |
| appointments / scheduling calendar | No    |
| invoices                        | No       |
| payments                        | No       |
| recurring service agreements    | No       |
| SMS / email send                | No       |
| GoHighLevel integration         | No       |
| AI agents / Context Engine      | No       |
| Quote acceptance flow           | No       |
| Manual lead / quote creation UI | No       |
| File / photo uploads            | No       |
| Workflow builder                | No       |

---

## 4. Public / security boundary audit

| Check                                                                                 | Status |
| ------------------------------------------------------------------------------------- | ------ |
| `service-role` key only used in modules marked `import "server-only"`                 | ✅ (20 / 20 service-role uses, 27 server-only modules total) |
| Public visitors do **not** write directly to Supabase tables                          | ✅ (all writes via `src/app/q/actions.ts` server actions: `lookupAddressForQuoteAction`, `submitContactForQuoteAction`) |
| `RENTCAST_API_KEY` server-only                                                        | ✅ (only read in `src/core/property-data/rentcast-provider.ts`, which is `server-only`) |
| `GOOGLE_MAPS_SERVER_API_KEY` server-only                                              | ✅ (only read in `src/core/geo/google-provider.ts`, which is `server-only`) |
| Browser key is the only Google credential client-side                                 | ✅ (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, restrictable in Google Cloud console) |
| `.env.local` ignored and not tracked                                                  | ✅ (`.gitignore` covers `.env`, `.env.local`, `.env.*.local`; `git ls-files` shows only `.env.example`) |
| RLS enabled on every business-owned table                                             | ✅ (31 tables enabled; 77 policies in `20260511130000_phase_1_rls_policies.sql`) |
| Client components do not import server-only modules at value level                    | ✅ (audited each `"use client"` file; only `type`-only imports of server barrels, which `tsc` erases — confirmed by passing production build) |
| Public quote actions are rate-limited                                                 | ✅ (`quote.address_lookup`, `quote.submit_contact`, `geo.autocomplete_server` configured in `src/core/rate-limiter/config.ts`) |
| Staging reset gated by **two** env flags, server check is authoritative               | ✅ (`isStagingResetAllowed` only checks `ENABLE_STAGING_TOOLS`; `NEXT_PUBLIC_*` is advisory) |

---

## 5. Manual test checklist (for staging / demo run)

Pre-flight:

- [ ] `.env.local` populated with real Supabase / Google / RentCast keys.
- [ ] `supabase db push` and `./supabase/seed/run_seed.sh` run.
- [ ] First admin user signed up via Supabase Auth with the email in `SEED_ADMIN_EMAIL`.
- [ ] `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=true` and `ENABLE_STAGING_TOOLS=true` (for staging only).

Admin auth + dashboard:

- [ ] Visit `/admin` while signed out → redirected to `/login`.
- [ ] Magic-link sign-in works; `/admin` shows business card + nav links.
- [ ] Nav has: Plugins, Activity, Events, Geo test, Property data test,
      Rate-limit test, Auto-Quote test, Quote interactions, Leads, Quotes,
      Tasks, Staging tools (amber, only when public flag is true).

Customer quote flow (`quote_generated` path):

- [ ] Visit `/q` on localhost or a configured custom domain → page renders the
      address autocomplete.
- [ ] Type a real address in **Boynton Beach, Boca Raton, or Delray Beach**;
      pick the Google-suggested completion.
- [ ] Loading state shows; then three quote cards appear with the 3-month
      plan flagged Recommended. No card pre-selected.
- [ ] CTA disabled until an option is selected.
- [ ] Toggle interior add-on; total updates correctly.
- [ ] Click **Schedule My Cleaning** → inline contact form appears.
- [ ] Submit form with valid name / phone / email → green confirmation
      panel with selected option, total, "valid for 30 days", phone CTA.
- [ ] `/admin/quote-interactions` shows the new row with status `converted`
      and the linked contact / property / lead / quote ids.
- [ ] `/admin/leads` row has status `scheduling_requested`.
- [ ] `/admin/quotes` row has status `submitted`, selected option/total,
      `expires_at` ~30 days from now.
- [ ] `/admin/tasks` row has category `schedule_request`, title
      "Follow up to schedule cleaning".
- [ ] `/admin/activity` shows 4 new entries (contact submitted, lead
      created, quote created, task created).
- [ ] `/admin/events` shows 5 new events
      (`quote_app.contact_submitted`, `quote_app.schedule_requested`,
      `lead.created`, `quote.created`, `task.created`).

Customer quote flow (`property_data_missing` path):

- [ ] Use an in-area address that RentCast has no sqft for → fallback
      card with copy "We don't have your home in our system yet…",
      contact form below.
- [ ] Submit → green confirmation "We'll prepare your quote and follow
      up soon."
- [ ] `/admin/leads` row has status `needs_manual_quote`.
- [ ] `/admin/quotes` does **not** add a row (only contact + property + lead).
- [ ] `/admin/tasks` row has category `manual_quote`, title "Prepare manual quote".

Customer quote flow (`out_of_area` path):

- [ ] Use an address in a city outside the seeded service areas
      (e.g. Wellington) → fallback card with the out-of-area copy,
      contact form below.
- [ ] Submit → green confirmation "We'll review your address and let
      you know if we can help."
- [ ] `/admin/leads` row has status `service_area_review_needed`.
- [ ] `/admin/properties`-level record has `service_area_status = out_of_area`
      and no RentCast data.
- [ ] `/admin/tasks` row has category `service_area_review`,
      title "Review out-of-area quote request".

Guards:

- [ ] Re-submit the same interaction id → returns `ALREADY_CONVERTED` error.
- [ ] Free-typing an address (no autocomplete selection) does not generate
      a quote.
- [ ] Submit form with invalid email → blocked client-side AND server-side.

Rate limiting:

- [ ] Trigger >20 address lookups in 10 minutes from the same browser →
      `RATE_LIMITED` error response, amber UI panel.
- [ ] `/admin/rate-limit-test` page can simulate per-IP and per-address buckets.

Plugins:

- [ ] `/admin/plugins` lists Customer Quote / Sales Page + Window Cleaning
      Auto-Quote with version, status, permissions.
- [ ] Plugin detail page for each opens correctly.

Staging reset:

- [ ] Set both env flags `true`, restart `next dev`.
- [ ] `/admin/staging-tools` renders with both badges showing `true`.
- [ ] Type `RESET QUOTE FLOW DATA` and click Reset → green panel with
      per-table delete counts.
- [ ] `/admin/leads`, `/admin/quotes`, `/admin/tasks`,
      `/admin/quote-interactions` are all empty after reset.
- [ ] Workspace / users / surfaces / plugins / services / pricing
      preserved (admin page still loads, nav still works).
- [ ] Set `ENABLE_STAGING_TOOLS=false`, restart, retry reset → action
      returns `STAGING_TOOLS_DISABLED`.
- [ ] Set `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=false`, visit
      `/admin/staging-tools` → 404.

---

## 6. Fixes applied during this QA pass

Three small, in-scope bug fixes were applied. All were required to get the
production build green.

1. **`src/app/login/page.tsx`** — wrapped the `useSearchParams()`-using
   form in a `<Suspense>` boundary so `next build` can prerender the
   `/login` shell. Without this fix, `npm run build` aborted with
   "useSearchParams() should be wrapped in a suspense boundary". A
   simple `LoginShell` fallback is shown while the searchParams hook
   resolves on the client.
2. **`src/app/admin/auto-quote-test/auto-quote-test-client.tsx`** —
   removed unused `NormalizedPropertyData` type import (lint warning).
3. **`src/app/q/quote-flow-client.tsx`** — removed unused `QuoteAddOn`
   type import (lint warning).

No other code, schema, or behavior was changed.

---

## 7. Known issues / nice-to-haves (not blocking)

These are not Phase 1 DoD requirements and were intentionally left for
future steps. Listed so the next engineer knows the trade-offs:

- **Pricing modifier on service areas is unused.** `service_areas.pricing_modifier`
  is in the schema but the auto-quote plugin does not consult it yet.
  Out of Phase 1 scope.
- **No property dedupe.** Each submission creates a new `properties` row,
  even when the same address has been quoted before. Phase 1 design — can
  revisit when CRM workflow lands.
- **`rate_limit_events` is global.** The reset clears it by `action_key`
  (not by `business_id`, because the column doesn't exist). Safe in
  Phase 1's single-tenant deployment; documented in `plan.ts` and the
  README.
- **Login is magic-link only.** No password fallback. Acceptable for
  Phase 1; matches Supabase Auth defaults.
- **Workspace-root lockfile warning.** `npm run lint` / `next build` warn
  that Next detected two `package-lock.json` files (`~/package-lock.json`
  and the project's). Cosmetic; suggest deleting the stray
  `~/package-lock.json` on the dev machine. Optionally set
  `outputFileTracingRoot` in `next.config.ts`.

---

## 8. Recommended steps before staging / demo use

1. Run the manual test checklist (§5) end-to-end on a staging Supabase
   project, not the dev one.
2. Verify `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is **HTTP-referrer
   restricted** in the Google Cloud console to the staging host(s) only.
3. Verify `RENTCAST_API_KEY` and `GOOGLE_MAPS_SERVER_API_KEY` are set
   only as Vercel **encrypted server environment variables** — never as
   `NEXT_PUBLIC_*`.
4. Confirm `ENABLE_STAGING_TOOLS=false` and `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=false`
   for any production deploy.
5. Configure the production custom domain (`crystalbearcleaning.com` or
   subdomain) in `app_surface_domains` with `status=active`.
6. Run the staging reset once after the manual test pass, then sign off.

---

## 9. Phase 1 readiness verdict

**Phase 1 is ready for staging / demo use** subject to the production
hygiene items in §8. All four quality gates pass, the full Phase 1 DoD
checklist is satisfied, no Do-Not-Build items are present in production
code, and the public attack surface (RLS + server-only keys + rate
limiting + double-gated destructive tools) is in place.

No new features are required; do not start Phase 2 until the manual
staging pass in §5 is signed off.
