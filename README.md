# Home Service Operating Platform

Modular operating platform for home service businesses. Phase 1 proves the
architecture through one narrow vertical slice: a public Customer Quote app
surface that takes a Google-confirmed address, looks up property data,
calculates a quote, captures contact info, and produces core Contact,
Property, Lead, and Quote records visible in an Admin review dashboard.

Crystal Bear Window Cleaning is the first seeded workspace.

The authoritative scope documents are:

- `CLAUDE.md` — build rules and Phase 1 Do Not Build list
- `schema.md` — Phase 1 data model
- `docs/PROJECT_BLUEPRINT.md` — master project blueprint
- `docs/decisions/` — recorded decisions

Read those before extending the platform.

---

## Status

This is the **Step A1 scaffold**. The repo structure, tooling, and
documentation are in place. No business logic, Supabase migrations, plugin
code, or quote flow has been implemented yet.

---

## Tech Stack

- Next.js App Router (TypeScript)
- Supabase (Postgres, Auth, RLS)
- Tailwind CSS + shadcn/ui
- Vercel (deploy target)
- Google Places / Geocoding API
- RentCast API
- Vitest for tests

---

## Setup

Requires Node.js 20+.

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in values
cp .env.example .env.local

# 3. Run the dev server
npm run dev
```

Useful scripts:

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest watch
npm run format       # prettier --write .
```

---

## Environment Variables

All env keys are documented in `.env.example`. Summary:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

### Google Places / Geocoding
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (must be domain-restricted)
- `GOOGLE_MAPS_SERVER_API_KEY` (server-side only)

### RentCast
- `RENTCAST_API_KEY` (server-side only — never exposed to the browser)

### Seed / bootstrap
- `SEED_ADMIN_EMAIL` — first admin's email. The user must sign up via
  Supabase Auth first; the seed script then links them as Owner/Admin
  for Crystal Bear.

### Default domain resolution
- `DEFAULT_BUSINESS_SLUG` (default: `crystal-bear`)
- `DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG` (default: `quote`)

Production custom domains resolve through `app_surface_domains.domain`.
Localhost and Vercel preview hosts fall back to these defaults.

### Staging tools
- `NEXT_PUBLIC_ENABLE_STAGING_TOOLS` (default: `false`)
- `ENABLE_STAGING_TOOLS` (default: `false`)

See the warning below before flipping these on.

Rules:

- Never commit `.env` or `.env.local`.
- The Google browser key must be restricted to the customer-facing
  domains in the Google Cloud console.
- The RentCast key must never appear in client-side bundles.

---

## Project Structure

```
/src
  /app                      Next.js App Router entry
  /core                     Stable shared infrastructure
    /auth
    /business
    /permissions
    /app-surfaces
    /plugin-registry
    /action-registry
    /ui-registry
    /events
    /activity
    /geo                    Google geo provider abstraction
    /property-data          RentCast property data provider abstraction
    /pricing
    /contacts
    /properties
    /leads
    /quotes
    /tasks
    /issues
    /notes
  /plugins
    /window-cleaning-auto-quote
    /customer-quote-sales-page
  /components               Shared UI components
  /lib                      Cross-cutting utilities
/supabase
  /migrations               Postgres schema migrations
  /seed                     Seed scripts
/docs
  /decisions                Recorded architectural decisions
```

Plugins live inside `/src/plugins` for Phase 1 but should be written so
they could be extracted into separate packages later. Plugins must
communicate with core through the action registry, event bus, and UI
registry — not by importing core modules directly when avoidable.

---

## App Surface Resolution

Customer-facing routes (e.g. `/q`) resolve **which business and which app
surface** to serve based on the inbound request host. Admin routes
(`/admin`) keep using the logged-in user's active business membership and
do not participate in host-based resolution.

### Resolution order

For a public request to a customer-facing route, the server runs the
following in `src/core/app-surfaces/resolve.ts`:

1. **Domain mapping (production).** Look up `app_surface_domains.domain`
   for the request host, filtered to `status = 'active'`. If found, use
   the `business` and `app_surface` that row points to.
2. **Env fallback (dev / preview).** If no active mapping exists **and**
   the host is `localhost` / `127.0.0.1` / `::1` / `*.vercel.app` (or the
   host header is missing), fall back to:
   - `DEFAULT_BUSINESS_SLUG` (default: `crystal-bear`)
   - `DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG` (default: `quote`)
   The resolver finds the business by slug and the app surface by
   `(business_id, slug)`.
3. **Unknown host.** Any other host with no active domain mapping returns
   `null` and the page renders a clear "Surface not found" state.

The resolver runs server-side and reads `businesses`, `app_surfaces`, and
`app_surface_domains` through the Supabase **service-role key**, which
bypasses RLS. The service-role client lives in
`src/core/auth/service-role.ts` and is marked `import "server-only"` so it
will never leak into a client bundle.

### Env vars used for fallback

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_BUSINESS_SLUG` | `crystal-bear` | Business to resolve to when no domain mapping matches. |
| `DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG` | `quote` | App surface slug to look up under that business. |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Used by the service-role client. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Used by the service-role client (server-only). |

Domain mapping does **not** read any env var — it is fully data-driven
via `app_surface_domains`. The env fallback is only used when no mapping
is present and the host looks like a dev/preview host.

### Testing `/q` locally

1. Run the dev server: `npm run dev`
2. Open http://localhost:3000/q
3. The page renders the Customer Quote App Surface placeholder with:
   - `Crystal Bear Window Cleaning` as the business name
   - `Crystal Bear Customer Quote` as the surface name
   - `customer` as the surface type
   - `Resolved via: Env fallback (localhost)`
   - The request `host` value (e.g. `localhost:3000`)

If a domain mapping has been added to `app_surface_domains` for a custom
hostname pointing at the dev server, that mapping wins over the env
fallback even on localhost.

### Adding a production domain mapping

```sql
insert into public.app_surface_domains
  (business_id, app_surface_id, domain, domain_type, status, is_primary)
values
  ((select id from public.businesses where slug = 'crystal-bear'),
   (select id from public.app_surfaces
      where business_id = (select id from public.businesses where slug = 'crystal-bear')
        and slug = 'quote'),
   'quote.crystalbear.com', 'custom_domain', 'active', true);
```

Production hosts that do **not** have an active row in
`app_surface_domains` will return "Surface not found" — there is no
implicit fallback to the seeded defaults on production hostnames.

---

## Plugin Registry

The plugin registry runtime lives in `src/core/plugin-registry/`. It loads
installed plugins for a business along with their definitions, manifests,
permissions, action declarations, and UI registrations.

### How loading works

Three public functions in `src/core/plugin-registry/registry.ts`:

| Function | Returns | Purpose |
|---|---|---|
| `listInstalledPluginsForBusiness(businessId)` | `AdminPluginRecord[]` | Every installed plugin, including disabled / error / malformed-manifest / missing-definition rows. Used by the admin Plugins page. |
| `getInstalledPluginRecord(businessId, pluginKey)` | `AdminPluginRecord \| null` | Single installed plugin by key. |
| `loadEnabledPluginsForBusiness(businessId)` | `PluginRegistry` | Runtime view: only `status = enabled` plugins that loaded successfully, plus a separate `errors[]` array for everything else. |

Internally, the loader:

1. Fetches `installed_plugins` for the business.
2. Fetches the matching `plugin_definitions`, `plugin_action_registrations`,
   and `plugin_ui_registrations` (the latter two scoped to the discovered
   plugin definition IDs).
3. Parses each `plugin_definitions.manifest` jsonb via a Zod schema
   (`src/core/plugin-registry/manifest.ts`). Malformed manifests degrade
   to a `loadStatus: 'malformed_manifest'` admin record with the Zod
   error message attached — the page does not crash.
4. Sorts and returns.

The loader uses the user-context Supabase client and respects RLS — the
calling user must be an active member of the business.

### Plugin load states

`AdminPluginRecord.loadStatus`:

- `ok` — plugin enabled, definition found, manifest parsed successfully.
- `disabled` — `installed_plugins.status = 'disabled'`. Visually distinct
  on the admin Plugins page.
- `error` — `installed_plugins.status = 'error'`.
- `malformed_manifest` — manifest jsonb didn't validate against the Zod
  schema. The amber-bordered card surfaces the Zod error message.
- `missing_definition` — the linked `plugin_definitions` row was deleted.
  Surfaces as an amber-bordered card too.

`loadEnabledPluginsForBusiness` only returns plugins with `loadStatus =
'ok'` AND `installed.status = 'enabled'`. Everything else lands in the
registry's `errors[]` array for later surfacing (e.g. issues, admin
banner).

### Testing `/admin/plugins`

1. `npm run dev`
2. Sign in (B1 magic-link flow).
3. From the admin landing page, click **View installed plugins →** (or go
   to http://localhost:3000/admin/plugins directly).
4. Expect to see two cards, both with the green `ok` badge:
   - **Customer Quote / Sales Page** (`customer_quote_sales_page`,
     v0.1.0): 14 perm · 1 action · 3 ui · 3 event
   - **Window Cleaning Auto-Quote** (`window_cleaning_auto_quote`,
     v0.1.0): 4 perm · 1 action · 1 ui · 1 event
5. Click a card to open the plugin detail page.

To verify the malformed-manifest path without writing code, you can
temporarily corrupt the manifest in the database:

```sql
update public.plugin_definitions
   set manifest = '{"invalid": true}'::jsonb
 where plugin_key = 'window_cleaning_auto_quote';
```

Refresh `/admin/plugins` — the card should now show an amber-bordered
`MALFORMED MANIFEST` state. Re-run the seed (`./supabase/seed/run_seed.sh`)
to restore the original manifest when done.

### Testing plugin detail pages

After landing on `/admin/plugins`, click either card:

- `/admin/plugins/customer_quote_sales_page` shows the full 14 permission
  keys, the `submit_quote_request` action (medium risk), three UI
  registrations (customer + admin slots), plus two placeholder panels
  ("Analytics widgets will be added later" / "Issues will be added
  later").
- `/admin/plugins/window_cleaning_auto_quote` shows the 4 permission keys,
  the `calculate_quote` action (low risk), one admin UI registration, and
  the same two placeholder panels.

A nonexistent key (e.g. `/admin/plugins/does-not-exist`) renders a clean
"Plugin not found" state.

### What is intentionally not built yet

- No enable / disable / uninstall controls.
- No plugin settings editor.
- No plugin update / version-check flow.
- No public plugin marketplace.
- No action execution — `plugin_action_registrations` is metadata only;
  no action registry runtime exists yet.
- No event bus, activity logger, or task creation tied to plugin events.
- No automatic `issues` row creation on plugin load errors; load errors
  show inline in the admin UI for now.
- No customer-facing plugin runtime (Customer Quote / Sales Page Plugin
  still serves only the `/q` placeholder from B2).

These belong to later steps (action registry, event bus, customer flow,
issue tracking).

---

## Action Registry, Event Bus, Activity Logger

Three small foundation modules live in `src/core/`. They are pre-requisites
for the quote flow but are useful on their own as testable primitives.

### Action Registry — `src/core/action-registry/`

A typed registry of server-side actions. Each action carries:

- a stable `key` (e.g. `core.events.publish`)
- a `riskLevel` (`low | medium | high | critical`)
- a Zod `inputSchema` and `outputSchema`
- an async `handler(input, context) → ActionResult`

The registry validates input against `inputSchema`, calls the handler,
validates the output against `outputSchema`, and returns a discriminated
result. It **never** throws to the caller — even if the handler throws,
the registry catches the exception and returns
`{ ok: false, error: { code: 'HANDLER_EXCEPTION', message, details } }`.

Error codes emitted by the registry itself:

| Code | Meaning |
|---|---|
| `NOT_REGISTERED` | No action exists for the requested key. |
| `INVALID_INPUT` | Zod input validation failed. |
| `INVALID_OUTPUT` | Handler returned a value the output schema rejects. |
| `HANDLER_EXCEPTION` | Handler threw. The original error is in `details`. |

Handlers may also return their own structured errors (e.g.
`NOT_IMPLEMENTED`, `DB_ERROR`) — those are passed through unchanged.

`ActionContext` carries:

```ts
{
  businessId: string;
  userId: string | null;
  sourceType: "core" | "plugin" | "system";
  sourceKey: string | null;
  requestId: string | null;
}
```

A process-wide singleton lives at `getActionRegistry()` in
`src/core/action-registry`. On first call it registers four core
actions:

| Key | Status in B4 |
|---|---|
| `core.events.publish` | Real handler — writes to `events`. |
| `core.activities.create` | Real handler — writes to `activities`. |
| `core.tasks.create` | Placeholder — returns `NOT_IMPLEMENTED`. |
| `core.issues.create` | Placeholder — returns `NOT_IMPLEMENTED`. |

### Event Bus — `src/core/events/`

`publishEvent(input)` validates the payload against the Zod schema
registered for the given `eventType`, then inserts a row into the
`events` table via the service-role Supabase client.

Phase 1 event types (also exported as a TypeScript union):

- `quote_app.address_entered`
- `auto_quote.quote_generated`
- `quote_app.contact_submitted`
- `quote_app.schedule_requested`
- `lead.created`
- `quote.created`
- `task.created`
- `issue.flagged`

Each has a payload schema in `payload-schemas.ts`. Schemas use
`.passthrough()` so extra fields are preserved into the jsonb payload.

There are **no** rows in the DB `event_types` table yet. The TypeScript
schemas are the source of truth in Phase 1; DB-level enforcement can
land later if needed.

### Activity Logger — `src/core/activity/`

`createActivity(input)` validates the input via Zod and inserts a
human-readable row into the `activities` table. An activity may
optionally reference an `event_id` so the timeline can join back to the
machine-readable event.

`summarizePhase1Event(eventType)` (in `src/core/events/summaries.ts`)
returns the human-readable summary string for each Phase 1 event type.
Unknown types fall back to a deburred version of the type string.

### Admin pages

- `/admin/activity` — most recent 50 activities for the active business.
- `/admin/events` — most recent 50 events for the active business, with
  a per-row expandable `payload` block.

Both pages reuse the B1 auth + active-business helpers, scope by RLS,
and render empty-states until events/activities actually exist.

### Testing

Unit tests run via `npm run test`:

- `src/core/action-registry/registry.test.ts` — register, list, dedupe,
  execute paths (NOT_REGISTERED / INVALID_INPUT / INVALID_OUTPUT /
  HANDLER_EXCEPTION / handler-error pass-through / ok).
- `src/core/events/payload-schemas.test.ts` — every Phase 1 event type
  has a schema, required fields are enforced, UUIDs are validated,
  passthrough preserves extras.
- `src/core/events/summaries.test.ts` — every Phase 1 event type has a
  summary; unknown types deburr to a readable fallback.
- `src/core/activity/logger.test.ts` — input-schema validation
  (required fields, UUID checks, default actorType).

DB-write tests are deferred — they need either a test database or a
mock Supabase client, both of which would expand the dependency surface
beyond B4's scope. `publishEvent` and `createActivity` will be exercised
end-to-end once the quote flow lands and starts firing events; the
admin pages display the resulting rows.

### Manual testing

1. `npm run dev` and sign in (B1 flow).
2. Visit `/admin/activity` and `/admin/events`. Both should render the
   empty-state copy. **No DB rows are created by visiting these pages.**
   Reads run under the authenticated user's RLS context (Pattern B
   SELECT).
3. Click around: from `/admin`, the nav at the top offers
   `Installed plugins`, `Activity`, and `Events`.

Rows will not appear in `/admin/activity` or `/admin/events` until the
next step wires the quote-flow server actions to call `publishEvent` /
`createActivity`. That is intentional.

### What is intentionally not built yet

- No quote flow (the customer-quote `/q` page is still the B2
  placeholder).
- No Auto-Quote Plugin runtime — `core.quotes.calculate` is declared in
  the plugin manifest but no action handler exists yet.
- No real implementations for `core.tasks.create` or
  `core.issues.create` — both return `NOT_IMPLEMENTED`.
- No Google or RentCast calls.
- No contacts, properties, leads, or quotes are created by any code
  path yet.
- No event replay, event filtering, or activity search beyond the
  default 50-row reverse-chronological list.
- No `event_types` rows seeded into the DB; TypeScript schemas are the
  source of truth for Phase 1.

---

## Core Geo Provider (Google)

The core geo provider lives in `src/core/geo/`. It is the single place
Google Places / Geocoding is called from. Plugins and routes must use
this module — never call Google directly.

### Public API — `src/core/geo/`

| Function | Side | Purpose |
|---|---|---|
| `autocompleteAddress(input, opts?)` | server | REST call to Place Autocomplete. Returns predictions (`{ placeId, description, mainText, secondaryText }[]`). Defaults to US results. |
| `getPlaceDetails(placeId)` | server | REST call to Place Details with a fixed narrow `fields` mask. Returns the raw Google result; callers must pass it through `normalizeAddress` before use. |
| `normalizeAddress(place)` | pure | Validates a Google place response and projects it into the Phase 1 `NormalizedAddress` shape (street, city, state, postal_code, country, lat/lng, place_id, plus a `raw_google_response` safe-subset). |
| `matchServiceArea(businessId, city)` | server | Looks up `service_areas` for the business via the service-role client. Returns `{ inArea, serviceAreaId, serviceAreaName, normalizedCity, reason }`. |
| `normalizeCity(city)` | pure | Lowercases, trims, and collapses whitespace. Exposed for tests and call-site re-use. |

All functions return a discriminated `GeoResult<T>`:

```ts
{ ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }
```

No function throws. Common error codes: `MISSING_KEY`, `FETCH_FAILED`,
`HTTP_ERROR`, `INVALID_PLACE`, `MISSING_CITY`, `MISSING_STATE`,
`EMPTY_INPUT`, `EMPTY_CITY`, `DB_ERROR`, plus Google REST status codes
(`ZERO_RESULTS`, `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, etc.).

### Browser autocomplete — `src/components/google-autocomplete.tsx`

Client component that loads the Maps JS bootstrap with `loading=async`
and then calls `google.maps.importLibrary('places')` to grab whichever
Places autocomplete API is available:

1. **`google.maps.places.PlaceAutocompleteElement`** — the modern web
   component backed by Places API (New). Preferred.
2. **`google.maps.places.Autocomplete`** — the legacy widget. Used as a
   fallback only if the new element isn't present.

The widget internally debounces typing and batches requests, so no
extra debounce layer is needed.

For the new element, `onSelect` is wired to the `gmp-select` event;
`event.placePrediction.toPlace()` produces a `Place`, then
`place.fetchFields({ fields: ['id', 'formattedAddress', 'displayName'] })`
fills in the data and we emit `{ placeId, formattedAddress }`.

For the legacy widget, `onSelect` is wired to the `place_changed`
event with the classic `place.place_id` / `place.formatted_address`.

Either way, the parent component receives the same `SelectedPlace`
shape: `{ placeId: string; formattedAddress: string }`.

The component renders distinct error messages for:

- missing or empty `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
- Maps JS script load failure (network / key / API not enabled)
- `importLibrary('places')` throwing (key restriction, missing API,
  billing disabled)
- Places library loaded but no autocomplete constructor exposed
- selection event without a usable place id

### Required Google APIs

The current implementation targets **Places API (New)** on both the
browser and the server. Enable these on the Google Cloud project that
owns the keys:

1. **Maps JavaScript API** — for the browser bootstrap.
2. **Places API (New)** — `places.googleapis.com/v1/...` server REST
   endpoints **and** `google.maps.places.PlaceAutocompleteElement` in
   the browser.

Optional:

- **Places API** (legacy) — only needed if you want the legacy
  `google.maps.places.Autocomplete` fallback to work. With Places API
  (New) enabled, the modern element loads and the legacy fallback never
  fires.

### Env vars used

| Variable | Side | Recommended restrictions |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | browser | HTTP-referrer restricted to the customer-facing domains (and `localhost:*` for dev). |
| `GOOGLE_MAPS_SERVER_API_KEY` | server | IP-restricted to the server's egress IPs, OR (acceptable in Phase 1) API-restricted to just Places API. Must **not** be HTTP-referrer restricted — server-side calls don't send a referrer header. |

Reminder: if you put a referrer-restricted key into `GOOGLE_MAPS_SERVER_API_KEY`,
server-side `getPlaceDetails` / `autocompleteAddress` calls will return
`REQUEST_DENIED`. Use a separate server-side key with IP or API-only
restrictions.

### Local testing — `/admin/geo-test`

1. `npm run dev` and sign in.
2. From `/admin`, click **Geo test →** (or open
   http://localhost:3000/admin/geo-test).
3. Start typing an address. The Google widget shows suggestions.
4. Click a suggestion. The server action runs and renders three cards:
   - **Selected** — the place_id and Google's formatted address.
   - **Normalized address** — every field of the Phase 1 normalized
     shape, plus an expandable `safe raw_google_response` block proving
     no extra Google fields leak through.
   - **Service area** — green panel if the normalized city matches one
     of `boynton beach`, `boca raton`, `delray beach`; amber otherwise
     with a `reason` line.
5. Try addresses inside and outside the service areas (e.g. a
   Wellington FL or Miami FL address) to exercise both branches.
6. Try typing without picking from the dropdown — the widget shows
   "Please pick an address from the dropdown so we can confirm it."

No DB rows are created. The page reads `service_areas` only.

### Tests

Pure-unit tests (no DB, no fetch, no env reads):

- `src/core/geo/normalize.test.ts` — address component parsing, city/state
  extraction with fallbacks, subpremise → address_line_2, safe-raw subset
  enforcement, error cases (INVALID_PLACE / MISSING_CITY / MISSING_STATE).
- `src/core/geo/match-service-area.test.ts` — `normalizeCity` lowercasing,
  trimming, internal whitespace collapse, tab/newline handling, empty
  input.

Integration tests against the real Google API are deliberately not
added — they require a live key, leak quota, and aren't deterministic.
The manual `/admin/geo-test` flow exercises the full server-side path.

---

## Core Property Data Provider (RentCast)

Lives in `src/core/property-data/`. The single place RentCast is called
from. Plugins and routes must consume property data through this
module — never call RentCast directly.

### Public API — `src/core/property-data/`

| Function | Side | Purpose |
|---|---|---|
| `lookupPropertyByAddress(address)` | server | Raw RentCast lookup. Returns the JSON body (typically an array of property records) or a structured error. |
| `normalizePropertyData(raw)` | pure | Maps a single RentCast property record into the `NormalizedPropertyData` shape. Returns a "missing" shape if the input is null / not an object. |
| `normalizeFirstProperty(rawResponse)` | pure | Takes the array (or single object) RentCast returned, picks the first item, and normalizes. Returns "missing" if empty. |
| `missingPropertyData()` | pure | Stable null-everywhere `NormalizedPropertyData` with `property_data_status='missing'`. |
| `enrichProperty(address)` | server | End-to-end wrapper: `lookupPropertyByAddress` + `normalizeFirstProperty`. The public entry point. |

`PropertyLookupAddress` is a minimal subset of B5's `NormalizedAddress`
(`formatted_address` plus optional `address_line_1` / `city` / `state` /
`postal_code` / `latitude` / `longitude`). Phase 1 calls RentCast with
`formatted_address` only.

### Env var

| Variable | Side | Purpose |
|---|---|---|
| `RENTCAST_API_KEY` | server only | RentCast API key. **Never** prefixed with `NEXT_PUBLIC_`; never imported into client code. The provider is marked `import "server-only"` to enforce this at build time. |

### API endpoint used

```
GET https://api.rentcast.io/v1/properties
  ?address=<URL-encoded full formatted address>
Headers:
  X-Api-Key: $RENTCAST_API_KEY
  Accept: application/json
```

Response: an array of property records. Phase 1 takes the first item
and discards the rest.

### Normalized output shape

```ts
type NormalizedPropertyData = {
  square_footage: number | null;
  property_type: string | null;
  lot_size_sqft: number | null;
  year_built: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  data_source: "rentcast";
  data_confidence: "high" | "medium" | "low" | "unknown";
  property_data_status: "found" | "missing" | "partial" | "error";
  provider_property_id: string | null;
  provider_snapshot: {
    id, formattedAddress, propertyType,
    bedrooms, bathrooms, squareFootage, lotSize, yearBuilt
  };
};
```

`provider_snapshot` is intentionally narrow — only eight basic
dimensions. Owner info, sale history, tax assessments, etc. are
**never** copied out of RentCast's response.

### Phase 1 status / confidence rules

- `square_footage` present → `property_data_status = "found"`,
  `data_confidence = "high"`.
- `square_footage` null and a `provider_property_id` exists →
  `property_data_status = "missing"`, `data_confidence = "low"`.
- Nothing matched (empty / non-object input) →
  `property_data_status = "missing"`, `data_confidence = "unknown"`.
- `"partial"` and `"error"` are in the status union for forward-compat
  but **never emitted** by B6.

### Error handling

`PropertyDataResult<T>` is the same discriminated shape as
`GeoResult<T>`: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`.
The provider never throws.

Error codes:

| Code | When |
|---|---|
| `MISSING_KEY` | `RENTCAST_API_KEY` is unset or empty. |
| `INVALID_INPUT` | `address.formatted_address` is empty / whitespace. |
| `FETCH_FAILED` | Network failure / DNS / TLS / abort. |
| `UNAUTHORIZED` | RentCast returned HTTP 401 or 403 (bad/missing key, account suspended). |
| `HTTP_ERROR` | Other non-2xx response from RentCast. |
| `INVALID_RESPONSE` | RentCast returned a non-JSON body. |

**Property not found** and **square footage missing** are NOT errors.
They come back as `{ ok: true, data: { property_data_status: 'missing', square_footage: null, … } }`,
which is the manual-quote fallback signal for the future quote flow.

### Local testing — `/admin/property-data-test`

1. `npm run dev` and sign in.
2. From `/admin`, click **Property data test →**, or open
   http://localhost:3000/admin/property-data-test.
3. Start typing an address. The Google widget shows suggestions.
4. Click a suggestion. The server action chains:
   - Google → place details
   - Normalize address (B5)
   - Match service area (B5)
   - If **in-area**: call `enrichProperty` (RentCast)
   - If **out-of-area**: skip RentCast and render the skipped state
5. Expected branches:
   - **In-area + sqft found** — green property card, big square-footage number, status `found`, confidence `high`, full property-type / bed / bath / year-built / lot-size fields, expandable safe `provider_snapshot`.
   - **In-area + sqft missing** — amber property card, "Square footage missing", status `missing`, plus an inline panel explaining the manual-quote fallback that the future quote flow will trigger.
   - **In-area + RentCast HTTP error** — red property card showing the error code (`UNAUTHORIZED` / `HTTP_ERROR` / `FETCH_FAILED` / etc.).
   - **Out-of-area** — amber service-area card and an amber "RentCast skipped" card. No RentCast call is made.
6. Try addresses in Boynton Beach / Boca Raton / Delray Beach (in-area) and elsewhere (out-of-area) to exercise both code paths.

### What does NOT happen

No DB rows are written by this page:
- No `contacts`, `properties`, `leads`, `quotes`, or
  `quote_page_interactions` are created.
- No `tasks`, `events`, `activities`, or `issues` are written.
- Only `service_areas` is read (transitively, via
  `matchServiceArea`).
- The page calls Google Places (New) and RentCast — those are external
  paid APIs; each address lookup costs one Google Place Details call
  and one RentCast property lookup. Restrict daily quotas on both keys
  while iterating.

### Tests

Pure-unit tests (no DB, no fetch, no env reads):

- `src/core/property-data/normalize.test.ts` — 15 tests covering:
  - missing input (null / undefined / string / number)
  - `status=found` only when `square_footage` is a positive number
  - 0 / negative / non-numeric `squareFootage` falls back to `missing`
  - mapping of `property_type`, `bedrooms`, `bathrooms`, `lot_size_sqft`, `year_built`
  - fractional bathrooms (e.g., 2.5) preserved
  - `provider_snapshot` exposes only the eight approved keys; owner / sale / tax fields are stripped
  - `data_source` is always `"rentcast"`
  - `data_confidence` falls through `high → low → unknown`
  - `provider_property_id` rejects non-string ids
  - `normalizeFirstProperty` array / empty-array / null / single-object handling
  - `missingPropertyData()` stable null-everywhere shape

Integration tests against live RentCast are intentionally not added —
they leak quota, aren't deterministic, and require a live key.

---

## Rate Limiter

Lives in `src/core/rate-limiter/`. The single layer every future public
action (quote address lookup, contact submission, etc.) must pass
through *before* doing any expensive work (Google, RentCast, DB writes).

### Public API — `src/core/rate-limiter/`

| Function | Side | Purpose |
|---|---|---|
| `checkRateLimit({ actionKey, ipHash, addressHash? })` | server | Reads `rate_limit_events`, returns a discriminated allowed/blocked outcome. Does **not** record. |
| `recordRateLimitEvent({ actionKey, ipHash, addressHash?, metadata? })` | server | Appends one row to `rate_limit_events`. Call after a successful action, never after a blocked one. |
| `hashIp(ip)` | pure | HMAC-SHA-256 of the normalized IP. Returns 64-char hex. |
| `hashNormalizedAddress(address)` | pure | HMAC-SHA-256 of the normalized address string. Returns 64-char hex. |
| `getClientIpFromHeaders(headers)` | pure | Extracts the client IP from `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` / `x-client-ip`, in that order. |
| `computeCheckOutcome({ config, ipCount, addressCount, oldestIpEventAt, oldestAddressEventAt, now })` | pure | The decision function the DB-backed check delegates to. Useful for unit-testing without a database. |
| `getActionLimitConfig(actionKey)` / `listActionKeys()` / `phase1RateLimits` | pure | Config lookups. |

### What it writes to

The existing `rate_limit_events` table from `20260511120000_phase_1_schema.sql`:

```
id (uuid)
action_key (text)
ip_hash (text)
normalized_address_hash (text, nullable)
metadata (jsonb, nullable)
created_at (timestamptz)
```

RLS is enabled with **zero policies**. Anon and authenticated are
denied. Only the service-role key can read or write the table — same as
`events` / `activities`.

### Why raw IPs are not stored

Two reasons:

1. **Privacy.** IPs can be PII in some jurisdictions; we don't need
   them for analytics, just for counting.
2. **Tampering surface.** A leaked dump of raw IPs is materially worse
   than a leaked dump of hashes. HMAC-SHA-256 with a salt makes the
   hashes infeasible to invert without the salt.

The salt is `RATE_LIMIT_HASH_SALT` if set in the environment, otherwise
a fixed module constant. Set the env var in production. Rotating the
salt invalidates in-flight rate-limit windows for at most ~10 minutes
(per the Phase 1 limits below), which is acceptable.

### Default Phase 1 limits

Time window for all three is 600 seconds (10 minutes).

| Action key | per-IP cap | per-address cap |
|---|---|---|
| `quote.address_lookup` | 20 | 8 |
| `quote.submit_contact` | 5 | 3 |
| `geo.autocomplete_server` | 30 | — |

Conservative on purpose. Easy to widen after we see real traffic. Edit
`src/core/rate-limiter/config.ts` to change.

### Output shape

`checkRateLimit` returns:

```ts
| { ok: true; check: { allowed: true;  remaining; resetAt; limit; windowSeconds } }
| { ok: true; check: { allowed: false; reason: 'ip_limit' | 'address_limit';
                       retryAfterSeconds; resetAt; limit; windowSeconds } }
| { ok: false; error: { code: 'UNKNOWN_ACTION' | 'INVALID_INPUT' | 'DB_ERROR' |
                              'HASH_FAILED' | 'CLIENT_INIT_FAILED'; message; details? } }
```

`recordRateLimitEvent` returns:

```ts
| { ok: true; eventId: string }
| { ok: false; error: { code; message; details? } }
```

Neither function throws.

### Pattern at call sites (future)

```ts
// inside a public quote server action
const ip = getClientIpFromHeaders(await headers()) ?? '0.0.0.0';
const ipHash = hashIp(ip);
const addressHash = address ? hashNormalizedAddress(address) : null;

const check = await checkRateLimit({
  actionKey: 'quote.address_lookup',
  ipHash,
  addressHash,
});
if (!check.ok) return errorResponse(check.error);
if (!check.check.allowed) return blockedResponse(check.check);

// ...do the expensive work (Google place details, RentCast, DB inserts)...

await recordRateLimitEvent({
  actionKey: 'quote.address_lookup',
  ipHash,
  addressHash,
});
```

**Every future public quote action must call checkRateLimit before any
expensive API or DB work, and only call recordRateLimitEvent after the
work succeeds.** Blocked attempts must not be counted toward the
bucket.

### Testing `/admin/rate-limit-test`

After `npm run dev` and signing in:

1. From `/admin`, click **Rate limit test →** (or visit
   http://localhost:3000/admin/rate-limit-test).
2. Pick an action key from the dropdown.
3. Optionally type an address (used only when the action has a
   per-address limit).
4. Click **Check and record (if allowed)**.
5. The result panel shows:
   - allowed / blocked badge + reason
   - `limit`, `windowSeconds`, `remaining` (or `retryAfterSeconds`),
     `resetAt`
   - the client IP read from headers and a hash *prefix* for both
     `ip_hash` and `address_hash` (full hashes are never echoed back)
   - whether a `rate_limit_events` row was inserted
6. Click again to walk the bucket down. Once the configured `maxPerIp`
   (or `maxPerAddress`) is reached, subsequent clicks return `blocked`
   with the bucket's reason. Blocked clicks are NOT recorded — they
   don't dig the hole deeper.

You can also confirm rows in Supabase Studio:

```sql
select action_key, count(*) from public.rate_limit_events group by action_key;
```

### What does NOT happen

- No contacts, properties, leads, quotes, quote_page_interactions,
  tasks, events, activities, or issues are written by the rate-limit
  test page.
- The test page reads no business tables.
- The only side effect of clicking "Check and record" while allowed is
  one row in `rate_limit_events`.

### Tests

Pure-unit tests (no DB, no fetch, no env reads beyond an optional
salt):

- `src/core/rate-limiter/hashing.test.ts` — hex output, determinism,
  IPv4/IPv6 normalization, whitespace/case insensitivity, IP vs
  address namespace separation.
- `src/core/rate-limiter/headers.test.ts` — header precedence
  (`cf-connecting-ip` > `x-real-ip` > first entry of
  `x-forwarded-for` > `x-client-ip`), trim, null fallback.
- `src/core/rate-limiter/compute.test.ts` — allowed-with-both-buckets,
  ipRemaining when no address, ip_limit blocked, address_limit
  blocked, ip_limit precedence, retryAfter fallback when oldest event
  is unknown, non-negative retryAfter when the oldest event already
  fell out of the window, config without `maxPerAddress`.
- `src/core/rate-limiter/config.test.ts` — defaults present and
  match the documented numbers.

DB-write tests for `checkRateLimit` / `recordRateLimitEvent` are
deferred (they'd need a test DB or a mock Supabase client). The
admin test page exercises both paths end-to-end against real Supabase.

---

## Window Cleaning Auto-Quote Plugin

Lives in `src/plugins/window-cleaning-auto-quote/`. Calculates instant
exterior quote options + the interior add-on price for a given
square-footage value. Calculation only — does not write quotes / leads
/ contacts and does not handle the customer-facing flow.

### Public API

| Function | Side | Purpose |
|---|---|---|
| `calculateWindowCleaningQuote(input)` | server | Public entry point. Validates input, branches to the manual-quote fallback when needed, loads the typed config from core tables, runs the math, returns the structured output. |
| `buildQuoteOutput(input, loadedConfig)` | pure | The pure orchestrator used by tests: builds options / add-ons / snapshots from already-loaded config. |
| `calculatePrices(sqft, parsedPricingConfig)` | pure | The pure pricing math. |
| `parsePriceRules(rows)` | pure | Parses raw `price_rules` rows into a typed `ParsedPricingConfig`. |
| `loadAutoQuoteConfig(businessId)` | server | Loads `services` + `service_plans` + `price_rules` for the business and returns a `LoadedConfig`. |
| `DEFAULT_PRICING_CONFIG` | const | Documented Phase 1 defaults (mirrors the seed) — exposed for tests and as a defensive fallback. |
| `REQUIRED_PRICE_RULE_KEYS` | const | The six rule keys the plugin needs in `price_rules`. |
| `WINDOW_CLEANING_AUTO_QUOTE` | const | Plugin identity (`pluginKey`, `version`, `actionKey`). |

### Pricing rules it reads

The plugin always pulls live values from core `price_rules` for the
active business via `loadAutoQuoteConfig`. Six rule keys are required:

| Rule key | Used as |
|---|---|
| `minimum` | `rule_config.min_price` → `minimum` (default 199). |
| `base_exterior` | per-sqft multiplier. Read from `rule_config.per_sqft` → `rule_config.multiplier` → parsed from the formula string `sqft * N`. |
| `one_time_exterior` | `rule_config.multiplier` (default 1.0) + `rule_config.rounding`. |
| `six_month_exterior` | `rule_config.multiplier` (default 0.9). |
| `three_month_exterior` | `rule_config.multiplier` (default 0.8). |
| `interior_add_on` | `rule_config.multiplier` (default 0.5). |

Math (matches decision 0001 §1):

```
base = sqft * baseExteriorPerSqft
one_time = round(max(base * oneTimeMultiplier, minimum))
six_month = round(max(base * sixMonthMultiplier, minimum))
three_month = round(max(base * threeMonthMultiplier, minimum))
interior = round(one_time * interiorMultiplier)
```

`round` is configurable via the `rounding` field on the
`one_time_exterior` rule — `nearest_dollar` (default) or `none`.

`DEFAULT_PRICING_CONFIG` is exported for tests and as a defensive
fallback (the user can pass it to `buildQuoteOutput` directly). The
normal calculation path **always** reads from the DB; defaults are
never used silently.

### Input

```ts
type QuoteCalculationInput = {
  businessId: string;
  square_footage: number | null;
  property_data_status: "found" | "missing" | "partial" | "error" | string;
  property_type?: string | null;
  service_area_id?: string | null;
  source_plugin_version?: string;
  normalized_address?: unknown;
  property_snapshot?: unknown;
};
```

Required fields: `businessId`, `square_footage`, `property_data_status`.
The rest are passed through for traceability (the future quote flow
will stamp them onto the immutable quote snapshot).

### Output

```ts
type QuoteOutput = {
  can_quote: boolean;
  manual_quote_required: boolean;
  reason: string | null;
  options: QuoteOption[];          // [] when can_quote = false
  add_ons: QuoteAddOn[];           // [] when can_quote = false
  selected_option_key: null;       // ALWAYS null — customer picks later
  selected_add_ons: [];            // ALWAYS empty in this step
  line_items_snapshot: LineItem[] | null;
  price_snapshot: PriceSnapshot | null;
  calculation_snapshot: CalculationSnapshot;
  warnings: string[];
  source_plugin_key: "window_cleaning_auto_quote";
  source_plugin_version: string;
};
```

Each `QuoteOption` has:
`option_key` · `service_plan_id` · `service_plan_name` · `display_label`
· `is_recommended` · `exterior_price` · `recurring_interval_months` ·
`price_label` (e.g. `"$225 per visit"` or `"$250"`).

The `QuoteAddOn` for `interior_window_cleaning`:
`service_id` · `service_code` · `service_name` · `price` ·
`display_label` (e.g. `"Add Interior Window Cleaning to This Cleaning: +$125"`).

`calculation_snapshot` includes `square_footage`,
`base_exterior_before_minimum`, `minimum_price`, `one_time_formula`,
`six_month_multiplier`, `three_month_multiplier`,
`interior_multiplier`, `minimum_applied` (per-option booleans),
`rounding`, `price_rules_used`, `reason`, and `generated_at`.

### Manual-quote fallback

When `square_footage` is null/non-positive OR `property_data_status` is
not `"found"`, the plugin returns:

```ts
{ ok: true, data: { can_quote: false, manual_quote_required: true,
                    reason: "…", options: [], add_ons: [], … } }
```

This is the signal the future quote flow will use to render the
manual-quote fallback message + capture contact info + queue an admin
task. The plugin never throws and never produces invalid prices.

### Wiring to the action registry

The action metadata for `window_cleaning_auto_quote.calculate_quote` is
already registered in core (B3 / B4 seeded the row + Zod schemas). C1
deliberately does **not** wire the live handler into the runtime
registry — callers (the Auto-Quote test page, the future quote flow)
invoke `calculateWindowCleaningQuote` directly. Plumbing the handler
through `getActionRegistry()` happens when the quote flow lands.

### Testing `/admin/auto-quote-test`

After `npm run dev` and signing in:

1. From `/admin`, click **Auto-Quote test →**, or open
   http://localhost:3000/admin/auto-quote-test.
2. Pick an address from the autocomplete. The server action chains:
   Google place details → normalize → service-area match →
   (if in-area) RentCast → (if sqft found) Auto-Quote.
3. Expected branches:
   - **In-area + sqft found** → Quote card is green, shows three
     options (one-time / 6-month with "$X per visit" / 3-month
     **Recommended** with "$X per visit") + interior add-on; expandable
     `calculation_snapshot` and `price_snapshot + line_items_snapshot`
     blocks reveal the full numeric trail.
   - **In-area + sqft missing** → Quote card is amber:
     **Manual quote required** with the reason and an explanation of
     the future fallback flow.
   - **In-area + RentCast error** → Property card red; Quote card amber
     "Auto-Quote skipped".
   - **Out-of-area** → Property + Quote cards both amber "skipped".
4. Spot-check the math against the expected numbers for a 2,500 sqft
   home: one-time $250, 6-month $225/visit, 3-month $200/visit, interior
   add-on $125.

### What does NOT happen

No DB writes on this page:

- No `contacts`, `properties`, `leads`, `quotes`,
  `quote_page_interactions`, `tasks`, `events`, `activities`, or
  `issues` are created.
- Only `service_areas`, `services`, `service_plans`, and `price_rules`
  are read.
- Google + RentCast each receive one call per address lookup.

C1 is calculation only. **Not** quote acceptance, **not** scheduling,
**not** job creation, **not** customer contact capture. Those land in
later steps.

### Tests

Pure-unit tests (no DB, no fetch, no env reads):

- `src/plugins/window-cleaning-auto-quote/pricing.test.ts` — 14 tests
  covering normal sqft, recurring multipliers, interior add-on, partial
  minimum, full minimum clamp, rounding modes, `parsePriceRules` happy
  path + missing keys + malformed configs + explicit per_sqft override.
- `src/plugins/window-cleaning-auto-quote/quote.test.ts` — 16 tests
  covering three-options + one-add-on output, no default selection,
  recommended flag, `per visit` price labels, snapshot shapes,
  warnings, plugin key/version stamping, manual-quote fallback paths
  (null sqft, `missing` property_data_status, zero sqft, missing
  business id), and override versions.

DB-write tests for the live config loader are deferred — they need
either a test database or a mock Supabase client. The admin test page
exercises the full server-side path against real Supabase + Google +
RentCast.

---

## Public Quote Flow (C2) — `/q`

C2 lights up the first half of the customer quote flow on the public
Customer Quote App Surface. Anonymous visitors can pick an address and
see the three quote option cards + interior add-on. **C2 stops short
of contact capture and core record creation** — that arrives in C3.

### What `/q` does now

1. Resolves the business + app surface via the B2 host resolver
   (`crystal-bear` + `quote` in dev).
2. Loads `business_settings` for customer-facing copy (trust points,
   fallback messages, scheduling copy, secondary phone) via
   service-role.
3. Renders the B5 Google autocomplete. Customer **must** pick from the
   dropdown — free-typed input is rejected (B5 behavior).
4. On select, calls the public server action
   `lookupAddressForQuoteAction(placeId)` which delegates to
   `lookupAddressAndPreview` in the Customer Quote / Sales Page plugin.

### Server-side flow

`src/plugins/customer-quote-sales-page/address-lookup.ts`:

1. **Rate-limit check** — `quote.address_lookup` (B7, IP+address hash;
   address bucket key is the Google `place_id` so repeat lookups for
   the same address are gated together). Blocked → `RATE_LIMITED`
   error with `retryAfterSeconds`.
2. **Google Place Details + normalize** (B5). Failure → `GEO_FAILED`.
3. **Service-area match** (B5).
4. **If out of area** → record `quote_page_interactions`
   (`interaction_status='out_of_area'`, `service_area_status='out_of_area'`,
   `property_data_status='not_requested'`). Do **not** call RentCast
   or Auto-Quote.
5. **If in area** → RentCast `enrichProperty` (B6). Hard failures land
   in the interaction as `provider_error` with status `error`.
6. **If sqft missing** → record interaction
   (`interaction_status='property_data_missing'`,
   `property_data_status='missing'`). Do **not** call Auto-Quote.
7. **If sqft found** → Auto-Quote `calculateWindowCleaningQuote` (C1).
   Record interaction with `interaction_status='quote_generated'`,
   `quote_preview_data` = full Auto-Quote output.
8. **Record rate-limit event** for the lookup (success-side only).
9. Return discriminated `AddressLookupResult` to the client.

### Quote cards UI

When the result is `quote_generated`, the client renders:

- Three OptionCards (One-Time, Every 6 Months, Every 3 Months —
  **Recommended**). **No option is selected by default.** Recurring
  options show "$X per visit"; one-time shows "$X".
- Interior add-on checkbox toggle ("Add Interior Window Cleaning to
  This Cleaning: +$X").
- "First cleaning total" panel that reads "Pick an option" until the
  customer picks one, then shows the option price plus interior
  add-on price when the toggle is on.
- "Free screen cleaning included." line under the add-on.
- Soft scheduling copy from `customer_quote_scheduling_copy`.
- Primary CTA `Schedule My Cleaning` — disabled until an option is
  selected. Clicking it shows the placeholder banner:
  **"Contact step will be added next."** (No contact form in C2.)
- Trust section at the bottom (six bullets from
  `customer_quote_trust_points`).
- Secondary phone line:
  `Prefer to talk? Call us. [+ phone if set on the business row]`.

When the result is `out_of_area` or `property_data_missing`, an amber
fallback card renders with the seeded business-settings copy plus the
**"Contact step will be added next."** placeholder.

### Data that C2 writes

- **`quote_page_interactions`** — exactly one row per address-lookup
  attempt. Populated fields (when known):
  `business_id`, `app_surface_id`, `installed_plugin_id` (when the
  `customer_quote_sales_page` install is found),
  `plugin_version` (`0.1.0`), `session_key` (null in C2),
  `address_input`, `normalized_address`, `normalized_city`,
  `google_place_id`, `latitude`, `longitude`,
  `service_area_status`, `property_data_status`,
  `property_data_summary`, `provider_error`, `interaction_status`,
  `quote_preview_data` (when generated), `source`, `tracking_code`,
  `utm_source`, `utm_medium`, `utm_campaign`, `referrer`.
  **`converted_*` fields stay `NULL`** — those are owned by C3.
- **`rate_limit_events`** — exactly one row per allowed lookup, via
  B7's `recordRateLimitEvent`. Metadata includes
  `interaction_status` + `service_area_status` for later analysis.

That's it. C2 explicitly does **not** write any of:

`contacts`, `properties`, `leads`, `quotes`, `tasks`, `events`,
`activities`, `issues`. Verified by grep + code review — no insert
statements on those tables exist in any C2 code path.

### Interaction-status taxonomy

C2 emits exactly four `interaction_status` values:

| Status | When |
|---|---|
| `out_of_area` | service-area match returned `inArea=false`. RentCast not called. |
| `property_data_missing` | in-area but RentCast returned no sqft, OR Auto-Quote flagged `manual_quote_required`. |
| `quote_generated` | quote preview successfully produced. `quote_preview_data` is non-null. |
| `error` | hard failure mid-flow (RentCast 5xx, etc.). `provider_error` is set. |

`address_entered`, `contact_submitted`, `converted`, and `abandoned`
remain in the schema but are emitted by later steps (C3+) or by no
step at all in Phase 1.

### How to test `/q`

1. `npm run dev` (already running counts).
2. Open http://localhost:3000/q in an incognito window — no auth.
3. **Quote-generated branch:** type `100 E Boynton Beach Blvd` and
   pick the suggestion. Expected: three option cards (3-month
   Recommended), interior toggle, "First cleaning total" updates as
   you click options + toggle interior, CTA enables once an option is
   chosen, clicking the CTA shows "Contact step will be added next."
4. **Out-of-area branch:** type a Wellington FL or Miami FL address.
   Expected: amber fallback card with the seeded out-of-area copy +
   "Contact step will be added next."
5. **Property-data-missing branch:** pick an in-area address that
   RentCast can't resolve (vacant lot, new construction). Expected:
   amber fallback card with the "we don't have your home in our
   system yet" copy.
6. **Rate-limit branch:** rapidly pick 20+ addresses from the same
   browser within 10 minutes. The 21st attempt returns the amber
   "Slow down a sec." panel with retry-after seconds.

### How to view admin quote interactions

Sign in to `/admin`, click **Quote interactions →** (or visit
http://localhost:3000/admin/quote-interactions).

Each row shows: timestamp, formatted address, normalized city,
interaction-status badge, service-area / property-data status, the
selected option / total (both null in C2 since selection state lives
client-side here), converted yes/no (always `no` in C2), and a
preview-price summary when a quote was generated.

Empty state until you hit `/q` for the first time.

### Tests

Pure-unit tests added in C2:

- `src/plugins/customer-quote-sales-page/outcome.test.ts` — 7 tests
  covering the discriminated branches of `decideOutcome` (out-of-area
  short-circuits, in-area with null property → `error`,
  property_data_missing, Auto-Quote not invoked, Auto-Quote returned
  ok=false, Auto-Quote flagged manual_quote_required, full success).
- `src/plugins/customer-quote-sales-page/selection.test.ts` — 6 tests
  covering `INITIAL_SELECTION` (no default option), `findSelectedOption`,
  `computeSelectedTotal` (null when nothing picked, option-only,
  option + interior, missing add-on safety), `canSchedule`.

Integration tests against live Google / RentCast are not added — the
existing manual `/admin/property-data-test`, `/admin/auto-quote-test`,
and now `/q` flows exercise the full pipeline against real Supabase.

### Important boundary

C2 is **calculation + preview only**. The "Schedule My Cleaning"
button is a placeholder until C3 wires the contact form + the
`submit_quote_request` server action that creates
Contact + Property + Lead + Quote and marks the interaction
`converted`.

---

## Staging Reset Warning

A staging-only data reset feature will be added in a later step. It
clears quote-flow test data (interactions, fake contacts, fake leads,
fake quotes, related tasks/activities) while preserving setup data
(workspace, users, roles, app surfaces, plugins, services, pricing).

The reset feature is gated by **two** flags that must both be true:

- `NEXT_PUBLIC_ENABLE_STAGING_TOOLS=true` (controls whether the button
  renders)
- `ENABLE_STAGING_TOOLS=true` (controls whether the server action will
  run)

**Never set either flag to `true` in production.** The frontend flag
alone is not sufficient — the server action validates the server-side
flag before running so a tampered client cannot trigger a reset.

If you accidentally enable staging tools in a production-like
environment, disable both flags immediately and audit recent activity
for unexpected deletions.

---

## Phase 1 Scope Reminders

- No jobs, appointments, invoices, payments, or scheduling calendar.
- No SMS, email, or GoHighLevel integration.
- No AI agents or full Context Engine.
- No customer photo uploads or file storage.
- No full CRM workflow or pipeline management.
- No public plugin marketplace.

See `CLAUDE.md` Section "Phase 1 Do Not Build List" for the full list.
Ask before building anything outside Phase 1 scope.
