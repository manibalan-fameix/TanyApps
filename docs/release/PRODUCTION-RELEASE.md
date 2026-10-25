# Production release package: payments, inventory, bookings and operations

**Nothing in this document has been run against production.** Steps that touch production are marked **[PROD]** and need the owner's explicit
authorization. The release manifest (exactly which files) is `docs/release/MANIFEST.md`.

## 1. Gates

| Gate | Status | Evidence |
|---|---|---|
| TypeScript | PASS | clean |
| ESLint | PASS | 0 errors (2 warnings in two unrelated test files; 4 in workers this work did not touch) |
| Next.js production build | PASS | `pnpm build` exit 0, includes `/super/payments` |
| Unit tests, no database | PASS | 1033 passed, 249 skipped (the live-database tests, by design) |
| Full suite, local PostgreSQL 16, restricted guarded role | PASS | 1282/1282, five consecutive runs, and once more on a brand-new database (all migrations from scratch) |
| Full suite, **real Neon** (PostgreSQL 18, HTTP + WebSocket driver) | PASS | 78 files, 1282/1282, 0 skipped, 285 s |
| Concurrency-heavy money suites repeated on Neon | PASS | 7 files, 96/96, twice in a row |
| Neon driver checks (rollback, `23505` + constraint name, locking) | PASS | `pnpm test:db neon-check`, 5/5 |
| Migrations `0000`-`0032` on Neon from scratch | PASS | 33 recorded, 49 tables, every new index/column present; schema equals Drizzle's (`drizzle-kit generate` finds nothing) |
| Migrations additive, ordered, journal and snapshots agree | PASS | `tests/migrations.test.ts`; no table rewrite (measured: `ADD COLUMN ... NOT NULL DEFAULT 0` leaves the relfilenode unchanged) |
| Refund authorization (owner only), cross-tenant and forged-id negatives | PASS | `tests/refund-authorization.integration.test.ts`, mutation-checked |
| Eats refund recovery independent of webhooks | PASS | `tests/eats-refund-recovery.integration.test.ts` (17), `tests/cron-financial.integration.test.ts` (14) |
| Deployment guard (no default environment, key mode, account, consent) | PASS | `tests/deploy-guard.test.ts` (28, including the CLI end to end) |
| Razorpay **mocked** tests | PASS | the fake replays refunds by idempotency key; labelled as mocked |
| Razorpay **real test mode** | **NOT RUN** | needs the owner's approval; `docs/staging/razorpay-test-mode-runbook.md` |
| Cloudflare **Workers runtime** (staging) | **NOT RUN** | needs the owner's approval; `docs/staging/workers-staging-runbook.md`. Only bundle-only `--dry-run` builds were done |
| Production read-only validation | **NOT RUN** | no production access was used |
| Video processing | **EXCLUDED FROM LAUNCH** | no worker host; see `docs/release/video-worker-hosting.md` |

## 2. What this release changes (beyond what earlier notes listed)

- **Refunds are owner-only**, enforced on the server (Motors booking refund; Eats cancel-and-refund of a paid online order). Team add/remove/reset are audited. `lib/core/permissions.ts` is the one place to widen it.
- **Eats refunds recover on their own** (`retry-order-refunds`, every 5 minutes): crashed claims, released refunds, pending refunds followed to processed, stable refund key, attempt limit, final failures stop and are surfaced. The guest page says "is being refunded" until Razorpay says processed.
- **Payment exceptions** (`payment_exceptions`, `/super/payments`): unmatched payments, double charges, failed or stuck refunds, failing webhooks, one row each, closed automatically when they clear, resolved by a named Tany team member with a note.
- **Lost notifications are recovered:** the scheduled jobs ask Razorpay (read-only) whether a stale order or booking was paid, and apply it as a webhook would. A Razorpay outage changes nothing.
- **Deployment guard:** `pnpm run deploy <staging|production>` is the only door to Cloudflare. No default environment; production needs `--secrets-file`, `--confirm "deploy production tany.in"` and `--migrations-applied`.
- **Logs:** failed-query messages (which contain buyer names, phone ciphertext and payment ids) are sanitised everywhere money is handled.
- **Video:** a saved-but-unprocessed video shows an honest "waiting" state; nothing is attempted inside Workers; the worker host configuration is prepared (`deploy/video-worker/`) but not provisioned.

## 3. Migrations

| # | Change | Safe because | Reversal |
|---|---|---|---|
| `0029` | `customer_identities` | new table, nothing reads it yet. **Your own untracked work; `0030`+ depend on it.** | `DROP TABLE customer_identities` |
| `0030` | `refund_pending` status; six nullable refund columns on `bookings`; partial unique index (one paid booking per car) | additive. **Aborts with a clear message, changing nothing, if a car already has two paid bookings.** | drop the index; columns harmless; **an enum value cannot be removed** |
| `0031` | partial index `trips_hold_alert_idx` | index only | `DROP INDEX trips_hold_alert_idx` |
| `0032` | `payment_exceptions` table; `orders.refund_id`, `refund_status`, `refund_error` (nullable) and `refund_attempts integer NOT NULL DEFAULT 0` | additive; the default-0 column is metadata-only on PostgreSQL 11+ (measured: no rewrite) | drop the table and columns |

Index builds are not `CONCURRENTLY`: they take a brief write lock. The tables are small; use `CONCURRENTLY` (outside the migration transaction) if `trips` or `orders` are large when a later index is added.

**Old app with the new schema (between migrate and deploy):** works, except that a second buyer's payment for a car that is already paid hits the new unique index, errors, and Razorpay retries until the new app is live (then the loser is refunded). Keep the window short.
**New app with the old schema:** breaks (missing columns): **migrate first.**
**Rolling the app back:** safe once no booking is `refund_pending` and no order is mid-refund; otherwise finish those by hand first.

### Read-only pre-flight on production **[PROD]** (SELECT only)

```sql
-- 1. The migration's own guard. Must return no rows.
SELECT car_id, array_agg(id) AS bookings FROM bookings WHERE status = 'paid' GROUP BY car_id HAVING count(*) > 1;
-- 2. Booking states (anything unexpected?), and sizes (to judge index build time).
SELECT status, count(*) FROM bookings GROUP BY status ORDER BY 1;
SELECT count(*) FROM trips; SELECT count(*) FROM orders;
-- 3. Eats refunds already in a bad state before the new monitoring starts.
SELECT count(*) FROM orders WHERE payment_status = 'refunding';
SELECT count(*) FROM orders WHERE status = 'cancelled' AND payment_method = 'online' AND payment_status = 'paid';
-- 4. Online orders and bookings waiting for payment that might in fact have been paid (the new job will look at these).
SELECT count(*) FROM orders WHERE status = 'pending_payment' AND razorpay_order_id IS NOT NULL;
SELECT count(*) FROM bookings WHERE status = 'created' AND created_at > now() - interval '7 days';
```

**If query 1 returns rows: change nothing automatically.** Per car: find in the Razorpay dashboard which payment is the legitimate one, refund the other **there**, then set that booking's status to `refunded`
(keeping its history), and only then migrate. Never delete a booking.

## 4. Configuration

Run `pnpm run deploy:preflight production --secrets-file <path>` yourself; it names every problem and prints no secret. Specific to this release:

- `RAZORPAY_KEY_ID` is `rzp_live_...`; `RAZORPAY_WEBHOOK_SECRET` matches the **live** webhook, which has **`order.paid` and `payment.captured`** enabled and points at `https://app.tany.in/api/webhooks/razorpay`.
- `CRON_SECRET` is the same value on the app and on the cron worker; `CRON_TARGET_URL` is `https://app.tany.in`.
- Route linked accounts are activated for every dealer that takes online payments.
- `VIDEO_QUEUE_ENABLED` unset (or `0`). Do not set `1` without a Workers proof.
- On **developer machines** (never on the app): `TANY_PRODUCTION_DB_HOSTS` holds the production database host(s), so the test suite refuses them.
- `SUPER_ADMIN_EMAILS` lists exactly the people who may resolve payment exceptions.

## 5. Deployment order **[PROD]**

1. **Read-only validation and recovery readiness:** section 3 pre-flight; section 8 backup. `pnpm run deploy:preflight production --secrets-file <path>`.
2. **Additive migrations:** with `DATABASE_URL` set explicitly to the **direct** production host, `node node_modules/drizzle-kit/bin.cjs migrate`. Check the host first (print the host only).
3. **Application, then cron worker, in one guarded command:**
   ```bash
   pnpm run deploy production --secrets-file <path> --confirm "deploy production tany.in" --migrations-applied
   ```
   It runs `scripts/predeploy-check.sh production` (clean tree, typecheck, lint, tests), then the tracker, the app, then the cron worker, each with the environment spelled out. Add `--dry-run` first to see the steps.
   The order matters: the cron worker must come after the app, or Cloudflare calls jobs the app does not have yet.
4. **Smoke tests** (section 7).
5. **Monitoring, then controlled enablement of real money** (section 9): one or two friendly businesses, small amounts, for a day.

A mistaken `pnpm run deploy` (no environment), `pnpm run deploy prod`, or a production deploy without the confirmation, the migrations statement, a live key, or the right Cloudflare account **deploys nothing** and says why. (`pnpm deploy` without `run` is a different, built-in pnpm command.)

## 6. Who is responsible for failed refunds

| Situation | Who acts | How | When |
|---|---|---|---|
| A refund is owed or pending | nobody: the five-minute jobs do it | automatic | within ~10 minutes |
| `/super/payments` shows an item | **a named Tany operations person** (assign one before launch) | read the "what to do" text, act in the Razorpay dashboard, Resolve with a note | check at least daily; the same day for *refund failed* and *unmatched payment* |
| A dealer asks about a refund | the dealer's **owner** (staff cannot refund) | the Refund button; Retry if shown | |
| Razorpay says a refund failed | the operations person | usually the linked account's balance or the payment's state; fix it, refund by hand, resolve | same day |
| A guest says they were charged and have no order | the operations person | search Razorpay for the payment id; it will be an *unmatched payment* entry if our side never saw it | same day |

## 7. Post-deployment smoke tests (no real money)

- `POST https://app.tany.in/api/webhooks/razorpay` with no signature -> **400**.
- `POST https://app.tany.in/api/internal/cron/retry-order-refunds` with no secret -> **401**; the same path on a dealer's `*.tany.in` host -> **404**.
- Within 5 minutes the latest `cron_runs` rows for `retry-booking-refunds`, `retry-order-refunds` and `expire-unpaid-orders` are `done`; `expire-trip-holds` within a minute.
- `/super/payments` loads for a Tany team member and shows "Nothing needs attention" (or the real items), and 404s for anyone else.
- The Tany team's **Bookings** grid shows the **Refund** and **Needs attention** columns.
- A dealer's staff user does **not** see the Refund button; the owner does.
- Workers logs show no `database error`, no payment ids, no buyer names.
- Razorpay dashboard: webhook deliveries to the live URL are 2xx.

## 8. Backup and restore **[PROD]**

- Before migrating, record the exact UTC time and confirm in the Neon console that point-in-time restore covers it **[verify the plan's retention window]**.
- Logical copy of the tables the migrations touch, with the connection supplied through the environment: `pg_dump --format=custom --table=bookings --table=cars --table=leads --table=trips --table=orders --file=pre-release.dump "$PROD_DIRECT_URL"`. Keep it encrypted and out of the repository.
- Restoring one business without rolling back the others: every tenant table carries `dealer_id` (or is owned through a car). Restore a point-in-time into a **new** branch and copy that business's rows back in foreign-key order. No script exists; write and rehearse one before it is needed.
- The encryption key must be stored in two places outside the repository and a restored backup must be shown to decrypt with it (`docs/release/data-protection.md`).

## 9. Monitoring

| Signal | Where | Act when |
|---|---|---|
| Open items on `/super/payments` | the page | any |
| `payment_needs_attention{kind}` | metrics, and `cron_runs.result` ("NEEDS A PERSON") | any |
| `razorpay_webhook_failed`, `razorpay_webhook_unmatched`, `razorpay_webhook_unknown_kind` | metrics | any sustained rate |
| `payment_recovered_by_poll` | metrics | any: it means notifications are being missed; find out why |
| `booking_payment_mismatch`, `order_payment_mismatch`, `*_duplicate_refund_failed` | metrics | any failure |
| `cron_runs` rows `failed`, or none within twice the schedule | database | immediately |
| Webhook non-2xx rate | Workers logs / Razorpay dashboard | any sustained rate |

## 10. Rollback

1. **Application:** `npx wrangler rollback` for the app, then the cron worker, after checking nothing is mid-refund.
2. **Database:** nothing to undo for the columns. Drop `bookings_one_paid_per_car_uq` only if it blocks something unforeseen (it is the double-sale backstop). Enum values stay.
3. **Money:** a refund Razorpay already created cannot be undone; the row records its `refund_id`.

## 11. Known, non-blocking limitations

Listed with severity and next action in `docs/release/security-review.md`. In short: owner-only refunds (no middle role), no nightly full comparison of Razorpay's captured payments with ours, index builds not concurrent,
one encryption key without a key id, no automated customer export/erasure (manual procedures in `docs/release/data-protection.md`), video processing excluded from launch.

**Known: one pre-existing test depends on the clock.** `tests/cabs/trips.integration.test.ts` "sort bookings into new, pending, today and upcoming" books a trip 60 minutes ahead and expects it to be "today"; between 23:00 and midnight IST it lands after midnight and the test fails (3 bookings listed instead of 2). It is not related to this release and was not changed; every full-suite result above was taken outside that hour. A fix is one line (choose the offset so the trip stays within today).

## 12. What still stands between this and a GO for real money

1. The Razorpay **real test-mode** run (`docs/staging/razorpay-test-mode-runbook.md`), especially: same-key retry after a refused attempt, key retention, `reverse_all` on a test linked account, the lost-notification scenarios (E6, M5).
2. The **staging Cloudflare Workers** run (`docs/staging/workers-staging-runbook.md`), above all W4: WebSocket transactions from inside Workers.
3. The **production read-only validation** (section 3).
4. Resolving how migration `0029` ships.
5. Naming the operations person (section 6) and setting `SUPER_ADMIN_EMAILS`.
6. Explicit approval to deploy production.
