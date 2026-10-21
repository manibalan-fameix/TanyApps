# Phase 0 report: Foundation refactor

Branch `tanycabs/phase-0-foundation` (from `main` @ `b98d6fd`). 14 commits, 136 files changed. **Nothing is deployed and nothing was run against the Neon database** (one read-only `SELECT` of distinct `dealers.industry` values, as D3 asked). All database testing was on a scratch Postgres 16 on this machine.

Decisions and assumptions are in [DECISIONS.md](../DECISIONS.md). The approved plan is [phase-0-plan.md](phase-0-plan.md).

## Quality gate

| Gate | Before (main) | After |
|---|---|---|
| `pnpm typecheck` | pass | pass |
| `pnpm lint` | **12 errors**, 14 warnings | **0 errors**, 14 warnings (all pre-existing; none in new code) |
| `pnpm test` | 489 passed, 30 skipped | **588 passed**, 41 skipped |
| Everything incl. live-DB tests (scratch Postgres, `TEST_DATABASE_URL`) | not run | **628 passed, 1 failed**: the failure is pre-existing, see Known gaps |
| `pnpm build` (production Next build) | not run | pass |
| `wrangler deploy --dry-run` tracker, cron | n/a | pass |

The skipped tests are the live-database ones, which run only with `TEST_DATABASE_URL`.

## What was built

| Item | Where | Notes |
|---|---|---|
| **Lint baseline** | `components/cars/voice-step.tsx`, `components/auth/dealer-login-form.tsx`, `components/ui/carousel.tsx`, `tests/jarvis-worker.test.ts` | 8 errors fixed. Two `eslint-disable` lines, each with its reason inline. |
| **Firestore deny-all** | `firestore.rules` | App does not use Firestore. See "Do after review". |
| **R1 Vertical registry** | `lib/verticals/*`, `lib/industries.ts` (now a facade), `lib/products.ts`, `lib/plans.ts`, `lib/dealers/onboard.ts`, `lib/route/razorpay.ts`, nav/sidebar/mobile nav/welcome dialog/onboarding wizard/tenant layout/payments page | One typed config per industry (`motors`, `restaurants`, `cabs`). Cabs registered, not selectable. |
| **Industry enum** | `lib/db/schema/enums.ts`, `dealers.ts`, migration `0023` | Cast verified on a DB holding existing rows. |
| **R2 Guards** | `lib/core/guards.ts` (+ `lib/restaurant/guard.ts` wrapper) | Replaced about ten copies of the restaurant check. Fixed the 4 raw-DB-client imports in `app/` via `lib/tenant/{team,settings,user-phone}.ts`. |
| **R3 Composable `scopedDb`** | `lib/db/tenant-tables.ts`, `lib/db/scoped.ts` | Repos built from a registry grouped per vertical; types preserved. |
| **R4 Payments** | `lib/core/payments/{razorpay-api,webhook}.ts`, `lib/route/razorpay.ts` (wrappers), `app/api/webhooks/razorpay/route.ts` | `notes.kind` on every new order; dispatch on kind; counted fallback. |
| **R4 Status graph** | `lib/core/status-graph.ts`, `lib/restaurant/orders.ts` | Eats lifecycle rebuilt on it, with a parity test against the old logic. |
| **R4 Geo + tracking** | `lib/core/geo/*`, `lib/core/tracking/*`, shims in `lib/restaurant/*` | `GeoProvider` interface (Nominatim only). |
| **Rate limiter (D2)** | `lib/core/rate-limit.ts`, `lib/core/rate-window.ts`, `RateLimiter` in `workers/tracker/index.ts`, bindings in both `wrangler.jsonc` files | 45 call sites async. |
| **Cron (D1)** | `workers/cron/*`, `app/api/internal/cron/[job]/route.ts`, `lib/core/scheduler.ts`, `cron_runs` table, migration `0024` | First real job: `expire-unpaid-orders` every 5 minutes. |
| **Outbox + audit (D6)** | `lib/db/schema/{notifications,platform}.ts`, `lib/core/{audit,notifications/*}`, `lib/crypto/blind-index.ts`, migration `0025` | `audit_log` is append-only by DB trigger. |
| **Metrics** | `lib/core/metrics.ts`, `METRICS` Analytics Engine binding | Used by the webhook fallback and the rate limiter. |

## Migrations (apply in order)

1. `0023_nappy_captain_britain.sql`: `dealers.industry` text → enum (hand-reordered: drop default, change type with `USING`, set default).
2. `0024_natural_shockwave.sql`: `cron_runs` + enum.
3. `0025_flawless_mauler.sql`: `notifications`, `notification_optins`, `audit_log`, their enums, and the append-only triggers on `audit_log`.

Tested together on a scratch database that held a `motors` and a `restaurants` dealer first.

## Files touched outside the new code

Changed behaviour-preservingly, all covered by the existing and new tests: `app/(tenant)/sites/[dealer]/{actions,layout,page}.tsx`, `delivery/{actions.ts,t/actions.ts}`, `app/api/t/{rider-location,order-location,ws-ticket}/route.ts`, `app/(admin)/(shell)/{layout,settings/*,menu/*,cars/*}`, `app/(admin)/onboarding/*`, `lib/restaurant/{orders,payments,admin-actions,tracking,location,service-area,live-location}.ts`, `lib/auth/actions.ts`, `lib/super/actions.ts`, `lib/rc/lookup.ts`. The full list is `git diff --stat b98d6fd..HEAD`.

## Tests added

`tests/verticals.test.ts`, `guards.test.ts`, `core-payments.test.ts`, `core-status-graph.test.ts`, `core-geo-tracking.test.ts`, `rate-limit.test.ts`, `cron.test.ts`, `core-platform.test.ts`, plus live-DB `cron.integration.test.ts` and `platform.integration.test.ts`. `tenant-leak.test.ts` was strengthened (see below).

Things the tests caught while building, worth knowing:
- The new leak-test rule ("every table is scoped or declared global") found that **`bookings` was scoped but never covered by the leak test**. Fixed.
- The status-graph parity test found a case I had missed (cancelling a status that is off a fulfilment's timeline) before it was committed.
- Writing the audit redaction test exposed that my first regex would have treated `template` as sensitive (it contains `lat`); it now matches whole words.

## Known gaps and things to watch

1. **Pre-existing failing test:** `tests/cars.integration.test.ts` "enforces the plan's live-car cap" fails on a migrated DB (also on the commit before this phase's changes touched anything it covers). It looks like a stale cap assumption (`DECISIONS.md` Phase 1 says starter is 20 cars; `lib/plans.ts` says 25). Not changed.
2. **Existing bug, left as is:** `refundBookingPayment` for car bookings does not reverse the Route transfer to the dealer (`reverse_all`), unlike food refunds. The platform would be out of pocket on a refund. Noted in the code.
3. **Razorpay `notes` on `payment.captured` is unverified.** If Razorpay does not copy order notes onto the payment entity, every payment takes the counted fallback path. That is safe but means the counter never reaches zero. Check in test mode (below).
4. **Not run on real Cloudflare:** the `RateLimiter` Durable Object, the cron triggers, and `claimRun`'s upsert on Neon's HTTP driver (tested on the `pg` driver). The window algorithm and the lock are tested in Node.
5. **Fail-open/closed is by call site.** Anything not marked `failClosed` fails open. Auth paths are marked and a test pins them, but a new auth path must remember to opt in.
6. **Rate limiter cost:** each check is one Durable Object request with a storage write. Fine at current traffic; revisit if public endpoints get heavy load.
7. **`audit_log` repo exposes `update`/`delete`** through `scopedDb` like every tenant table; the database trigger is what blocks them. A future cleanup could give append-only tables a repo without those methods.
8. **Still hard-coded on purpose** (Eats/Motors-specific features, not vertical dispatch): `OrderAlertsProvider` in the admin layout, the restaurant dashboard branch, `restaurantPage()`, and public-page `industry !== "restaurants"` checks in `contact`/`o/[code]`. They are typed comparisons and cabs is not selectable, so none can misfire today.
9. **`enqueue()` ignores opt-ins** and there is no sender worker; both are Phase 4.
10. **`resetTeammatePassword` gained a rate limit** it did not have before (same `team:` key as adding a teammate, fail-closed).
11. **Behaviour change to be aware of:** the rate-limit IP is now `cf-connecting-ip` first. On Cloudflare this is strictly harder to spoof; behind any other proxy it would be absent and the old header is the fallback.
12. 14 lint warnings remain, all in code this phase did not write.

## Do after review (needs you)

**Merge and deploy order matters** because the app binds to the tracker worker's new class.

1. Review/merge `tanycabs/phase-0-foundation`. Nothing has been pushed.
2. **Secrets and keys (production values):**
   - `openssl rand -base64 32` → `CRON_SECRET` (set on the app **and** on the cron worker).
   - `openssl rand -base64 32` → `BLIND_INDEX_KEY` (app only). Back it up like `ENCRYPTION_KEY`; do not reuse its value.
   - Put both in `.env.local` and run `bash scripts/upload-secrets.sh` (now also uploads `CRON_SECRET` to the cron worker), or use `wrangler secret put` per worker.
3. **Migrations on Neon:** `pnpm db:migrate` (0023 to 0025). 0023 takes a brief lock on `dealers`; the table has 13 rows. Take a Neon branch or snapshot first.
4. **Deploy in this order:** `pnpm deploy:tracker` (adds the `RateLimiter` class via migration `v2`), then the app (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`), then `pnpm deploy:cron`. `pnpm deploy` now runs all three in that order.
5. **Firestore rules** (deny-all; I did not deploy):
   ```
   npx firebase-tools deploy --only firestore:rules --project tany-6c638
   ```
   The old rule expires on 2026-11-19 anyway; this removes the open window now. Firebase Auth is unaffected. (`firebase-tools` is not a project dependency, hence `npx`; log in first with `npx firebase-tools login`. If the project has no Firestore database yet, the command will say so and there is nothing to protect.)
6. **Confirm the Razorpay notes behaviour in test mode:** place one test online food order, pay it, then look in Workers logs for `razorpay_webhook_fallback`. No line means notes arrive and dispatch works by kind. A line means notes are not copied to the payment (gap 3).

## Manual test steps (local)

1. `pnpm typecheck && pnpm lint && pnpm test`: expect pass / 0 errors / pass.
2. Scratch-DB tests: create a Postgres, set `DATABASE_URL`, `pnpm db:migrate`, then `TEST_DATABASE_URL=... pnpm exec vitest run tests/cron.integration.test.ts tests/platform.integration.test.ts tests/tenant-leak.integration.test.ts`.
3. Eats still works: `pnpm dev`, open a restaurant tenant (`pnpm db:seed-restaurant` first), add to cart, place a cash order, change its status in the admin orders page. Check a delivery partner can open `/delivery`, sign in and open a rider link. (I ran no browser flows; only the automated tests and the build.)
4. Motors still works: seeded dealer showroom lists cars; admin sidebar and phone tab bar show the car links; restaurants show the menu/orders links.
5. Cron by hand (needs `CRON_SECRET` and the `app.` host):
   `curl -X POST -H "Host: app.localhost:3000" -H "x-cron-secret: $CRON_SECRET" -H "x-cron-slot: $(date -u +%Y-%m-%dT%H:%M:00Z)" localhost:3000/api/internal/cron/ping`
   First call `{"ran":true}`; the same call again `{"ran":false,"reason":"already_ran"}`.

## What Phase 1 can now rely on

- `INDUSTRY_KEYS` already includes `cabs`; flipping `adminReady` to true and filling the cab nav in `ADMIN_NAV` is how the vertical goes live.
- New tenant tables: add to a `DIRECT` group in `lib/db/tenant-tables.ts`, add an `UPDATE_PAYLOAD` line in `tests/tenant-leak.test.ts`; the tests will not let you forget.
- `requireIndustry("cabs")` / `tenantContext("cabs")` for guards, `rateLimit()` (awaited), `audit()`, `enqueue()`, `defineStatusGraph()`, `createRouteOrder()` (add a `cab_trip` kind to `PaymentKind` and a handler), `getGeoProvider()` (add the Google provider), `JOBS` (add jobs, and their schedule in `workers/cron`).

## Correction added during Phase 1

The deploy steps above tell you to run `bash scripts/upload-secrets.sh` for `BLIND_INDEX_KEY`, but the script's key list did not include it, so the key would never have reached Cloudflare. Fixed on the Phase 1 branch (the script now sends it, and `scripts/predeploy-check.sh` blocks a deploy when `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `CRON_SECRET` or `TRACKER_SECRET` is empty in `.env.local`).
