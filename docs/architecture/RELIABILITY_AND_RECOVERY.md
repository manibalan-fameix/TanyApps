# Reliability and recovery

## Payment flows (verified by reading + existing tests; not re-run against Razorpay)

| Scenario | Behaviour | Where |
|---|---|---|
| Webhook replayed / `order.paid` + `payment.captured` both arrive | Handlers are idempotent: `created→paid` is one conditional UPDATE; second call returns `already_applied` | `lib/bookings/service.ts`, `lib/restaurant/payments.ts` |
| Checkout confirmation and webhook race | Same function, car claim `live→on_hold` is the serialisation point; loser rolls back and re-reads (depth-bounded) | `settle()` |
| Two buyers pay for one car | Loser moves to `refund_pending`; refund created after commit with stable idempotency key; unique "one paid booking per car" index as backstop | |
| Buyer charged twice | Second payment refunded (key = its payment id), audit row once, exception recorded `resolved` | `refundExtraPayment` |
| Refund call fails transiently | State `refund_pending` is saved *before* the provider call; webhook answers non-2xx (Razorpay retries) and the cron job `retry-booking-refunds` retries | `lib/core/jobs/*` |
| Provider says refund failed | `refundStatus=failed`, `payment_exceptions` row, no loop | |
| Unmatched captured payment | `payment_exceptions` `unmatched_payment`, metric `razorpay_webhook_unmatched` | webhook route |
| Subscription events out of order | `paidThrough` never moves back; **status can no longer leave `cancelled/completed/expired`** (new) | `lib/billing/{state,service}.ts` |
| Subscription webhook late | Access is derived from `paidThrough` + 3-day grace; a delayed webhook does not switch a storefront off | `billingState` |
| Webhook handler throws | 500 → Razorpay retries; `webhook_failed` exception recorded, cleared on success | |

Known limit: subscription updates are read-modify-write without a row lock. Concurrent webhook + checkout confirmation for the same dealer can interleave; the fields written are monotonic or last-writer-equal, so the observed outcome is the same, but a `SELECT … FOR UPDATE` in a `scopedTransaction` would make it strict. RECOMMENDED if plan-change flows grow.

## Background work

`runJob(job, slot)` takes a `(job, slot)` lock; a failed run answers 500 and a retry can re-claim it. Jobs are idempotent by construction (refund keys, conditional updates). Bounded retries come from the cron cadence, not an unbounded loop. No dead-letter table exists; terminal failures surface as `payment_exceptions` rows. The video queue uses pg-boss (`lib/jobs`) and counts `video_not_queued`.

## Real-time

`workers/tracker`: tickets expire (`TICKET_TTL_S`), one rider socket at a time, positions older than the stored one are dropped, 1 s minimum gap, 200-byte messages, India bounds, state deleted by `clear()` on completion or by a 6 h alarm. If the socket is unavailable, `ws-ticket` answers `live:false` and pages poll `/api/t/order-location` (rate-limited, 60/min per IP+code). Cab live tracking: not inspected.

## Degradation

Rate limiter unreachable: auth paths fail closed, others fail open and emit `rate_limiter_unreachable`. LLM chat unavailable → 503 `chat_unavailable`, rest of the storefront unaffected. Analytics writes never throw.

## Recovery runbook (short)

- **Money looks stuck**: open the payment-exceptions admin view; `refund_failed` needs a person in the Razorpay dashboard; `refund_pending` older than a day → run `retry-booking-refunds` / `retry-order-refunds` via the cron endpoint (staging first).
- **Webhook outage**: Razorpay retries for a bounded period, then use the dashboard's webhook "resend". Handlers are replay-safe.
- **Bad deploy**: Git-revert and redeploy is safe for code. It does **not** undo migrations, refunds or payments (see PRODUCTION_READINESS).
- **Searching logs**: metrics are JSON lines with `metric` as the key (`usage`, `razorpay_webhook_failed`, …). There is no request id yet (RECOMMENDED).


---

# Pass 5: reliability additions and incident runbooks

## What changed

| Gap | Fix | Where |
|---|---|---|
| A lost renewal webhook leaves `paid_through` stale, and a paying business slides into grace and suspension | Daily job `reconcile-subscriptions` asks Razorpay (read-only) about subscriptions whose paid period ends within 2 days or is over, and applies the answer with the same idempotent `applySubscription` the webhook uses. Max 50 per run, 15 s budget, one provider failure does not stop the rest, nothing is written when the provider cannot answer. | `lib/core/jobs/reconcile-subscriptions.ts`; runs on the existing 02:30 UTC trigger (no new schedule) |
| Concurrent subscription events could write an older `paid_through` over a newer one | One conditional `UPDATE` (`advancePaidThrough`) | `lib/tenant/billing.ts` |
| Cab double-tap / retry / second tab created two requests | Per-submission operation key with a unique index, 24-hour expiry; a genuinely new booking has a new key | `lib/cabs/idempotency.ts`, migration 0036 |
| Failed or stuck scheduled jobs were visible only in logs | Latest run per job on `/super/platform`, failed and stuck (running > 10 min) first | `loadCronStatus` |
| No correlation between our records and edge logs | `cf-ray` stored on security events | `lib/core/request-id.ts` |

**Cab booking rule (decision).** Two requests are the same only if they come from the same review-screen visit (same key). A different route, time, vehicle, or a fresh visit is a new booking. Pricing, dispatch and the operator workflow are unchanged. Old and operator-made bookings have no key and are never merged.

## Dependency failure behaviour (fail-open vs fail-closed)

| Operation | Dependency down | Behaviour |
|---|---|---|
| Customer payment confirmation | Razorpay down | never reports success: the booking/order stays unpaid and is recovered by webhook, client poll or cron |
| Refund | Razorpay down | owed state saved first; retried by cron; never "processed" unless Razorpay says so |
| Subscription access | webhook delayed or lost | access follows `paid_through` + 3-day grace; the daily job repairs a missed renewal |
| Rate limiter (Durable Object) | unreachable | sign-in and verification paths fail **closed**; everything else fails open (counted) |
| Usage metering | accounting DB unreachable | work **allowed** (counted); only an answering counter can deny |
| Security trail | write fails | privileged exports, exception resolution, invitations and membership changes **do not happen**; sign-in attempts and customer actions are unaffected |
| AI chat / OCR | provider or key missing | feature answers "unavailable"; the rest of the storefront is unaffected |
| Maps | provider down | quote returns an error the customer sees; no price is guessed |
| Analytics events | unreachable | dropped silently; never blocks a page |
| R2 uploads | unreachable | upload refused with a retryable error; nothing half-recorded |

## Runbooks (read-only investigation first; no destructive exercise was run)

Each starts with: **note the time and the Cloudflare request id (`cf-ray`)**, check `/super/platform` (scheduled jobs), `/super/payments` (money exceptions), `/super/security` (privileged actions).

1. **Database unavailable.** Symptoms: 5xx on admin pages, `usage_metering_failed`, cron jobs failing. Check Neon status and the project's compute state; storefront reads fail, but money handlers return 500 so Razorpay retries (nothing is lost). Do not restart workers repeatedly. When Neon returns: confirm `/super/platform` shows jobs running, then run the reconcile jobs by hand through the guarded cron route for the missed slot (below). Use Neon point-in-time restore only for data loss, to a *branch*, then compare before any cutover.
2. **Webhook backlog or failures.** `/super/payments` lists `webhook_failed` with the Razorpay id. Razorpay retries with backoff; after outage use the dashboard's "resend" for the window. Handlers are replay-safe. Verify afterwards: open exceptions fall to zero; unmatched payments are matched or refunded by hand.
3. **Payment reconciliation.** Money jobs `retry-booking-refunds`, `retry-order-refunds`, `expire-unpaid-orders` run every 5 minutes; `reconcile-subscriptions` daily. To run one by hand: `POST /api/internal/cron/<job>` with `x-cron-secret` and an `x-cron-slot` of "now" (the slot lock stops double runs). Compare Razorpay's dashboard against `/super/payments`; resolve each exception with a note (recorded in the security trail).
4. **Worker deployment regression.** Cloudflare, Workers, `tanyapps`, Deployments: roll back to the previous version (code only; nothing in the database changes with a code rollback, and this release has migrations 0033-0036 that are additive and compatible with the previous code). Re-run `scripts/staging-smoke.sh` against the environment. A rollback to before the super-admin fix reopens that vulnerability: prefer a forward fix.
5. **Durable Object failures.** Rate limiter unreachable: expect `rate_limiter_unreachable` metrics; sign-in paths fail closed (users see "try again"); fix by redeploying the tracker Worker. Tracker: guests fall back to polling `/api/t/order-location`; no data loss (positions are ephemeral, 6-hour self-delete).
6. **Unexpected cost spike.** `/super/usage` "Unusual today" and "Top businesses". Identify the feature and business; set an abuse ceiling for that business/feature (recorded in the security trail); check `usage_limit_denied` afterwards; confirm in the provider dashboard. For Gemini or Maps keys under attack, rotate the key and restrict it (docs/release/operational-security.md).
7. **Authentication failures.** Firebase outage: sign-in fails; existing sessions keep working (JWT). Everyone signed out suddenly: check `AUTH_SECRET` was not changed. Super admins cannot sign in: check `SUPER_ADMIN_EMAILS`, the uid list, and that they use the Google account whose email is verified.
8. **Tenant authorization incident (a business sees another's data).** Treat as P0. Preserve evidence: request ids, the affected URL and ids. Disable the affected route or product if needed (suspend the business or roll back the deployment). Use `/super/security` and `audit_log` to scope what was read or changed; notify affected businesses; add an adversarial test (`tenant-adversarial.integration.test.ts`) before the fix ships.
