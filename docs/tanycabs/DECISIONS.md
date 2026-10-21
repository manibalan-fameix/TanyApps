# TanyCabs decisions and assumptions

Newest phase last. Each entry says what was decided, why, and what would reverse it. Product decisions are the owner's; technical choices were made by the implementer and are marked as such.

## Phase 0: foundation

### Owner decisions (2026-10-21)

- **D1 Cron.** A separate `workers/cron` worker fires the schedules and calls `POST /api/internal/cron/<job>`. Every job must be idempotent and takes a lock row (job name + scheduled slot, table `cron_runs`). The shared secret travels in the `x-cron-secret` header, never in the URL, and is compared in constant time (`lib/core/secure-compare.ts`).
- **D2 Rate limiter.** A Durable Object (`RateLimiter`, hosted in the tracker worker) named by a hash of the limit key, so each key has its own object. If it is unreachable: **fail closed** for authentication paths (rider/driver PIN, OTP/phone verification, teammate and super login, team password), **fail open** elsewhere, and count and log every failure. The in-memory limiter is only the no-binding development fallback. All call sites were converted to async in one commit.
- **D3 Industry enum.** `dealers.industry` is a Postgres enum with exactly `motors`, `restaurants`, `cabs`. The values in the database before migrating were `motors` (8 dealers) and `restaurants` (5).
  **Future verticals add a value with `ALTER TYPE industry ADD VALUE '<key>'` in their own migration**, plus an entry in `lib/verticals/keys.ts` (the enum is built from it) and a vertical file registered in `lib/verticals/index.ts`. A test fails if the enum and the key list drift apart.
- **D4 Webhook.** Razorpay orders carry `notes.kind` (`eats_order`, `motors_booking`), and the webhook dispatches on it. Orders created before this change have no kind and take the old Eats-then-Motors lookup. Every fallback hit is logged and counted as `razorpay_webhook_fallback` (Analytics Engine dataset `tany_platform_metrics`, plus a structured log line). When the counter has been zero for longer than the 20-minute payment window plus a margin, delete the fallback branch in `lib/core/payments/webhook.ts`.
- **D5 Lint.** Fixed the 8 non-isolation lint errors properly. Three `eslint-disable` lines remain, each with the reason inline: the login redirect restore (`components/auth/dealer-login-form.tsx`), and two Embla syncs in `components/ui/carousel.tsx`. The 4 raw-DB-client imports were fixed in the guards step.
- **D6 Outbox + audit.** Notifications outbox as scoped, plus `audit_log` and an `audit()` helper in Phase 0. BUILD.md §5 updated.
- **`.agents/`** is git-ignored (a duplicate of `.claude/skills`).
- **Firestore** is not used by the app (checked `app`, `components`, `lib`, `hooks`, `workers`, `scripts`, `tests`); rules were replaced with deny-all.

### Technical decisions (implementer)

- **Vertical registry holds data only** (no icons, no JSX), so server, browser and proxy can all import it. Admin navigation, which needs icons, is a `Record<IndustryKey, AdminNavSpec>` in `components/admin/nav-config.ts`, so adding an industry fails to compile until its navigation is described.
- **Cabs is registered but not selectable.** `adminReady: false` keeps it out of `LIVE_INDUSTRY_KEYS`, the onboarding schema, the live-product list, and the public tenant site (the tenant layout 404s a vertical that is not ready).
- **Razorpay category for cabs is a placeholder** (`transport` / `taxi`) in `lib/verticals/cabs.ts`. It must be checked against Razorpay's category list before the first cab operator is onboarded. Nothing uses it yet.
- **Cab plan limits and prices are not decided.** `planLimitLabel("cabs", …)` returns a placeholder sentence; no cab pricing was invented.
- **Client IP for rate limiting** now prefers `cf-connecting-ip` (set by Cloudflare, not forgeable by the client) over the first `x-forwarded-for` entry (client-controllable). This is a deliberate small behaviour change in `lib/core/guards.ts`.
- **Razorpay plan description** no longer says "Up to N live cars" (the plan is shared by every industry). It only affects plans created from now on; existing plans are found by `notes.key` and unchanged.
- **Checkout confirmation checks the tenant.** `applyOrderPayment` takes an optional expected dealer; the guest checkout passes the host's dealer, the webhook does not. A payment for another restaurant's order is treated as not found (audit finding S8).
- **Tracking is moved only as far as Cabs needs it.** Moved to `lib/core/tracking`: link tokens and fixes, WS tickets, the browser socket, route cache, Durable Object access (with a vertical-supplied fallback store). Left in `lib/restaurant`: the rider PIN session and `orderByRiderToken` (`rider-session.ts`, `trip.ts`) because cab drivers will sign in with the central phone-OTP login (BUILD.md Phase 3), not a PIN. Durable Object names stay `<dealerId>:<entityId>`, so live deliveries survive the deploy.
- **Old module paths still work.** Moved files leave one-line re-export shims in `lib/restaurant`, so nothing outside the moved code had to change. `lib/rate-limit.ts` is the exception: it was **deleted** and replaced by `lib/core/rate-limit.ts` (`rateLimit`, async) so a missed `await` cannot silently disable a limit (a Promise is always truthy). A test scans the source for the old name and for un-awaited calls.
- **`GLOBAL_TABLES`.** Tables that are deliberately not tenant-scoped (`dealers`, `users`, `accounts`, `variants`, `cron_runs`) are listed explicitly in `lib/db/tenant-tables.ts`; the leak test fails for any schema table that is neither scoped nor listed there.
- **`audit_log.dealer_id` has no ON DELETE CASCADE**, like `price_events`: a business with history cannot be hard-deleted by accident. A real data-deletion flow (the privacy page promises one) will need its own design for what happens to audit rows.
- **Postgres row-level security is deferred.** Neon over HTTP has no session state for `SET LOCAL`; revisit in Phase 6 with the transaction (WebSocket) path.
- **`proxy.ts` needed no change for cron.** `/api/internal/*` is already unreachable on tenant and marketing hosts (404) and reachable on the app host.
- **Notification channel priority.** `wa_link` is `link_ready` immediately and builds its link on demand from the encrypted recipient; the phone number is never stored in `payload`. Other channels stay `pending` until Phase 4's sender exists. `enqueue()` does not check opt-ins yet (the sender will).

### Verified vs not verified

- Verified by running: all migrations on a scratch Postgres 16 (including the enum cast of existing rows and the append-only triggers), the lock under concurrent claims, the cron route on a production `next build` through the proxy, `wrangler deploy --dry-run` for the tracker and cron workers.
- **Not verified (needs a real Cloudflare deploy):** the `RateLimiter` Durable Object and the cron triggers themselves; that Razorpay copies an order's `notes` onto `payment.entity.notes` in `payment.captured` (if it does not, every payment simply takes the counted fallback path, which is safe); `claimRun`'s upsert on Neon's HTTP driver (tested on the `pg` driver).
