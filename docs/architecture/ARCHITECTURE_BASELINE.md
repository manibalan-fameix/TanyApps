# Architecture baseline

Measured on branch `arch/hardening-pass` (from `main` @ 13fef4f, clean tree), 2026-10-26. Everything below was read from the repo, not inferred from folder names. Areas not inspected in depth are listed at the end; treat them as unaudited.

## Baseline results (before any change)

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 29 warnings (unused vars/directives, ref-cleanup hints) |
| `pnpm test` (no database) | 62 files passed, 17 skipped; **1042 passed, 249 skipped** |
| `pnpm test:db test` (local disposable Postgres 16 `tany_test`, migrations applied) | 79 files; **1291 passed, 0 failed, 0 skipped** |
| `pnpm build` | not run at baseline; passes after changes (see IMPLEMENTATION_REPORT) |

The "~1,133 tests against Neon staging" figure in the brief is not reproducible from this checkout; the actual current number is 1291. No Neon staging run was made (no credentials used).

## Shape of the system (verified)

- **Modular monolith**, Next.js 16 on Cloudflare Workers via OpenNext. Three Workers beside it: `workers/tracker` (Durable Objects: `OrderTracker`, `RateLimiter`), `workers/cron` (scheduled trigger → `/api/internal/cron/<job>`), `workers/jarvis` (internal ops assistant, not audited).
- **Routing**: `proxy.ts` (Next 16 "proxy") resolves the host. `<slug>.<root>` and *verified* custom domains rewrite to `app/(tenant)/sites/[dealer]`; `app.<root>` serves admin; direct `/sites/*` is 404; client-supplied `x-tenant-slug` is deleted and re-set by the proxy; tenant hosts can only reach `/api/t/*`.
- **Tenant data access**: `scopedDb(dealerId)` (`lib/db/scoped.ts`) is the only repository API for tenant tables; every read/update/delete is ANDed with the scope, inserts force `dealer_id` (or verify car ownership for child tables), updates strip `dealer_id`/`car_id`. ESLint blocks the raw client from `app/`, `components/`, `hooks/`, `proxy.ts`. `tests/tenant-leak*.test.ts` proves it per registered table and fails when a table with `dealer_id` is not registered (`lib/db/tenant-tables.ts`).
- **Identity**: Auth.js (JWT sessions) for business users; Firebase phone/social for customers; memberships in `dealer_users` with `owner`/`staff` roles; `canRefund` in `lib/core/permissions.ts` is enforced in server actions. Dev bypass and local password login are gated on `NODE_ENV === "development"`.
- **Money**: Razorpay. Subscriptions (Tany → business) in `lib/billing`; customer payments (business ← customer, Razorpay Route) in `lib/bookings` (Motors) and `lib/restaurant/payments.ts` (Eats). One webhook route verifies the HMAC over the raw body, then `dispatchPaymentEvent` routes by `notes.kind`.
- **Background**: `lib/core/scheduler.ts` runs named jobs once per (job, slot) via a lock row; jobs include booking-refund retry, order-refund retry, unpaid-order expiry, trip-hold expiry. `pg-boss` handles the video queue.
- **Media**: R2 behind `lib/storage`; photos uploaded through `/api/upload` (same-origin), videos by presigned URL; cab paperwork in a separate private bucket served only by `/api/cabs/files`.
- **Observability**: `countMetric` → structured `console.warn` JSON + optional Analytics Engine binding; `audit()` writes an append-only `audit_log`; `payment_exceptions` table surfaces money that needs a person.
- **CI**: none for tests before this pass (only two Jarvis issue workflows).

## Findings

| # | Pri | Finding | Where | Status |
|---|---|---|---|---|
| F1 | P1 | Three routes used their own IP helper preferring client-controllable `x-forwarded-for`, so the per-IP limit on the LLM chat endpoint (and view tracking, RC lookup) could be bypassed by rotating a header. Per-dealer caps still bounded the damage. | `app/api/t/chat/route.ts`, `app/api/t/track/route.ts`, `app/(admin)/(shell)/cars/actions.ts` | **Fixed** |
| F2 | P1 | A late/out-of-order Razorpay `authenticated`/`active` event could overwrite `cancelled`/`completed`/`expired`, making `hasPaymentMethod` true and granting grace access. `paidThrough` was already monotonic. | `lib/billing/service.ts` | **Fixed** |
| F3 | P1 | Photo upload trusted the `Content-Type` header (no byte check) and buffered the whole body when `Content-Length` was absent. | `app/api/upload/[...key]/route.ts` | **Fixed** |
| F4 | P2 | No baseline security headers (nosniff, frame, referrer, permissions, HSTS). | `next.config.ts` | **Fixed** (no CSP; see SECURITY_AND_TENANCY) |
| F5 | P1 | No CI: typecheck, lint and 1291 tests ran only on a developer machine. | `.github/` | **Added** (unverified on GitHub) |
| F6 | P2 | No per-tenant attribution of paid external calls (LLM chat, vision OCR, RC lookup). | `lib/core/` | **Fixed** (maps not covered) |
| F7 | P2 | Cross-product imports: shared UI (`DataGrid`, `ImageUpload`, `PageHeader`, `google-map`, `optionsFilter`/`gridTheme`) lives inside `components/restaurant` and `components/cars` and is used by cabs; `lib/cabs/admin-actions` imports `lib/restaurant/images`; `lib/core/geo` imports `lib/cabs/states`; `lib/core/jobs` import cabs/restaurant. | see `tests/architecture-boundaries.test.ts` | **Ratcheted**, not moved |
| F8 | P1 | **Corrected in pass 2.** `pnpm audit` reported 41 advisories (3 critical, 13 high). The criticals were on the app's *own* `next` 16.3.4 (RCE in image optimization, `use cache`, `next/og`), not on a nested copy as first written. | `package.json` | **Fixed** (41 → 2, none in the runtime): see `DEPENDENCY_ADVISORIES.md` |
| F12 | **P0** | Any business owner could become super admin: the guard trusted `users.email`, which `addTeammate` lets an owner set or take over. | `lib/super/guard.ts`, `lib/auth/index.ts`, `settings/team/actions.ts` | **Fixed** (pass 2) |
| F13 | P1 | `addTeammate` overwrote the password of existing self-registered users. | `settings/team/actions.ts`, `lib/tenant/team.ts` | **Fixed** (pass 2) |
| F14 | P1 | Jarvis passphrase compared before any throttle (unlimited guessing). | `workers/jarvis/index.mjs` | **Fixed** (pass 2) |
| F15 | P1 | Video worker had no duration cap or process timeout. | `workers/video.ts` | **Fixed** (pass 2) |
| F16 | P2 | `/api/cars/from-video` parsed an unbounded multipart body. | `app/api/cars/from-video/route.ts` | **Fixed** (pass 2) |
| F9 | P3 | No request/correlation id in logs (Cloudflare `cf-ray` exists at the edge but is not logged). | `lib/core/metrics.ts`, `proxy.ts` | Recommended |
| F10 | P2 | `lib/tenant/lists.ts` reads every dealer of an industry unbounded (used by sweeps). Fine at pilot scale; page it before thousands of tenants. | `lib/tenant/lists.ts` | Recommended |
| F11 | P3 | Subscription webhook has no persisted event id; correctness relies on idempotent handlers (status/paidThrough monotonic). Acceptable; add an event table only if a non-idempotent subscription side effect is introduced. | `app/api/webhooks/razorpay/route.ts` | Recommended |

## Verified as already correct (retained unchanged)

Webhook signature over raw body with constant-time compare; 503 when secret missing. Cron endpoint: shared secret in header, constant-time compare, slot-skew bound, `(job, slot)` run-once lock. Motors booking: car claim `live→on_hold` as serialisation point, conditional `created→paid`, one-paid-booking unique index as backstop, duplicate-payment and lost-car refunds with stable idempotency keys, refund state machine that never reports `processed` unless Razorpay does. Eats payments follow the same pattern. Private cab documents: key shape parsed strictly, owner-only, `nosniff` + sandbox CSP, magic-byte sniffed on upload. Tracker: signed role-scoped tickets, one Durable Object per `dealerId:orderId`, origin check, 1 s update gap, India bounds, stale-fix rejection, single rider connection, 6 h self-delete. Rate limiter: Durable-Object-backed, fail-closed on auth paths. Disposable-DB guard (4 independent checks) untouched.

## Pass 2 audit coverage

The previously unaudited areas are covered in `AUDIT_COVERAGE_PASS2.md`. Still not audited: Playwright coverage of cab flows beyond the existing suites, Razorpay Route onboarding (`lib/route`), super-admin data queries beyond the guard, the notification outbox, and the Firebase client-side login UI.

## Not audited in pass 1 (superseded by the above where noted)

Every admin server action's role check beyond the central helpers and the money paths; TanyCabs fare/booking internals and cab tracking (the tracker Worker serves Eats deliveries; no cab WebSocket was found or inspected); Jarvis worker; super-admin surface; video worker; Firebase customer-auth flow; Razorpay Route onboarding; Playwright e2e suites (not run).
