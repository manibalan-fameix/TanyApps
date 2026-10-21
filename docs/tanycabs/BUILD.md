# TanyCabs — Master Build Spec

## 0. Mission

Build **TanyCabs**, the third Tany vertical, inside this repo. TanyCabs is a white-label booking product for small cab fleets (20–50 cars) at `<operator>.tany.in` or a custom domain. Tany takes **zero commission**; the operator pays a flat tech fee.

It has three surfaces in one codebase:
- **Customer PWA**: travellers and corporate employees book pre-planned trips.
- **Operator dashboard**: on `app.tany.in`, the existing admin shell.
- **Driver PWA**: on the operator's tenant host.

Trip types: airport, outstation one-way, outstation round trip, local hourly packages, package tours. On-demand rides come last (Phase 9).

The reuse audit is at `docs/audits/tanycabs-reuse-audit.md`. **Read it fully before any phase.** It is the source of truth for what exists, file paths, and known risks.

## 1. Non-negotiable rules

1. **Read `AGENTS.md` first.** This Next.js (16.x) has breaking changes. Read the relevant docs in `node_modules/next/dist/docs/` before writing routing, caching, proxy or server-action code. `proxy.ts` replaces middleware.
2. **UI stack:** shadcn style `base-luma` (Base UI: use the `render` prop, never `asChild`), hugeicons, Tailwind 4, Space Grotesk, existing tokens in `app/globals.css`. Add primitives only with `pnpm dlx shadcn@latest add <name>`. Mobile-first, with Swiggy/Uber-level familiarity for customers and drivers.
3. **Tenant isolation:**
   - Every new tenant table has `dealer_id`.
   - Each one is registered in `scopedDb` (or the composable registry after Phase 0), and covered in `tests/tenant-leak.test.ts`.
   - Never import the raw DB client in `app/`, `components/`, `hooks/` or `proxy.ts`.
   - Every server action and route resolves the tenant from the host, never from client input.
4. **TanyEats and TanyMotos must not regress.** Their tests stay green at every commit. Do not change their behaviour except through the Phase 0 refactor, and only behind thin wrappers.
5. **Money is integer paise** in every new table. GST is always a separate line. There is one rounding rule, in one helper: fares round to the nearest rupee at the final total only.
6. **Statuses are Postgres enums** plus a transition graph in code. No free-text status columns.
7. **PII:**
   - Customer and driver phone numbers, addresses, licence numbers and vehicle reg numbers are encrypted with `lib/crypto`.
   - Each gets an HMAC blind index wherever a lookup is needed.
   - Never log PII.
8. **Fares never depend on GPS.** Billing uses the start/end odometer readings (with photos), the customer start-OTP, the quote snapshot and actual tolls/parking. GPS is for live view and dispute evidence only.
9. **The quote snapshot is immutable.** Each trip stores the full fare breakdown as JSON at booking, and rate-card edits never alter existing trips.
10. **Server is authoritative.** Prices, availability and permissions are computed server-side, with Zod on every input.
11. **Payments:**
    - Every Razorpay order carries `notes.kind`, and the webhook dispatches on it.
    - Payment application is idempotent and runs in a transaction through `scopedDb(..., tx)`.
    - Assert that the trip's `dealer_id` matches the host tenant.
12. **Share and tracking links use 128-bit random tokens**, hashed at rest, and expire at trip end + 2 h. Never use the 6-char booking code as an auth secret.
13. **Background work** runs through Cloudflare Cron Triggers calling an authenticated internal route. Do not add long-running Node processes.
14. **Rate limiting** uses the shared limiter from Phase 0 (Workers Rate Limiting binding or a Durable Object), never the in-memory one.
15. **Language:** all customer- and driver-facing copy goes through the copy system, in English and Tamil (`lib/copy.ts`, `lib/copy-ta.ts`).
16. **Quality gate per phase:** `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass, new logic has unit tests, and each customer flow has one Playwright spec.
17. **Git:**
    - Use one branch per phase (`tanycabs/phase-N-<slug>`).
    - Make small commits with clear messages.
    - Never force-push or rewrite history.
    - Never commit `.env*` files.
18. **When blocked on a product decision, stop and ask.** Don't guess. Log each assumption you make in `docs/tanycabs/DECISIONS.md`.
19. **End of phase:** write `docs/tanycabs/progress/phase-N.md` covering what was built, files touched, migrations, tests, known gaps, and manual test steps. Then stop.

## 2. Architecture

```
lib/verticals/        registry: one typed config per industry (motors, restaurants, cabs)
lib/core/             shared: tracking, payments, geo, status-graph, notifications, customers, scheduler, invoices, rate-limit
lib/cabs/             TanyCabs domain: fare engine, trips, dispatch, fleet, drivers, corporate
lib/db/schema/cabs.ts TanyCabs tables
components/cabs/      customer + driver + operator UI specific to cabs
app/(admin)/(shell)/cabs/...        operator pages (prefixed /cabs/* to avoid route collisions)
app/(tenant)/sites/[dealer]/...     customer pages, branched via the vertical registry
app/(tenant)/sites/[dealer]/driver/ driver PWA
app/api/t/cabs/...                  tenant-host APIs (only /api/t/* is reachable on tenant hosts)
app/api/internal/cron/...           cron entrypoint, secret-authenticated
```

### Trip lifecycle (enum `trip_status`)

```
requested → confirmed → assigned → driver_en_route → arrived → in_trip → completed → closed
   │            │           │                          │
   ├→ rejected  ├→ cancelled (customer/operator, with fee per policy)
   └→ expired (unpaid hold > 20 min)                   └→ no_show
```

`closed` means the invoice is issued and all payments are settled. Every transition writes a `trip_events` row with the actor.

### Fare engine (`lib/cabs/fare.ts`)

The fare engine is a pure function:

```
quote({ tripType, vehicleClass, rateCard, surcharges, distanceKm, durationMin,
        startAt, endAt, returnAt, days, packageId, coupon, gst }) → { ok, breakdown, totalPaise } | { ok:false, reason }
```

It covers:
- Per-km with min km/day × days (outstation).
- Base fare + per-km (airport/local transfer).
- Hourly packages (e.g. 4h/40km, 8h/80km) with extra km and extra hour.
- Driver bata per day, plus night charge (configurable window, e.g. 22:00–06:00).
- Hill/ghat surcharge, state permit per state crossed, airport parking/entry fee.
- Tolls (estimate shown, actuals billed), coupon, and GST (rate and SAC from operator settings; CGST/SGST vs IGST by place of supply).

It returns a line-item breakdown the UI renders as-is. It has 100% branch coverage plus the hand-priced cases in `tests/cabs/fare-cases.json`.

### Final bill (`lib/cabs/bill.ts`)

The final bill is computed at trip end from:
- the actual odometer km and actual hours,
- actual toll/parking receipts, and
- the snapshot rate.

The difference against the advance becomes the balance due.

## 3. Data model (all tenant tables carry `dealer_id`; money in paise)

**Customers & corporate**
- `customers`: phone_enc, phone_hash (unique per dealer), name, email, verified_at, language, corporate_account_id null.
- `customer_addresses`: label, address_enc, lat, lng, place_id.
- `customer_contacts`: name, phone_enc. These are SOS/family contacts.
- `corporate_accounts`: name, gstin, billing_email, billing_address, credit_days, requires_approval, discount_bps, active.
- `corporate_members`: corporate_account_id, customer_id, role (`admin|employee`), cost_centre.

**Fleet**
- `vehicle_classes`: name, seats, bags, ac, description, image_key, sort, active.
- `vehicles`: class_id, reg_enc, reg_hash, make_model, year, colour, fuel, ownership (`own|attached`), odometer_km, status (`active|maintenance|inactive`), photo_keys.
- `vehicle_documents`: vehicle_id, type (`rc|insurance|permit|fc|puc|tax`), number, valid_from, valid_till, file_key.
- `blocked_periods`: resource_type (`vehicle|driver`), resource_id, starts_at, ends_at, reason.

**Drivers**
- `drivers`: name, phone_enc, phone_hash (unique per dealer), photo_key, licence_enc, licence_valid_till, badge_no, employment (`employee|attached|freelance`), languages, status (`available|on_trip|off|inactive`).
- `driver_documents`: driver_id, type, number, valid_till, file_key.
- `driver_duty_logs`: driver_id, started_at, ended_at.

**Pricing**
- `rate_cards`: vehicle_class_id, trip_type, base_paise, per_km_paise, min_km_per_day, per_hour_paise, package_hours, package_km, extra_km_paise, extra_hour_paise, bata_per_day_paise, valid_from, valid_to, active.
- `rate_surcharges`: kind (`night|hill|permit|airport|festival`), scope (jsonb: state / city / place_ids / time window), amount_paise or bps.
- `packages`: name, slug, description, days, itinerary (jsonb), vehicle_class_prices (jsonb), images.
- `route_distances`: origin_place_id, dest_place_id, km, minutes, toll_estimate_paise, source, fetched_at. This is a cache.
- `cab_settings`: one row per dealer.
  - advance_bps, cancellation_policy (jsonb tiers), night_window, gst_rate_bps, sac_code, gstin, state_code, invoice_prefix, min_lead_minutes, service_cities, buffer_minutes.

**Trips**
- `trips`: code, customer_id, corporate_account_id, booked_by, trip_type, status, source (`web|phone|walk_in|corporate`).
  - Route: pickup (jsonb with address_enc, lat, lng, place_id), drop, stops (jsonb).
  - Times: start_at, end_at_planned, return_at.
  - Request: pax, bags, notes, vehicle_class_id, package_id.
  - Money: quote (jsonb), quote_total_paise, advance_due_paise.
  - Assignment: vehicle_id, driver_id.
  - Security: share_token_hash, start_otp_hash, otp_attempts.
  - Odometer: odo_start, odo_end.
  - Final bill: final (jsonb), final_total_paise.
  - Approval and cancellation: approval_status, cancelled_reason, cancelled_by, cancellation_fee_paise.
- `trip_events`: trip_id, type, at, actor_type, actor_id, data (jsonb, e.g. odometer, photo_key, lat/lng).
- `trip_payments`: trip_id, kind (`advance|balance|refund|cancellation_fee`), method (`razorpay|cash|upi_manual|corporate_credit`), amount_paise, razorpay_order_id, razorpay_payment_id, status, collected_by_driver_id.
- `trip_expenses`: trip_id, driver_id, kind (`toll|parking|fuel|permit|other`), amount_paise, receipt_key, billable_to_customer, status.
- `trip_locations`: trip_id, lat, lng, at. Sampled every 60 s, retained 90 days.
- `sos_events`: trip_id, at, lat, lng, status, handled_by, notes.

**Finance**
- `invoices`: number (per dealer per FY sequence), kind (`trip|corporate_monthly|credit_note`), trip_id or period, customer/corporate snapshot, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, pdf_key, issued_at.
- `invoice_sequences`: dealer_id, fy, next_no.
- `driver_payouts`: driver_id, period_start, period_end, trips, earnings_paise, deductions_paise, cash_held_paise, status, paid_at.

**Platform (shared, in `lib/core`)**
- `notifications` (outbox): event, recipient_type, recipient_id, channel (`whatsapp|sms|push|email|wa_link`), template, payload, status, attempts, next_attempt_at, provider_ref.
- `notification_optins`: recipient, channel, consented_at, source.
- `audit_log`: actor, action, entity, entity_id, diff, at.

**Extended tables**
- `dealer_users.role` adds `manager|dispatcher|accountant`.
- `reviews` adds `trip_id`, `driver_id`.
- `coupons` adds `max_uses`, `per_customer_limit`, `trip_types`, `first_trip_only`.
- `dealers.industry` becomes an enum including `cabs`.

## 4. Feature checklist (complete product)

### Customer PWA (tenant host)
- Home: trip-type tabs, pickup/drop with Google Places autocomplete, airport/railway quick picks, date and time, return date, and pax/bags.
- Vehicle class list with live fares and a fare breakdown sheet.
- Package tours: listing, detail page and booking.
- Login: phone OTP via the central login; guest-to-account linking.
- Book: review, advance payment (Razorpay: UPI/card/netbanking) or pay-later where the operator allows it, and coupon entry.
- Booking detail: status timeline; driver/vehicle card once assigned; call the driver (masked if the provider supports it); start-OTP display; live map; share-trip link; SOS.
- Trip end: final bill, pay balance online, download invoice, rate trip and driver.
- Account: profile, saved addresses, SOS contacts, booking history, repeat booking, invoices, language (EN/TA).
- Corporate employee: book under company, approval pending state, and no payment when on corporate credit.
- Corporate admin: approve or reject bookings, list employees, monthly statements and invoices.
- PWA: per-tenant manifest (operator name, icon, theme colour), service worker with offline shell, installable.
- SEO: route landing pages, per-tenant `sitemap.xml` and `robots.txt`, JSON-LD (`TaxiService`, `Offer`), OG images.

### Operator dashboard (`app.tany.in`, `/cabs/*`)
- Onboarding for cabs in under 3 minutes: brand, subdomain, service cities, first vehicle class and rate card, Razorpay Route KYC.
- Fleet: vehicle classes, vehicles, documents with expiry badges, and blocked periods (maintenance).
- Drivers: profiles, documents, status, duty log, and invite via WhatsApp to install the driver app.
- Pricing: rate card matrix (class × trip type), surcharges, packages, tolls, a live fare preview calculator, and cab settings.
- Booking inbox: new/pending/today/upcoming tabs; accept/reject/quote-adjust with an audit-logged reason; real-time alert (WebSocket channel per tenant, sound + toast).
- Manual booking: phone/walk-in booking using the same fare engine; sends a payment link.
- Dispatch board: day/week Gantt with vehicles as rows and trips as bars; drag to assign; conflict detection including buffer minutes; driver + vehicle assignment.
- Live map: all active trips and their drivers.
- Trip detail: timeline, events, payments, expenses, odometer photos, breadcrumb replay, notes, invoice.
- Payments: list, refunds, cash reconciliation per driver.
- Driver payouts: period settlement and cash held vs owed.
- Corporate: accounts, members, credit terms, monthly invoice run, statements.
- Customers CRM: list, detail, trips, tags, notes.
- Reports: revenue, trips by type/class, utilisation per vehicle, km, per-vehicle profit (revenue − expenses − payouts), cancellations, and CSV export.
- Coupons, reviews moderation, banners, enquiries (reuse).
- Team and roles: owner, manager, dispatcher, accountant. Every action is permission-checked.
- Notifications settings: WhatsApp sender, templates preview, opt-in logs.
- Document-expiry alerts: daily digest and badges.

### Driver PWA (tenant host `/driver`)
- Phone OTP login scoped to this operator (central login); installable manifest with `start_url=/driver`.
- Today and upcoming trips, plus trip detail with pickup, drop, customer name, call, and a navigation deep link with waypoints.
- Flow: start duty → "on my way" → "arrived" → enter the customer OTP + start odometer photo → in trip → end odometer photo → add toll/parking receipts → mark cash collected → done.
- Live location while `driver_en_route` through `in_trip` only: wake lock, WebSocket with HTTP fallback, offline queue for status updates and uploads.
- Earnings, payouts, and document expiry reminders.

### Platform
- Vertical registry; cabs plan limits (vehicles, drivers, bookings/month); subscription billing.
- Notifications outbox with adapters for WhatsApp Cloud API/BSP (templates: booking_confirmed, driver_assigned, driver_arriving, trip_started, trip_completed_invoice, payment_link, document_expiry, corporate_approval), SMS (DLT), web push, email, and a `wa.me` fallback.
- Scheduler jobs:
  - Unpaid hold expiry (20 min) and pickup reminders (T-2h, T-30m).
  - Document expiry digest (daily 08:00 IST) and monthly corporate invoices (1st, 06:00 IST).
  - Notification retries, breadcrumb retention purge, and driver-no-show check.
- Invoices: GST-compliant PDF generation (Workers-compatible), stored in R2.
- Super-admin: cabs tenants, trips, GMV, health; CSV export.
- Analytics events: quote_viewed, booking_started, booking_paid, trip_completed, route_page_view.
- Audit log on fare edits, refunds, reassignments and cancellations.

## 5. Phases

| # | Phase | Exit criteria |
|---|---|---|
| 0 | Foundation refactor | Vertical registry, generic guards, composable scopedDb, `lib/core` extraction (tracking, payments + `notes.kind` webhook, geo, status graph), shared rate limiter, cron route, notifications outbox skeleton. Eats + Motors tests green. |
| 1 | Cabs skeleton + fleet + pricing | `cabs` industry end to end in onboarding/nav/shell; schema for fleet, drivers, pricing, settings; operator CRUD; fare engine + tests; Places/Routes adapter with cache. |
| 2 | Customer identity + booking | Central OTP login, customers, addresses; customer booking flow up to `requested`; operator inbox + manual booking; trips + events + status graph; unpaid-hold expiry. |
| 3 | Dispatch + driver PWA + tracking | Dispatch board with conflict checks; driver login + full trip flow; driver upload endpoint; tracking for trips + breadcrumbs; share link; SOS. |
| 4 | Payments + notifications | Advance/balance/cash/refunds/cancellation fees; final bill; WhatsApp + wa.me adapters; all templates wired; tenant real-time inbox channel. |
| 5 | Corporate + invoices + roles | Corporate accounts, employee booking, approvals, credit; GST invoices + monthly run + PDF; roles/permissions; audit log. **Pilot-ready.** |
| 6 | Hardening + pilot | Leak tests for all tables, payment replay/idempotency tests, Playwright E2E book→assign→trip→pay→invoice, per-tenant manifest + service worker, prod config check, seed script for pilot operator. |
| 7 | Operations depth | Payouts, expenses, cash reconciliation, per-vehicle profit reports, documents expiry digest UI, blocked periods, `tstzrange` exclusion constraint, packages/tours. |
| 8 | Growth | SEO route pages + sitemap/robots/JSON-LD, reviews, coupons upgrades, SMS + push channels, super-admin cabs views, analytics. |
| 9 | On-demand (optional) | Driver availability stream, nearby search, offer/accept dispatch, ETA. Only after a written design is approved. |
