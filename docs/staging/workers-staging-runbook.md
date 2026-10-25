# Cloudflare Workers staging: the run that has not happened yet

**Nothing here has been run.** Every Node-based test in this repository talks to Neon from a laptop. None of them proves that the application
works inside the Cloudflare Workers runtime, which is what production is. This is the run that does. It needs the owner's explicit go-ahead
and deploys only to the isolated **staging** Workers (`tanyapps-staging`, `tanyapps-tracker-staging`, `tanyapps-cron-staging`) on `tanystaging.in`.

## Preconditions

- Staging exists as in `docs/tanycabs/STAGING.md`: the `tanystaging.in` zone is active, `.env.staging` is complete, the staging Neon database is migrated (`pnpm db:migrate:staging`), secrets are uploaded (`pnpm secrets:staging`).
- `RAZORPAY_*` in `.env.staging` are **test** keys and the test-mode webhook points at `https://app.tanystaging.in/api/webhooks/razorpay`.
- A clean working tree on the release branch (the predeploy check requires it).
- `pnpm run deploy:preflight staging` prints "Preflight passed. Nothing was deployed." It checks the key mode, the database host, the domains and routes, the worker names, the cron target, and that your Cloudflare login can see the right account.

## Deploy (guarded; there is no default environment)

```bash
pnpm run deploy:preflight staging
pnpm run deploy staging --dry-run     # prints exactly what will run
pnpm run deploy staging               # tracker, then app, then cron, each with --env staging
```

## What to verify, and how

| # | Check | How | Pass when |
|---|---|---|---|
| W1 | OpenNext starts; pages render | open `https://app.tanystaging.in` and a tenant site `https://<slug>.tanystaging.in` | 200, no 5xx in `wrangler tail --env staging` |
| W2 | Tenant resolution | a tenant host, a custom domain if configured, an unknown host, `/api/internal/*` on a tenant host | correct site; 404 for unknown and for internal routes on tenant hosts |
| W3 | Database from Workers (HTTP) | load a page that reads the database | data shown; no "connection" errors |
| W4 | **WebSocket transactions from Workers** | make a booking (cab request) or place an order | succeeds; no I/O-context or "cannot perform I/O on behalf of a different request" errors. **This is the one most likely to expose a problem the Node tests cannot.** |
| W5 | Server Actions | submit the booking and order forms | succeed |
| W6 | Payment webhook | pay with a test card (runbook R1/E1) | webhook 200; order paid; signature failure returns 400 |
| W7 | Cron authentication | call the cron route with no secret, wrong secret, correct secret | 401, 401, 200 |
| W8 | Scheduled invocation | wait for the next minute and five-minute marks | `cron_runs` rows appear and are `done` for `expire-trip-holds`, `expire-unpaid-orders`, `retry-booking-refunds`, `retry-order-refunds` |
| W9 | Refund retry job | runbook R6 / E4 | a refund owed or pending is completed or followed once, not duplicated |
| W10 | Hold expiry | request a cab booking and let it pass its window | status becomes `expired`, customer and operator notified once |
| W11 | R2 | upload a photo as a dealer | object in the staging bucket; served from `cdn.tanystaging.in` |
| W12 | Durable Objects | a delivery tracking link; the rate limiter | location updates; rate limit enforced |
| W13 | Runtime limits | watch CPU time and memory for the heaviest request (a booking) | no "exceeded CPU/memory" in logs |
| W14 | Errors observable | cause a handled failure (wrong key on purpose) | it appears in `wrangler tail`, in the metrics, and in Payment exceptions where it concerns money |

## Measurements to take (record the numbers; do not assume them)

From the Cloudflare dashboard's Workers metrics and from timing the calls yourself, from a client in India, **with the staging database in the same region as production's**
(the current staging project is in `us-east-2`; the other Neon project is in `ap-southeast-1`; latency measured against the wrong region predicts nothing):

| Measure | How | Target to confirm (not a promise) |
|---|---|---|
| Booking request (cab), end to end | 30 requests, p50 / p95 | p95 under 3 s |
| Order placement (Eats), end to end | 30 requests | p95 under 3 s |
| Transaction cost on Workers | time the claim transaction in the logs | p95 under 1 s in-region; if far higher, **then** consider a pooler/Hyperdrive, with this measurement as the evidence |
| Webhook response time | Workers log duration for `order.paid` | p95 under 2 s (Razorpay waits a few seconds before retrying **[verify its timeout]**) |
| Refund reconciliation delay | time from a refund becoming owed to `refund_status` set | under 10 minutes (two cron cycles) |
| Cron duration | `cron_runs` finish minus start | `expire-trip-holds` under 15 s; the others under 30 s |
| Error rate under 20 concurrent bookings | run the concurrency script below | 0 duplicate paid bookings, 0 duplicate refunds, 5xx under 1% |

Do not add Hyperdrive, replicas or partitioning to improve a number that already meets its target.

## Complete flow to run once

Customer opens the site -> books (cab) / orders (Eats) -> pays (test card) -> webhook arrives -> database updated -> notification link created -> cancel and refund -> refund job completes it -> the Payment exceptions page stays empty. Capture the booking/order id, payment id and refund id at each step with names and phone numbers redacted.
