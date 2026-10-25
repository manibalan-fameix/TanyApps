# Razorpay TEST-mode runbook (staging)

**Nothing in this runbook has been run.** Do not make payments or refunds, call Razorpay with any key, or touch a webhook without a separate,
explicit go-ahead from the person who owns the Razorpay account. Never use a `rzp_live_` key, a real card or the production webhook.

## Prerequisites

1. Staging exists (`docs/tanycabs/STAGING.md`): its own domain `tanystaging.in`, Neon database, secrets file `.env.staging`, Workers.
2. Razorpay dashboard in **Test Mode**: API keys `rzp_test_...` (they go into `.env.staging` as `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`).
3. Test-mode webhook: URL `https://app.tanystaging.in/api/webhooks/razorpay`, a long random secret (also `RAZORPAY_WEBHOOK_SECRET`), events
   `order.paid` and `payment.captured` (plus `subscription.*` and `account.*` as in STAGING.md step 5).
4. Route enabled in test mode, and the staging dealer has an **activated test linked account**. Booking payments and refunds are Route payments
   (`reverse_all`), so without it the car-booking flow cannot run.
5. The disposable database is migrated through `0030` (`docs/staging/neon-test-database.md`).
6. Offline pre-flight (makes no network call; refuses live keys and the production domain):
   ```bash
   RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... ROOT_DOMAIN=tanystaging.in pnpm razorpay:check
   ```
7. The cron worker for staging is deployed **after** the app, so `retry-booking-refunds` exists (it runs in the existing `*/5` slot).

## Scenarios (each needs the go-ahead above)

Test cards and UPI ids are Razorpay's documented test ones; no real money moves with `rzp_test_` keys. For each scenario capture: the booking row
(`status`, `refund_status`, `refund_id`, `refund_reason`, `refund_error`), the lead count for the car, the car status, and the dashboard's refund list.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| R1 | Duplicate events | One test payment for a live car. Re-send the webhook from the dashboard if it offers that **[verify]** | one `paid` booking, one lead, car `on_hold`; no `razorpay_webhook_fallback` in the logs |
| R2 | Two buyers, one car | Two browsers open checkout for the same car; pay both | one booking `paid`; the other `refund_pending` with `refund_status = pending`, reason `car_unavailable`; **one** refund in the dashboard; the loser sees "being refunded", never "refunded" |
| R3 | Refund idempotency (pins down the real contract) | `POST /v1/payments/<pay>/refund` twice with the *same* `X-Refund-Idempotency` key and body; then once with the same key and a *different* body | same refund id both times; then a 409/400. **Record what a retry returns after a first attempt that failed for a business reason** |
| R4 | Refund refused | Ask for a refund larger than the captured amount | a plain 400; nothing created; booking stays owed; no loop |
| R5 | Status reconciliation | After R2, poll `GET /v1/refunds/<id>` until `processed`, then trigger the job (below) | booking becomes `refunded`, `refund_status = processed` |
| R6 | Interrupted refund | Break the staging key secret so refunds get a 401; pay as the losing buyer; restore the secret; run the job | booking stays `refund_pending` (owed) with an error recorded; after the restore the job creates exactly one refund |

### Added scenarios (TanyEats, authorization, recovery)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| E1 | Eats payment | Place an online order at a staging restaurant; pay with a test card | `new` + `paid`; stock taken once; no `razorpay_webhook_fallback` in the logs |
| E2 | Eats cancel-and-refund | As the **owner**, cancel that paid order | order `cancelled`, stock restored once, `payment_status=refunded` and `refund_status=pending` (not "processed" until Razorpay says so); the guest page says "is being refunded" |
| E3 | Staff cannot refund | As **staff**, try the same cancel on a paid online order | refused with "Only the owner can refund a payment."; nothing changes; no refund appears in the dashboard |
| E4 | Eats refund follow-through | Wait for / trigger `retry-order-refunds` (see below) after Razorpay marks the refund processed | `refund_status=processed`; the guest page says "has been refunded" |
| E5 | Double charge | Pay the same order twice (two test payments on one Razorpay order, if the test environment allows it) | the first payment is kept; the second is refunded once; an entry appears under Payment exceptions as *duplicate payment*, resolved |
| E6 | Lost notification | Pay an order, but pause webhook delivery (or point the test webhook at a dead URL) until the payment window passes; then trigger `expire-unpaid-orders` | the order is **applied** (not cancelled) because the job asks Razorpay; a *webhook failed* entry is recorded as resolved |
| M4 | Staff cannot refund a booking | As **staff**, press Refund on a paid booking | the button is not shown; calling the action is refused |
| M5 | Lost notification (Motors) | Same as E6 for a booking, then trigger `retry-booking-refunds` | booking becomes `paid`, one lead; if the car went elsewhere, the buyer is refunded |
| X1 | Payment exceptions page | Open `/super/payments` as a Tany team member | open items show what happened and what to do; Resolve needs a note and records your email |

Trigger the other jobs by hand the same way as the refund job: `retry-order-refunds`, `expire-unpaid-orders`, `expire-trip-holds`.

A refund that Razorpay creates and then *fails* cannot be forced reliably in test mode; that path is covered only by the fake in
`tests/motors-booking-payment.integration.test.ts`. Record it as unverified.

Trigger the refund job by hand on staging (secret from your shell, never typed into history):

```bash
curl -s -X POST https://app.tanystaging.in/api/internal/cron/retry-booking-refunds \
  -H "x-cron-secret: $CRON_SECRET" -H "x-cron-slot: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Evidence queries (read-only):

```sql
select status, refund_reason, refund_status, refund_id, left(refund_error, 80) from bookings where car_id = '<car>' order by created_at;
select count(*) from leads where car_id = '<car>';
select status from cars where id = '<car>';
```


## Status of this gate

**Not executed.** The attempt on 2026-10-24 stopped at the prerequisites, and no request was made to Razorpay. What was found:

| Prerequisite | Found |
|---|---|
| `rzp_test_` key, secret, and test webhook secret | not present in the environment; no `.env.staging` |
| Staging domain `tanystaging.in` | **NXDOMAIN** (no DNS delegation); the webhook URL therefore cannot exist |
| Staging Workers (`tanyapps-staging`, `-tracker-`, `-cron-`) | not deployed |
| Cloudflare login | a different account than the one the staging Workers deploy to (the deploy guard would refuse) |
| Test linked (Route) account for a staging dealer | cannot be checked without the keys |

R1, R2, R6, E1-E6, M4, M5 and X1 need the deployed staging application. **R3, R4 and R5 do not**: they only need test keys and one captured test payment, so they can run first, with the probe below.

## Run the refund-contract probe (needs keys and one captured test payment; no deployment)

1. In the Razorpay dashboard, in **Test Mode**, make one payment of at least INR 5 through Checkout with a test card, and note its `pay_...` id (it must be `captured`).
2. In your own shell (the values never go in a file or in chat):
   ```bash
   read -rs "RAZORPAY_KEY_ID?test key id: "; export RAZORPAY_KEY_ID; read -rs "RAZORPAY_KEY_SECRET?test key secret: "; export RAZORPAY_KEY_SECRET
   pnpm razorpay:probe -- --payment pay_xxxxxxxx                                              # read-only: checks the key is a test key and the payment is captured
   pnpm razorpay:probe -- --payment pay_xxxxxxxx --i-understand-this-sends-test-mode-refunds  # P1-P9
   ```
3. It refuses a live key before any request, sends only small refunds (INR 1 each) of that one payment, and prints no secret. Each step reports PASS / FAIL / INFO with what Razorpay actually answered.

| Step | Establishes |
|---|---|
| P1 | a key under 10 characters is a 400 |
| P2, P3 | first request creates a refund; the same key and body returns the **same** refund |
| P4 | **which status** a changed body under a used key returns (the documentation says both 400 and 409; the code handles either) |
| P5, P5b | the refund is listed once, and **whether `notes` come back** (reconciliation uses the list; if notes do not come back it must not depend on them) |
| P6 | how a normal-speed refund's status moves (`pending` for days is normal) |
| P7, P8 | an oversize refund is a 400; **whether a refused attempt is remembered under its key** (decides if a corrected retry needs a new key) |
| P9 | three simultaneous identical requests create exactly one refund |

## What Razorpay's public documentation says (read 2026-10-24) and what it leaves open

Sources: razorpay.com/docs/api/refunds/ and the "Create a Normal Refund (Idempotent Request)" page.

| Point | Documentation | Matches the code? |
|---|---|---|
| Header | `X-Refund-Idempotency` | yes |
| Key rules | at least 10 characters; letters, digits, hyphen, underscore | yes (`tany_rf_<payment>_<paise>` is checked against the same rule before sending) |
| Same key, same body | "safely retry ... without risk of double-refund"; whether the original object is returned is not stated | the code treats a 2xx as the refund; the probe (P3) settles it |
| Same key, different body | "rejected as BAD_REQUEST"; the errors table says **409**: inconsistent | the code reconciles on both 400 and 409 |
| First request still in progress | 409 "Another request with the same idempotency key is still in progress"; retry is allowed | yes (409 is reconciled) |
| After a **refused** first attempt | **not stated** | probe P8 |
| How long a key is remembered | **not stated** | cannot be probed quickly; the code never relies on it beyond a retry window: if a key has expired, the wrapper's refund-list check finds the existing refund first |
| `reverse_all` | **not stated on this page** (a Route parameter documented elsewhere) | must be confirmed on a test linked account (R2/M-scenarios) |
| Statuses | `pending`, `processed`, `failed`; `failed` for a normal refund on a payment over 6 months old, or an instant refund that fails | yes |
| Refund lists | `GET /v1/payments/:id/refunds`, `GET /v1/payments/:payment_id/refunds/:refund_id` | the code also calls `GET /v1/refunds/:id`, which this page does not list: **confirm in P6** |
| Errors | "The payment has been fully refunded already" (400), "amount ... greater than amount captured" (400) | yes: the legacy-400 adoption path and the oversize refusal |

## Questions only these runs can answer

- What a retry with the same idempotency key returns after a first attempt that was refused (R3).
- How long Razorpay remembers a key, and whether `notes` on the refund body come back on `GET .../refunds` (the reconcile path relies on both).
- Whether `reverse_all` works on a test-mode linked account, and how long a normal-speed test refund takes to reach `processed`.
- Whether `order.paid` and `payment.captured` arrive in both orders in test mode, and whether the dashboard can replay a delivery.
