# Phase 1 report: cabs skeleton, fleet and pricing

Branch `tanycabs/phase-1-fleet-pricing`, stacked on `tanycabs/phase-0-foundation` (which is **not merged to `main` yet**). 11 commits, about 115 files changed. Nothing is pushed or deployed, and nothing was run against Neon except the one read-only query below.

A separate branch, `fix/motors-refund-route-reversal` (from `main`, 2 commits), holds two fixes you asked to keep apart. Decisions, assumptions and mistakes are in [DECISIONS.md](../DECISIONS.md) ("Phase 1"). **Please read its "Assumptions I made" list: several are yours to confirm.**

## Quality gate

| Gate | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | **0 errors**, 14 warnings (the same 14 as before this phase; none are in new code) |
| `pnpm test` (with live-DB tests on a scratch Postgres) | **914 passed, 1 failed**: the stale live-car-cap test, fixed on `fix/motors-refund-route-reversal` |
| `pnpm test` without a database | 823 passed, 92 live-DB tests skipped |
| `pnpm test:coverage` | **100%** statements, branches, functions, lines on `lib/cabs/fare.ts` and `lib/cabs/time.ts`, enforced per file |
| `pnpm test:e2e:cabs` (Chromium, real dev server) | 2 passed |
| `pnpm build` | pass, all new routes present |

## Before building (your two asks)

**1. Does `payment.captured` carry order notes?** Not that Razorpay documents. The [payments payload page](https://razorpay.com/docs/webhooks/payloads/payments/) says it "only contains the payment entity" and shows `"notes": []` in every sample; `order.paid` carries both entities. You approved the switch: `order.paid` is now primary (reading `payload.order.entity.notes.kind`), `payment.captured` is the counted fallback. The requested test drives both events through the real webhook route and a real database: in every order, repeated, and simultaneously. A payment is applied once, and a late payment is refunded **once**. That test found a real double-refund race in my Phase 0 code (two events overlapping both refunded; confirmed by running the test against the old logic), now fixed with an atomic claim that is released if the refund fails so Razorpay's retry can finish.

**2. Category report** (before changing it): **0 of 13 dealers** (8 motors, 5 restaurants) have a `razorpay_account_id`, so the old values were never submitted successfully or never tried; the data cannot say which. Categories were changed for new onboarding only: cabs `transport/cab_hailing`, Eats `food/restaurant`, Motors `ecommerce/automobile_and_truck_dealers`.

## The separate fix branch

- **Refund reversal:** car-booking refunds now reverse the Route transfer (`reverse_all`), as food refunds do. The old function also **did nothing silently** when Razorpay keys were missing, after which the action marked the booking "refunded"; it now throws. Three tests.
- **"Live-car cap" test: the test was wrong, not the cap.** Starter was raised 20 → 25 deliberately in `a00c318` (the plan table and pricing copy say 25); the test and one DECISIONS.md line still said 20, so it seeded too few cars. The test now follows the plan cap. Verified on a clean migrated database: 23/23 before merge, and the whole suite on that branch passes (522).

## What was built

| # | Item | Where |
|---|---|---|
| 1 | **Live rollout.** Cabs are selectable by every signed-in operator, with the server-side vertical check retained for future staged rollouts. `tanycabs` is mapped to `cabs` in `lib/products.ts`. | `lib/verticals/flags.ts`, `app/(admin)/onboarding/*`, `components/onboarding/enabled-industries.tsx` |
| 2 | **Registry.** Plan limits (your numbers), no free plan, cab nav under `/cabs/*`, tenant shell skeleton, billing table for cabs, downgrade blocked while it would leave more vehicles/drivers than the plan allows. | `lib/verticals/cabs.ts`, `components/admin/nav-config.ts`, `components/cabs/tenant/*`, `components/billing/pricing-table.tsx` |
| 3 | **Schema** (migration `0026`): 11 tenant tables + `route_distances`. All in the table registry and leak test. Money integer paise, enums for statuses, CHECK constraints, registration/phone/licence encrypted with blind indexes. | `lib/db/schema/cabs.ts`, `lib/db/tenant-tables.ts` |
| 4 | **Operator CRUD**: vehicle classes, vehicles, documents, blocked times, drivers + documents + duty log (read-only), rate cards, extra charges, tour packages, settings. PDF/photo document scans in a private bucket. Expiry badges. | `lib/cabs/admin-actions.ts`, `components/cabs/*`, `app/(admin)/(shell)/cabs/*` |
| 5 | **Fare engine** per BUILD.md §2, with 15 placeholder cases. | `lib/cabs/fare.ts`, `tests/cabs/fare-cases.json` |
| 6 | **Geo**: Google Places (New) + Routes behind an interface; Nominatim/OSRM only outside production. | `lib/core/geo/{google,osm,places,places-provider,route-cache}.ts`, `lib/cabs/places-actions.ts` |
| 7 | **Rate-card page** with the live calculator running the real engine. | `app/(admin)/(shell)/cabs/pricing`, `components/cabs/calculator.tsx`, `lib/cabs/calculator.ts` |
| + | Bookings-allowance pipeline: soft limit, banner at 80%/100%, `audit_log` events once a month. Counts 0 until Phase 2 adds trips. | `lib/cabs/{limits,usage}.ts`, `app/(admin)/(shell)/layout.tsx` |
| + | Cab dashboard with a setup checklist and a warning for expiring paperwork. | `components/cabs/dashboard.tsx` |

### Things the tests caught while building

- A **real bug in the fare engine**, before commit: BigInt division rounds toward zero, so a negative line (the discount) displayed one paisa short. Found because the 15 expected values come from a separate Python implementation, not from the code under test.
- JavaScript treats `2026-02-30` as 2 March, so date validation round-trips the value.
- Saving a vehicle class or package with no picture still called storage and would throw wherever storage is not configured.
- A flaky live test of mine (unordered `select()` taken as "the first vehicle").

## Do after review (needs you)

1. **Razorpay dashboard: enable the `order.paid` event in BOTH test mode and live mode** (Settings → Webhooks → your endpoint → add `order.paid`). Without it every payment is handled by the `payment.captured` fallback. To check afterwards, search the Workers logs for `razorpay_webhook_fallback`: in steady state it should not appear for new orders.
2. **Merge order.** `main` still lacks Phase 0, so Phase 1 sits on its branch. Suggested: merge `fix/motors-refund-route-reversal` into `main` first (small), then Phase 0, then Phase 1. The refund fix and Phase 0 both touch `refundBookingPayment` (Phase 0 moved it to `lib/route/razorpay.ts` still calling `refundPayment(…, false)`), so expect a one-line conflict where the resolution is `refundPayment(paymentId, amount, true)`; I will do it when you say.
3. **Secrets and bindings** (production values; then `bash scripts/upload-secrets.sh`, which now sends all of these):
   - `BLIND_INDEX_KEY` (32 bytes base64): missing from the script until this phase, see DECISIONS "Mistakes".
   - `GOOGLE_MAPS_SERVER_KEY`: in Google Cloud enable **Places API (New)** and **Routes API**, create a key restricted to those two APIs (Workers have no fixed IP, so restrict by API, not address). Without it production has no place search.
   - `R2_PRIVATE_BUCKET`: create a **second R2 bucket with no public access and no custom domain**, give the existing R2 API token access to it, then set its name. Until then document uploads are refused in production (record numbers and dates still work).
4. **Migrations on Neon:** `pnpm db:migrate` applies `0026` (and Phase 0's `0023`–`0025` if not yet applied).
5. **Decisions for you** (details in DECISIONS.md): cab plan **prices** (I reused Starter ₹2,999 / Growth ₹4,999 / Pro ₹8,999); whether a "day" for round trips is a calendar day or a 24-hour block; whether **Google distances may be cached** (default: not stored); whether to turn on **tolls** (unconfirmed for India).
6. Replace the placeholders in `tests/cabs/fare-cases.json` with the pilot operator's real, hand-priced numbers. Every number in it is made up and marked `"placeholder": true`.

## Manual test steps

1. Gate: `pnpm typecheck && pnpm lint && pnpm test`.
2. Live-DB tests: create a scratch Postgres, `pnpm db:migrate`, then `TEST_DATABASE_URL=… pnpm test`.
3. Browser journey: create a database, `pnpm db:migrate`, `psql -f e2e/cabs-seed.sql`, then `DATABASE_URL=… ENCRYPTION_KEY=… BLIND_INDEX_KEY=… pnpm test:e2e:cabs`.
4. By hand (dev server with a database in which `sri-murugan` is a cab business, see `e2e/cabs-seed.sql`): open `/login` → "Open the demo dealer". Walk the sidebar: Vehicle classes → Vehicles → a vehicle's page (add three documents with dates in the past, soon, far) → Drivers → Rate cards → "Try a fare" → Fares, GST and rules. Resize to a phone width and check the tab bar.
5. Plan limits: set the business to Starter, add 10 vehicles (the button disables and a banner appears), then try an 11th from a second tab (refused with "See plans").

## Known gaps

- **Online self-serve booking is not implemented yet**: no trips, customers or payments for cabs (Phase 2 onward). The public page accepts booking requests by phone or WhatsApp and shows the operator's vehicles.
- **Duty log is read-only**; the driver app (Phase 3) writes it. Document-expiry **emails/WhatsApp** do not exist yet (Phase 4 notifications + the `daily` cron job, currently a placeholder); expiry is shown on screen only.
- **Staff vs owner is coarse** until Phase 5 roles.
- **Place search needs a Google key in production**; in development it uses OpenStreetMap, which is rough for Indian landmarks.
- **Operator UI is English only**; BUILD.md requires English and Tamil only for customer- and driver-facing copy.
- **Existing `e2e/add-car.spec.ts` is probably stale** (its sign-in helper looks for a button the login page no longer has); I did not run or change it.
- **Not tested against the real services**: Google, Razorpay, R2 and Cloudflare (see "Verified vs not verified" in DECISIONS).
- I deleted your local dev-uploads photos by mistake (details in DECISIONS "Mistakes").
