# Decisions

Choices made without asking, newest first within each phase. Reverse any of them if you disagree.

## Phase 1

**Conflicts with the prompt (preset or framework wins)**
- `middleware.ts` is `proxy.ts` in Next 16 (Node runtime, `proxy` export). Same behaviour.
- Tenant routes live at `app/(tenant)/sites/[dealer]/`, not `[dealer]/`. A bare `[dealer]` segment would be reachable directly at `/{slug}` on any host and could shadow admin routes. The proxy rewrites into `/sites/{slug}` and returns 404 for any direct request to `/sites/*`.
- Theme provider (and the `d` dark-mode hotkey) moved from the root layout to the admin layout. Buyer pages stay light and use only the dealer's tokens.
- Package manager is pnpm (repo standard); shadcn components added with `pnpm dlx shadcn@latest add`.
- shadcn here is Base UI based (`render` prop, not `asChild`).
- pnpm build scripts: `esbuild` install script denied in `pnpm-workspace.yaml`; its binary comes from optional deps and everything works.
- ESLint 10 crashes in `eslint-plugin-react` version auto-detection; React version is pinned in `eslint.config.mjs`.

**Dependencies**
- Added from Section 2: drizzle-orm, drizzle-kit, zod, next-auth (Auth.js v5 beta), vitest.
- Added implied by Section 2 but not named: `pg` (Postgres driver, also what pg-boss uses), `@auth/drizzle-adapter`, `@types/pg`.
- No `tsx`. Scripts run on Node 24 native TypeScript, so schema files use explicit `.ts` import specifiers and `allowImportingTsExtensions` is on.

**Schema additions beyond Section 6**
- `dealers.business_hours` (jsonb) for test-drive slots.
- `leads.consent_at` (not null) to record DPDP consent.
- `cars.variant_id` is nullable: a draft exists before the dealer picks a variant match.
- `dealers.theme` holds colours and radius only. Name and logo stay in their own columns rather than duplicating them in the jsonb.
- Auth.js `users` and `accounts` tables; sessions are JWT, so no sessions table.
- `price_events.car_id` has no cascade and a DB trigger blocks UPDATE, DELETE and TRUNCATE. Cars with history are archived, never hard-deleted.
- The 12 photo angles: front 3/4, rear 3/4, left side, right side, dashboard, odometer, front seats, rear seats, boot, engine bay, front tyres, rear tyres. Section 7.1 lists nine named angles plus "each tyre group"; this is my reading of the count. Adding an enum value later is a cheap migration.

**Tenancy**
- `scopedDb(dealerId)` is the only data access for app code. ESLint blocks importing the raw client from `app/`, `components/`, `hooks/` and `proxy.ts`. Update and delete require an explicit `where`; `dealer_id` and `car_id` are stripped from update payloads at runtime.
- Child tables (media, RC lookups, views, transfers, price events) have no `dealer_id`, so they scope through an ownership subquery on `cars`.
- `dealers` and the auth tables are read through the raw client only in `lib/tenant` and `lib/auth`.
- A test fails when any table gains `dealer_id` or `car_id` without being registered as tenant-scoped.
- Reserved subdomains: `app`, `www`, `api`, `admin` and others in `lib/tenant/host.ts`. Only one label deep.
- Custom domains resolve only when `verified_at` is set and the plan allows them. Cached in memory for 60 seconds. Cloudflare for SaaS provisioning is a TODO in `lib/tenant/dealer.ts`.
- The proxy strips any client-supplied `x-tenant-slug` and sets its own. Tenant hosts can reach `/api/t/*` only; everything else under `/api` is 404 there.

**Plans (no billing)**
- starter 20 cars, growth 50, pro 100, scale 1000 (the "100+" tier). White label and custom domain on for pro and scale. Adjust in `lib/plans.ts`.

**Other**
- Brand is Tany, product suite is TanyApps (TanyCars, TanyEats built; TanyMarts, TanyGifts, TanyMeds later). Copy lives in `lib/copy.ts`.
- Existing cloud resources keep their original names (Firebase project `showmoto-5e1b2`, R2 bucket `showmoto`, Analytics dataset `showmoto_listing_events`) because they cannot be renamed in place.
- Theme validation: text colours are auto-adjusted to WCAG AA (4.5:1). A primary colour under 3:1 against white is rejected because buttons and links would vanish. The "near-black" fallback goes to pure black in the mid-tone band where near-black cannot reach 4.5:1.
- Radius options: none, sm, md (preset default), lg.
- A user belongs to one dealer in v1; if several links exist the earliest wins.

## Phase 2: variants, RC, matching

**Read before trusting**
- `data/variants/chennai-top40.csv` (45 models, 446 rows) was written from my own knowledge, not from manufacturer data. Engine sizes, fuel and transmission pairings and especially the model-year ranges are approximate. Have someone who knows the Chennai resale market skim it. It only carries fields I am fairly sure of (engine cc, fuel, transmission, body type, seats). No feature lists or detailed specs are included.
- Models still on sale are given a `year_to` of 2024 (the data cut-off) instead of blank. Year is a soft signal in matching, so a 2025 car still matches, but update the file if you want it exact.
- The Surepass adapter (`lib/rc/surepass.ts`) is written from public documentation and has never been called with a real key. The endpoint and field names are unverified. It maps several candidate field names defensively. Make one real call and compare against a known vehicle's RC before relying on it.
- Nothing that calls the vision model has been run against the live API, because there was no key. The client is unit-tested with fakes: valid JSON, schema violations, refusals, truncation and API errors all return null instead of throwing.

**Choices**
- Added dependencies: Google Gemini via REST `fetch` (no SDK; the vision model, which Section 2 leaves unnamed), `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (R2, named in Section 2), `pg-boss` (Section 2), `@playwright/test` (Section 2).
- Vision model defaults to `gemini-3.6-flash` (override with `VISION_MODEL`), with thinking off because these are short extraction tasks on the dealer's waiting path. Refusal fallbacks are not enabled: a refusal is treated as "no answer" and the dealer types the value.
- Variant matching is rules first (make, model, variant, fuel, transmission, year, with typo tolerance). The model is only asked when the top two results are close, and it can only reorder catalogue ids we send. Ids it invents are discarded, so it cannot invent a variant or its specs.
- A variant must be chosen before publishing. If a car is not in the catalogue, add it to the CSV. There is no free-text car.
- RC data is cached per car for 30 days. Rate limits: 40 lookups per dealer per hour (counted in the database) and 25 per IP per hour (in memory, per server instance).
- The mock RC provider never sets `rc_verified_at`, so mock data can never earn the "Verified from RTO records" badge.
- RC records keep no owner name, address, chassis or engine number. Adapters only read the fields in `RcRecord`. The raw provider response is stored encrypted for the 30-day cache.
- Duplicate plate detection is not done: plates are encrypted with a random IV, so they cannot be compared without adding a blind index. Ask if you want one.

## Phase 3: add-a-car flow

**Choices**
- Schema additions: `cars.year` is nullable (a draft has no year until the RC or dealer supplies it), `cars.caption`, `car_media.analysis`, and unique keys on variants (natural key) and `car_media.r2_key` (makes upload retries idempotent).
- Uploads: the browser asks a server action for a slot and a presigned URL, sends the file straight to storage, then confirms. The server checks the object exists and is a sane size before marking it uploaded. Photos are resized to 1920px and re-encoded on the device, which also strips EXIF location data.
- Offline queue: IndexedDB, one upload at a time, cover photo first, video last, exponential backoff, resumes after a closed tab. It runs for the whole admin session, so uploads continue while the dealer navigates. There is no service worker yet, so uploads pause when the app is closed and resume next time it opens (Phase 6, PWA).
- Publishing needs only the cover photo (Front 3/4) to have landed. A confirmed upload counts even if the screen has not refreshed yet.
- Publishing runs in one transaction: live-car cap check, canonical slug (`2017-maruti-baleno-alpha-tn11`, numeric suffix on collision), status change and the append-only price event. Re-publishing does not add a second "listed" event.
- Development storage: with no R2 keys and `NODE_ENV=development`, files go to `.local-uploads/` through `/api/dev-storage` and are served from `/api/t/media`. Both return 404 whenever R2 is configured or in production.
- Carousel: 4:5 crops are made on the phone at share time, so nothing extra is stored or paid for. Web Share with files is used when the browser supports it, with download and copy as fallbacks.
- Caption: written by the model when a key is set, but only accepted if it contains the exact link and price and adds no other URLs, and does not claim RC verification the car has not earned. Otherwise a deterministic template is used.
- Short link: `/{code}` on a tenant host 301s to the canonical URL in `proxy.ts`. The lookup is filtered to that dealer's own cars, so a code on one dealer's subdomain can never resolve another dealer's car. Sold cars still resolve; drafts and archived cars do not.
- The canonical car page is a basic placeholder (hero, price, facts). The full buyer page is Phase 4.
- Video: `pnpm worker` runs a pg-boss consumer that makes 360p and 720p HLS plus a poster and asks the model which of the 12 angles the video shows. Analysis frames are held in memory only; they are never stored and never used as listing photos. The worker reads the whole original into memory (400 MB cap) before processing; move to streaming if that becomes a problem.
- The worker and its ffmpeg command construction are unit-tested, and the job logic is tested against a real database with a fake ffmpeg. **It has not been run with a real ffmpeg**, because none is installed here.
- Dev sign-in bypass now loads the real seeded dealer when a database exists, so the whole flow can write real rows.
- Server actions accept request bodies up to 2 MB (plate photos travel to the OCR action as base64).
- E2E runs use their own port and build directory and hide the Next.js dev badge, which otherwise covers the camera's Skip button.
