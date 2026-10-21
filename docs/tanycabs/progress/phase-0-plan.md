# Phase 0 plan: Foundation refactor

Branch: `tanycabs/phase-0-foundation` (from `main` @ `b98d6fd`). **Status: awaiting approval. No code changed yet.**

## Baseline (before any change)

| Gate | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 29 files pass, 2 skipped; 489 tests pass, 30 skipped (skipped = live-DB tests needing `TEST_DATABASE_URL`) |
| `pnpm lint` | **fails already: 12 errors, 14 warnings** (pre-existing, listed below) |

Pre-existing lint errors (not caused by this work):
- 4 × `no-restricted-imports` on `@/lib/db/client`: `app/(admin)/(shell)/settings/actions.ts`, `settings/team/actions.ts`, `settings/team/page.tsx`, `app/(admin)/onboarding/page.tsx`. These are real tenant-isolation rule violations (the raw client is imported from `app/`).
- 3 × react-hooks "setState in effect": `components/auth/dealer-login-form.tsx:147`, `components/cars/voice-step.tsx:50`, `components/ui/carousel.tsx:99`.
- 5 × `no-explicit-any` in `tests/jarvis-worker.test.ts`.

BUILD.md rule 16 requires lint green. **Proposal:** fix the 4 isolation violations as part of R2/R3 (they belong there), and fix the other 8 in one small preliminary commit `chore(lint): clear existing errors` so every later commit is checked against a green lint. Needs your OK (item D5).

## Decisions needed from you

| # | Question | My recommendation |
|---|---|---|
| D1 | **Cron.** The OpenNext worker (`.open-next/worker.js`) does not export a `scheduled` handler. | Add a tiny separate worker `workers/cron` (cron triggers in its own `wrangler.jsonc`) that `fetch`es `https://app.tany.in/api/internal/cron/<job>` with a bearer secret. Same pattern as `workers/tracker`; deploy script `deploy:cron`. No change to the OpenNext build. |
| D2 | **Shared rate limiter.** Workers Rate Limiting binding is per-location and approximate; a Durable Object is exact but adds a hop. | Durable Object `RateLimiter` hosted in `workers/tracker` (already bound and deployed together), exact sliding window per key, falling back to the in-memory limiter **only** when no binding exists (local dev/tests). `allow()` becomes `async`; all ~15 call sites updated. |
| D3 | **`dealers.industry` enum migration.** Existing rows hold `motors`/`restaurants`. | Postgres enum `industry` = `motors, restaurants, cabs`; migration casts the column (`USING industry::industry`), keeps default `motors`. Reversible by a manual `ALTER`; Drizzle snapshot updated. |
| D4 | **Webhook dispatch fallback.** | New orders get `notes.kind` = `food_order` / `car_booking`. Webhook dispatches on `notes.kind`; when `kind` is absent (all existing orders), it falls back to today's lookup order (Eats, then Motors). Unknown `kind` returns 200 `ignored` and logs. |
| D5 | Fix the 8 non-isolation lint errors in a preliminary commit? | Yes. |
| D6 | **Outbox scope.** Phase 0 asks for table + `Channel` interface + `wa.me` adapter only. | Agreed: no sender worker yet (Phase 4). The `wa_link` adapter just records a `notifications` row with the prepared link, status `link_ready`. |

## Work breakdown and files

Each step is one or more small commits; typecheck + tests (+ lint after step 0) run before every commit. Eats and Motors behaviour must not change: existing tests stay green, and I add characterisation tests before moving code.

### Step 0: lint baseline
- Edit: `components/auth/dealer-login-form.tsx`, `components/cars/voice-step.tsx`, `components/ui/carousel.tsx`, `tests/jarvis-worker.test.ts`.

### Step 1 (R1): vertical registry
- **New:** `lib/verticals/types.ts`, `lib/verticals/index.ts`, `lib/verticals/motors.ts`, `lib/verticals/restaurants.ts`, `lib/verticals/cabs.ts` (cabs entry is a stub: key, labels, `adminReady: false`, no nav yet), `tests/verticals.test.ts`.
- Each config holds: key, product key, labels/nouns (moved from `lib/industries.ts`), admin nav, `firstItemHref`, plan limits label, Razorpay category, tenant shell selector, `adminReady`.
- **Edit (replace literal industry branches by registry lookups):**
  `lib/industries.ts` (becomes a thin re-export), `lib/products.ts` (`INDUSTRY_PRODUCT` and the `tanycabs` industry), `lib/plans.ts` (`planLimitLabel`), `lib/route/razorpay.ts` (category), `lib/billing/razorpay.ts` (plan description no longer hard-codes "live cars"), `lib/dealers/onboard.ts` (enum from registry),
  `app/(tenant)/sites/[dealer]/layout.tsx`, `app/(tenant)/sites/[dealer]/page.tsx`,
  `app/(admin)/(shell)/layout.tsx`, `app/(admin)/(shell)/dashboard/page.tsx`, `app/(admin)/(shell)/settings/payments/page.tsx`,
  `app/(super)/super/businesses/[id]/page.tsx`, `components/super/super-grids.tsx`,
  `components/app-sidebar.tsx`, `components/admin/mobile-nav.tsx`, `components/admin/nav-config.ts`, `components/dashboard/welcome-dialog.tsx`,
  `components/onboarding/industry-picker.tsx`, `components/onboarding/product-carousel.tsx`.
- **Migration:** `drizzle/0023_*.sql` + snapshot: `industry` enum (D3). Edit `lib/db/schema/enums.ts`, `lib/db/schema/dealers.ts`.
- Cabs stays **non-selectable in onboarding** (`adminReady: false`) until Phase 1.

### Step 2 (R2): generic guards
- **New:** `lib/core/guards.ts` exporting `requireIndustry(key)` (admin) and `tenantContext(key)` (tenant actions/routes: resolves slug from `x-tenant-slug`, loads dealer, checks industry, suspension and billing; returns `{dealer, ip}`).
- **Edit:** `lib/restaurant/guard.ts` becomes a wrapper `requireRestaurant = () => requireIndustry("restaurants")`; replace the copied `context()`/`tenant()`/`dealerFor()` in `app/(tenant)/sites/[dealer]/actions.ts`, `app/(tenant)/sites/[dealer]/delivery/actions.ts`, `delivery/t/actions.ts`, `app/api/t/{rider-location,ws-ticket,order-location,track,chat}/route.ts` (the `track` and `chat` routes are not industry-locked today; I keep their current behaviour).
- **Fix isolation lint errors (4 files above):** move their raw-client reads into `lib/tenant/*` / `lib/auth/*` functions (e.g. `lib/tenant/team.ts`, `lib/tenant/settings.ts`) and import those instead.

### Step 3 (R3): composable `scopedDb`
- **Edit:** `lib/db/scoped.ts`: build the returned object from a registry `{ direct: {...}, child: {...} }` so a vertical contributes tables with one line each. Keep `DIRECT_TENANT_TABLES` / `CHILD_TENANT_TABLES` exports (tests import them) and keep every existing method signature and the public `ScopedDb` type unchanged.
- **New:** `lib/db/tenant-tables.ts` (the allow-list), keeps the leak test's "table with `dealer_id`/`car_id` must be registered" rule.
- **Edit tests:** `tests/tenant-leak.test.ts` (derive the table list from the registry instead of the hard-coded array; keep `UPDATE_PAYLOAD` per table, fail when missing).
- Postgres RLS: **not in Phase 0** (Neon HTTP has no session state; revisit in Phase 6). Logged in DECISIONS.

### Step 4 (R4): `lib/core` extraction (move + thin wrappers)
- **tracking:** `lib/core/tracking/{token,session,ws-ticket,live-location,live-socket,route,route-plan}.ts` ← from `lib/restaurant/{tracking,trip,rider-session,ws-ticket,live-location,live-socket,route,route-plan}.ts`. Channel key becomes a generic `entityId`; the Eats wrapper passes the order id, so the Durable Object name stays `<dealerId>:<orderId>` and live deliveries keep working across deploy. `workers/tracker/index.ts` imports `ws-ticket` from the new path (no behaviour change).
- **payments:** `lib/core/payments/{razorpay,apply,refund}.ts` ← from `lib/route/razorpay.ts` and the generic parts of `lib/restaurant/payments.ts`; `createFoodOrder`/`createBookingOrder` keep their names as wrappers and now add `notes.kind`. `app/api/webhooks/razorpay/route.ts` dispatches on `notes.kind` via a handler registry with the D4 fallback. Add a tenant assertion helper `assertSameTenant(order.dealerId, ctx.dealer.id)`; apply it in `confirmOrderPayment` (audit finding S8).
- **geo:** `lib/core/geo/{distance,validate,geocode,route-lookup}.ts` ← from `lib/restaurant/{location,geocode,service-area (distanceKm only)}.ts`. Provider interface only (`GeoProvider`); the Google Places/Routes adapter is Phase 1.
- **status-graph:** `lib/core/status-graph.ts`: `defineStatusGraph({states, transitions})` → `{canMove, next, assert}`; Eats `nextStatuses/timelineFor` keep their exports and are re-implemented on top, verified by the existing `tests/restaurant-orders.test.ts` plus new parity tests.
- Old module paths remain as re-exports so no importer outside the listed files has to change.
- **Tests:** `tests/razorpay-webhook.test.ts` (extend: `notes.kind` dispatch, fallback, unknown kind), `tests/ws-ticket.test.ts` (new path), `tests/route-plan.test.ts`, `tests/core-status-graph.test.ts` (new), `tests/guards.test.ts` (new).

### Step 5: shared rate limiter
- **New:** `lib/core/rate-limit.ts` (`allow(key, limit, windowMs): Promise<boolean>`; DO client with in-memory fallback when no binding), `RateLimiter` Durable Object in `workers/tracker/index.ts` (+ migration entry in `workers/tracker/wrangler.jsonc`), binding in `wrangler.jsonc`, `tests/rate-limit.test.ts`.
- **Edit call sites** (`allow` → `await allow`): `app/(tenant)/sites/[dealer]/actions.ts`, `delivery/actions.ts`, `delivery/t/actions.ts`, `app/api/t/{rider-location,ws-ticket,track,order-location,chat}/route.ts`, `app/(admin)/(shell)/settings/team/actions.ts`, `app/(admin)/onboarding/actions.ts`, plus any others found by grep (`lib/restaurant/*`, `lib/rc/lookup.ts`, `lib/cars/*`). `lib/rate-limit.ts` re-exports the new function.

### Step 6: cron route + trigger worker
- **New:** `app/api/internal/cron/[job]/route.ts` (POST, `Authorization: Bearer ${CRON_SECRET}`, constant-time compare, 404 for unknown job, job registry in `lib/core/scheduler.ts`; jobs registered now: `ping` and `expire-unpaid-orders` wrapping the existing lazy expiry so Eats benefits), `lib/core/scheduler.ts`, `workers/cron/{index.ts,wrangler.jsonc}`, `tests/cron-route.test.ts`.
- **Edit:** `proxy.ts` (allow `/api/internal/cron/*` only on the `admin` host; still 404 on tenant hosts), `.env.example` (`CRON_SECRET`, `CRON_TARGET_URL`), `package.json` (`deploy:cron`; add it to `deploy`), `scripts/upload-secrets.sh` (CRON_SECRET).
- Cron expressions registered in the cron worker's `wrangler.jsonc`: every minute-class job group set to `*/5 * * * *` (pickup reminders later), plus `30 2 * * *` (08:00 IST) daily and `30 0 1 * *` (06:00 IST, 1st of month) stubs that call `ping` until their jobs exist.

### Step 7: notifications outbox skeleton
- **New:** `lib/db/schema/notifications.ts` (`notifications`, `notification_optins`; enums `notification_channel`, `notification_status`), `drizzle/0024_*.sql`, `lib/core/notifications/{types,outbox,channels/wa-link}.ts` (`Channel` interface, `enqueue()`, `wa_link` adapter producing a `wa.me` URL via `lib/whatsapp.ts`), `tests/notifications.test.ts`.
- Both tables carry `dealer_id`, are registered in the Step 3 registry and the leak test. Recipient phone stored encrypted (`recipient_enc`) + HMAC `recipient_hash`; new helper `lib/crypto/blind-index.ts` (HMAC-SHA256 with `BLIND_INDEX_KEY`, new env var) is added here because Phase 1+ needs it. Note: `audit_log` is **not** in Phase 0 (BUILD.md lists it under platform tables, but Phase 5 owns it); say if you want it earlier.

### Step 8: wrap-up
- `docs/tanycabs/DECISIONS.md` (new): D1–D6 outcomes, RLS deferral, any assumptions.
- `docs/tanycabs/progress/phase-0.md`: built / files / migrations / tests / gaps / manual test steps.

## Migrations (2)
1. `0023`: `industry` enum on `dealers`.
2. `0024`: `notifications`, `notification_optins`.
Neither touches Eats/Motors data other than the enum cast.

## Env / config additions
`CRON_SECRET`, `CRON_TARGET_URL`, `BLIND_INDEX_KEY` (all in `.env.example`; production secrets set by you), new Durable Object class `RateLimiter` and a `workers/cron` worker to deploy.

## Risks and how I contain them
- **Live deliveries during deploy:** DO names stay `<dealerId>:<orderId>`; tracker WS ticket format unchanged. Deploy tracker worker first (already the `deploy` script order).
- **`allow()` becomes async:** a missed `await` would silently disable limiting. I will grep every call site and add an ESLint `@typescript-eslint/no-floating-promises` check scoped to files importing it if the existing config allows; otherwise a test that fails when any file calls `allow(` without `await`.
- **Enum migration locks `dealers`:** table is small; single `ALTER`, run in a transaction.
- **Neon HTTP has no transactions** except via the WS pool: nothing in Phase 0 adds new transactional code.
- **Intermediate commits from the baseline grouping:** earlier baseline commits `aa10af1` (products) and `b21ea4d` (auth) were committed in your requested order but may not typecheck in isolation (for example `app/(admin)/onboarding/actions.ts` is in the ai commit because it imports `recommend-product`). Not an issue for bisecting Phase 0 since all Phase 0 commits sit on top of `b98d6fd`, where typecheck and tests pass (lint does not, see Baseline). I did not check whether the individual baseline commits build on their own.

## Out of scope for Phase 0
Any cabs UI, cabs tables, Google Places/Routes adapter, customer login, RLS, WhatsApp sending, `audit_log`, roles.

## Not touched
`.agents/` (untracked; waiting for your call), all `.env*`.
