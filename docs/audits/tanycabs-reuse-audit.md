# TanyCabs Reuse Audit

Read-only audit of `/Users/vishnu01/tany`, branch `main`, HEAD `840322c`, audited 2026-10-21.
No code, config, migration or dependency was changed. This file is the only thing created.

**How to read this.** Every claim cites a file. `UNVERIFIED` means I did not read the code that would settle it, or it cannot be settled from the repo. "Built" means code exists and is connected, not that it has been run in production.

**Baseline warning.** The working tree has about 22 modified and many untracked files on top of HEAD (the earlier `docs/delivery/feature-audit.md` reports the same pattern at 246 paths). I audited the working tree, not a clean checkout. `lib/products.ts` (which already lists TanyCabs) is untracked.

**Naming.** The product is called TanyMotos in `lib/products.ts`, TanyCars in `README.md` and `DECISIONS.md`, and the industry key is `motors`. The code and DB use the word *dealer* for every tenant of every vertical (`dealers` table, `dealerId`, `scopedDb(dealerId)`). I use "tenant" and "dealer" interchangeably below.

---

## 1. Executive summary

- **Reuse is high for platform plumbing, low for domain logic.** Roughly 60% of what TanyCabs needs at the platform level (tenancy, auth, billing, theming, storage, payments, live tracking, super-admin) exists and works. About half of the domain rows have a usable analogue (orders, delivery partners, coupons, reviews, tracking); the rest (rate cards, fares, fleet, documents, scheduling, invoicing, WhatsApp) is new. Of the 43 matrix rows in section 4: 2 REUSE AS-IS, 22 ADAPT, 19 BUILD NEW.
- **Biggest win: the live-location stack.** Per-order Cloudflare Durable Object with WebSocket fan-out, signed short-lived tickets, rider geolocation page with wake lock, status-gated sharing (`workers/tracker/index.ts`, `lib/restaurant/live-location.ts`, `ws-ticket.ts`, `tracking.ts`, `app/(tenant)/sites/[dealer]/delivery/t/[token]/rider-trip.tsx`). It maps almost directly onto "driver shares location during trip only".
- **Second win: tenant isolation and payments.** `scopedDb(dealerId)` plus an ESLint ban on the raw client plus a leak test (`lib/db/scoped.ts`, `eslint.config.mjs`, `tests/tenant-leak.test.ts`) is a strong pattern. Razorpay Route with direct-to-operator transfers, signed webhook, idempotent apply, late-payment auto-refund is production-shaped (`lib/route/razorpay.ts`, `lib/restaurant/payments.ts`, `app/api/webhooks/razorpay/route.ts`).
- **There is no vertical abstraction.** A vertical is a string on `dealers.industry` and a pile of `if (dealer.industry === "restaurants")` branches across 14+ files. Motors and Eats are not copy-pasted, but they are coupled to one shared `dealers` row and one shared admin shell. A third vertical works by copying that pattern, but a fourth will hurt. A small "vertical registry" refactor first is cheap (section 6, R1).
- **Blocker 1: no customer identity.** Customers are unverified guests (name + typed phone) on every vertical (`lib/restaurant/orders.ts` `checkoutSchema`, `lib/restaurant/customers.ts`). The tenant-side `components/login-form.tsx` is a non-functional stub. Cabs needs OTP-verified customers (trip-start OTP, SOS, repeat booking, saved addresses). Firebase phone OTP exists but only for admins.
- **Blocker 2: no scheduling engine, no cron, no worker host.** Nothing models "vehicle X is free on date D". `wrangler.jsonc` has no cron triggers; the only background worker (`workers/index.ts`, pg-boss) has no production host per `docs/delivery/feature-audit.md`. Document-expiry alerts, booking reminders, unpaid-booking expiry all need this.
- **Blocker 3: no notification channel.** WhatsApp is a 3-line `wa.me` link builder (`lib/whatsapp.ts`) that needs a human to tap Send. No WhatsApp Business API, no SMS, no push, no email (`RESEND_API_KEY`, `FCM_*` are listed in `.env.example` as "not used yet"). Operators' owner alerts are a 20-second poll (`components/restaurant/order-alerts.tsx`).
- **Biggest gap in the domain:** fare engine (km slabs, min km/day, bata, toll, night, hill, permit), multi-leg trip lifecycle, advance + balance payments, GST invoices, fleet documents with expiry, driver identity beyond a PIN, SEO route pages (no sitemap/robots at all).
- **Security/compliance issues to fix before cabs:** rate limiting is per-isolate in-memory (ineffective on Workers); restaurant `orders.customer_phone` is plaintext while `leads.phone` is encrypted; guest tracking token is a 6-char code (fine for food, weak for a ride-share link); `dealerUsers` allows only `owner|staff` and code enforces one dealer per user.
- **Recommendation:** do a 1-week refactor (R1-R4 in section 6) first, then build Cabs in 5 sprints. Pre-booked MVP is realistic in about 10-12 engineer-weeks; WhatsApp BSP approval and customer OTP are the long-lead items to start on day 1.

---

## 2. Codebase map

### 2.1 Structure and versions

Single Next.js app, **not a monorepo**. `pnpm-workspace.yaml` exists only for pnpm build-script settings (UNVERIFIED beyond that; the `workers/jarvis/ui` Vite app is installed separately with `--ignore-workspace`, `package.json` scripts).

| Item | Value | Source |
|---|---|---|
| Next.js | 16.3.4, App Router, `proxy.ts` instead of `middleware.ts` | `package.json`, `DECISIONS.md` |
| React | 19.2.8 | `package.json` |
| UI | shadcn, style `base-luma` (Base UI, `render` prop not `asChild`), icons `hugeicons`, Tailwind 4 | `components.json`, `package.json` |
| ORM / DB | Drizzle 0.45 + Postgres; Neon over HTTP on Workers (WebSocket pool only for transactions) | `lib/db/client.ts` |
| Migrations | 23 SQL files `drizzle/0000`-`0022` | `drizzle/` |
| Auth | Auth.js v5 beta (JWT sessions, Credentials providers) over Firebase Auth ID tokens verified with `jose` | `lib/auth/index.ts`, `lib/auth/firebase.ts` |
| Hosting | Cloudflare Workers via OpenNext; wildcard route `*.tany.in/*`; R2 for media; Durable Objects for tracking; Analytics Engine for events | `wrangler.jsonc`, `open-next.config.ts` |
| Jobs | pg-boss, run as a Node process (`pnpm worker`) | `workers/index.ts`, `lib/jobs/boss.ts` |
| Payments | Razorpay: subscriptions (billing), Route (operator payouts), orders, refunds, webhook | `lib/billing/razorpay.ts`, `lib/route/razorpay.ts` |
| AI | Gemini via REST `fetch` (plates, captions, video analysis, buyer chat, voice entry) | `lib/ai/*` |
| Maps | Leaflet/OSM default; optional Google Maps JS if `NEXT_PUBLIC_GOOGLE_MAPS_KEY`; Nominatim geocoding; public OSRM routing | `components/restaurant/{leaflet-map,google-map}.tsx`, `lib/restaurant/{geocode,route}.ts` |
| Charts/tables | `ag-charts-community`, `ag-grid-community` | `package.json` |
| Tests | 31 vitest files, 3 Playwright specs | `tests/`, `e2e/` |
| Other workers | `workers/tracker` (Durable Object), `workers/jarvis` (internal Slack/ops assistant, not product) | `workers/` |

AGENTS.md says this Next.js has breaking changes and to read `node_modules/next/dist/docs/` before writing code. That directory exists. I did not need it for a read-only audit.

### 2.2 Multi-tenancy

**Routing** (`proxy.ts`, `lib/tenant/host.ts`)
- `classifyHost` maps host to one of: `marketing` (`tany.in`, `www`), `admin` (`app.tany.in`), `subdomain` (`<slug>.tany.in`, exactly one label), `custom` (verified entry in `dealer_domains`), `invalid`.
- Tenant requests are rewritten to `/sites/<slug>/...` (`app/(tenant)/sites/[dealer]/`). Direct hits on `/sites/*` return 404. The proxy deletes any client-sent `x-tenant-slug` header and sets its own.
- Reserved slugs: `RESERVED_SLUGS` in `lib/tenant/host.ts`.
- On tenant hosts only `/api/t/*` is reachable; all other `/api/*` is 404.
- Short-link redirect (`/k7x2m`) is car-specific (`resolveShortLink`, `looksLikeShortCode`) and fires an analytics event from inside the proxy.

**Resolution to a row:** `getDealerBySlug` (`lib/tenant/dealer.ts`) reads the full `dealers` row (unscoped by design) and returns `DealerProfile` with theme, `whiteLabel`, `suspended`.

**Isolation in the DB** (`lib/db/scoped.ts`)
- Application-level only. **No Postgres RLS** (grep for `ROW LEVEL`/`CREATE POLICY` in `drizzle/*.sql` finds nothing).
- `scopedDb(dealerId)` returns one hand-written repo per table. `direct()` tables carry `dealer_id`; `child()` tables (car media, views, etc.) scope through an `EXISTS` on `cars`. Updates and deletes need an explicit `where`; `dealerId`/`carId` are stripped from update payloads.
- The raw client is blocked from `app/`, `components/`, `hooks/`, `proxy.ts` by ESLint (`eslint.config.mjs`). It is used in `lib/auth`, `lib/tenant`, `lib/super`, `lib/bookings/service.ts`, `lib/cars/{publish,state}.ts`, `lib/restaurant/{admin-actions,payments}.ts`, `lib/variants/repo.ts`, and three admin settings/team files under `app/(admin)` (the ESLint rule is a *pattern* on `**/db/client`, and `app/(admin)/(shell)/settings/actions.ts`, `settings/team/{actions,page}.tsx` and `onboarding/page.tsx` import `unscopedDb`; UNVERIFIED whether they import via a path that matches the pattern or carry an inline disable).
- `tests/tenant-leak.test.ts` fails when a table gains `dealer_id`/`car_id` without registration.

**Consequence for Cabs:** every new tenant table needs a manual entry in `DIRECT_TENANT_TABLES`, a `direct(...)` line in the returned object, and an entry in the test's `UPDATE_PAYLOAD`. That is three places per table, ~15 new tables.

### 2.3 How a vertical is defined today

There is **no module boundary**. A "vertical" is:
1. A string `dealers.industry` (`text`, default `"motors"`, no enum, no CHECK) (`lib/db/schema/dealers.ts`).
2. An entry in `lib/industries.ts` (`INDUSTRY_KEYS = ["motors","restaurants"]`, labels, nouns, `firstItemHref`). The onboarding Zod schema uses `z.enum(INDUSTRY_KEYS)` (`lib/dealers/onboard.ts`).
3. Hard-coded branches. Files that test `industry === "restaurants"`/`"motors"`: `app/(tenant)/sites/[dealer]/{layout,page}.tsx`, `app/(admin)/(shell)/{layout,dashboard/page,settings/payments/page}.tsx`, `app/api/t/ws-ticket/route.ts`, `app/(super)/super/businesses/[id]/page.tsx`, `components/{app-sidebar,admin/mobile-nav,dashboard/welcome-dialog,super/super-grids}.tsx`, `components/onboarding/{industry-picker,product-carousel}.tsx`, `lib/{plans,route/razorpay}.ts`, and the `context()` guard in every tenant server action/route (`dealer.industry !== "restaurants"` returns "unavailable"; e.g. `app/(tenant)/sites/[dealer]/actions.ts`).
4. Separate schema files per vertical (`cars.ts`, `menu.ts`, `restaurant.ts`) but all registered in one barrel (`lib/db/schema/index.ts`) and one `scopedDb`.
5. Separate component folders (`components/cars`, `components/restaurant`) and lib folders (`lib/cars`, `lib/restaurant`).
6. Shared admin routes. Eats admin pages live at the same top-level paths as Motors (`/orders`, `/menu`, `/delivery-partners`...) under `app/(admin)/(shell)`; each Eats page calls `requireRestaurant()` (`lib/restaurant/guard.ts`) to reject non-restaurants. A catch-all `[...slug]/page.tsx` serves a "coming soon" page for unbuilt links.

So: **coupled through one `dealers` table and one shell, but not copy-pasted.** Eats reused Motors' tenancy, auth, billing, theming, storage and Razorpay Route wholesale. That is the good news: the third vertical follows an established pattern. The bad news is that the pattern is "add more `if`s".

Domain-flavoured columns live on the shared `dealers` row: `orderSettings`, `profile`, `serviceArea` (Eats), `businessHours` (Motors test-drive slots), `razorpayAccountId/Status`. `lib/plans.ts` is car-first (`maxLiveCars`) with a side table `RESTAURANT_MENU_LIMITS`.

`lib/products.ts` already lists `tanycabs` (no `industry` mapped), with story copy, audience tags, an animated how-it-works page `public/brand/tanycabs-how-it-works.html`, and brand SVGs. Onboarding UI (`components/onboarding/product-carousel.tsx`, `find-my-tany.tsx`) therefore already shows TanyCabs as a non-selectable card.

### 2.4 Shared UI, tokens and design system

- Space Grotesk loaded in `app/layout.tsx` as `--font-sans`. Brand tokens live in `app/globals.css` (shadcn CSS variables). Per-tenant theme = `primary`, `primaryForeground`, `accent`, `radius`, validated for WCAG AA and injected as CSS variables on the tenant wrapper (`lib/theme/tokens.ts`, `app/(tenant)/sites/[dealer]/layout.tsx`).
- 34 shadcn primitives in `components/ui/`. **Missing for Cabs:** `calendar`, `popover`, `command` (combobox/autocomplete), `date picker`, `toggle-group`, `stepper`. `react-day-picker` is installed but has no shadcn wrapper. Add with `pnpm dlx shadcn@latest add calendar popover command` per AGENTS.md.
- Admin shell is the shadcn sidebar block (`components/app-sidebar.tsx`) with nav config in `components/admin/nav-config.ts`; mobile admin nav in `components/admin/mobile-nav.tsx`. Generic building blocks reusable as-is: `components/dashboard/stat-card.tsx`, `components/restaurant/{page-header,data-grid,forms,image-upload,new-sheet,range-switch,analytics-charts}.tsx` (the folder name says restaurant but most are generic).
- Customer shell for Eats: `components/restaurant/store/*` (header, bottom nav, cart, footer). Cabs needs its own shell; `StoreShell` is dish/cart-specific.

### 2.5 Cross-cutting capabilities

| Capability | State | Evidence |
|---|---|---|
| Admin auth | Built. Firebase (Google, phone OTP, email+password) to Auth.js JWT. Teammates log in with email/phone + owner-set password. Dev bypass and `local-login` are gated on `NODE_ENV === "development"`. | `lib/auth/*`, `components/auth/dealer-login-form.tsx` |
| Customer auth | **Absent.** Guests only. `components/login-form.tsx` is a static stub (`href="#"`, no handlers). `components/tenant/account-menu.tsx` hard-codes "My Appointments / My Bookings" labels. | see files |
| Roles | `dealer_role` enum `owner|staff`; owner-only team management; no permissions. | `lib/db/schema/enums.ts`, `settings/team/actions.ts` |
| Rider/driver auth | Two mechanisms: (a) rider ID + PIN to signed cookie scoped to path `/delivery` (12 h); (b) per-order bearer link (24 random bytes, SHA-256 stored, encrypted copy for re-send). | `lib/restaurant/rider-session.ts`, `delivery/actions.ts`, `lib/restaurant/trip.ts`, `tracking.ts` |
| Payments | Razorpay: subscription billing, Route orders with `transfers` straight to operator's linked account, signature verify, webhook (`subscription.*`, `payment.captured`, `account.*`), full refunds with `reverse_all`, 20-min unpaid-order expiry done lazily on page reads. | `lib/billing/*`, `lib/route/razorpay.ts`, `lib/restaurant/payments.ts` |
| Notifications | `wa.me` link builder only. In-app: admin polling every 20 s with chime + toast. | `lib/whatsapp.ts`, `components/restaurant/order-alerts.tsx` |
| File uploads | R2 via S3 SDK; photos proxied through `PUT /api/upload/[...key]` (requires **admin** session; key must start with `dealers/<id>/`); videos presigned direct to R2; IndexedDB offline queue with backoff; local-disk fallback in dev. | `lib/storage/*`, `app/api/upload/[...key]/route.ts`, `lib/upload/{queue,idb}.ts`, `lib/media/keys.ts` |
| Maps/location | Leaflet default, Google optional (display only). Geocode/search/pincode via public Nominatim, 1 req/s throttle, in-memory cache. Routing via public OSRM demo, route shared per delivery through the Durable Object. No Google Places, no Distance Matrix, no toll data. | `lib/restaurant/{geocode,route,route-plan,location}.ts` |
| PWA | `app/manifest.ts` only: name "TanyApps", `start_url: /dashboard`, standalone, two icons. **No service worker anywhere** (searched `app`, `components`, `lib`, `hooks`, `public`). So: installable on Android, no offline shell, no push, uploads pause when app closes (`DECISIONS.md` says so). The manifest is **per-platform, not per-tenant**: a cab operator's customers cannot install "Anna Travels". Tenant `start_url` would have to be dynamic. | `app/manifest.ts` |
| Analytics | Cloudflare Analytics Engine, events `view|share_click|chat|store_view`, indexed by dealer, blobs include `carSlug`. Dashboard reads via the SQL API. | `lib/analytics/*` |
| Background jobs | pg-boss queue with one queue (`video-process`). No scheduler/cron. Lazy "expire on read" pattern instead. | `lib/jobs/boss.ts`, `workers/index.ts`, `wrangler.jsonc` (no `triggers`) |
| Rate limiting | In-memory sliding window per server instance, with a TODO to move to a shared store. | `lib/rate-limit.ts` |
| Encryption | AES-256-GCM helper for sensitive fields. Used for car reg numbers, `leads.phone`, `bookings.buyerPhone`, rider tokens, RC cache. | `lib/crypto/index.ts` |
| Billing / plans | Trial 30 d, free plan, monthly/yearly, grace 3 d, suspension takes the public site offline. Plan limits are `maxLiveCars` and `RESTAURANT_MENU_LIMITS`. | `lib/billing/state.ts`, `lib/plans.ts` |
| Super admin | `/super` on the app host, allow-list by email, read-only, cross-tenant lists, CSV export. | `app/(super)/*`, `lib/super/*` |
| i18n | `lib/copy.ts` plus `lib/copy-ta.ts` (Tamil) exist. Extent of coverage UNVERIFIED. | `lib/copy*.ts` |
| Time zones | Only IST day-bucketing in super-admin SQL and `startOfDayIst` in restaurant stats. No tz model. Fine for India-only, but trip times need explicit handling. | `lib/super/queries.ts:45`, `lib/restaurant/stats.ts` |

---

## 3. Current DB schema inventory

20 application tables (+ pg-boss's own schema, created at runtime by `lib/jobs/boss.ts`). Source: `lib/db/schema/*.ts`, `drizzle/*.sql`. Enums in `lib/db/schema/enums.ts`.

| Table | Purpose | Scope | Tenant-scoped via |
|---|---|---|---|
| `users` | Auth.js user; email, E.164 phone, optional scrypt `password_hash` for teammates | SHARED | n/a (global) |
| `accounts` | Auth.js provider links (Firebase uid) | SHARED | n/a |
| `dealers` | Tenant root: slug, industry, theme, plan, billing/trial/subscription fields, Razorpay Route account, plus Eats columns (`order_settings`, `profile`, `service_area`) and Motors `business_hours` | SHARED (carries vertical columns) | n/a (the root) |
| `dealer_users` | Membership: (dealer, user, role owner/staff) | SHARED | `dealer_id` |
| `dealer_domains` | Custom domains with `verified_at` | SHARED | `dealer_id` |
| `coupons` | Per-tenant coupon codes (percent/flat, min order, cap, expiry, used count) | SHARED (lives in `restaurant.ts`, vertical-neutral) | `dealer_id` |
| `reviews` | Rating + comment + moderation status, optional `order_id` | SHARED (lives in `restaurant.ts`, FK to `orders`) | `dealer_id` |
| `enquiries` | Contact-form messages | SHARED (lives in `restaurant.ts`) | `dealer_id` |
| `banners` | Promotional banners on the storefront | SHARED (lives in `restaurant.ts`) | `dealer_id` |
| `variants` | Master car model/spec catalogue (446 rows, seeded from CSV) | MOTOS (global reference data) | none, read-only global |
| `cars` | A listed vehicle: encrypted reg number, status, price, slug, short code, marketplace JSON | MOTOS | `dealer_id` |
| `car_media` | Photos/videos per car, angle, processing status | MOTOS | via `cars` |
| `rc_lookups` | Cached RC provider responses (encrypted) | MOTOS | via `cars` |
| `car_views` | Per-view engagement rows | MOTOS | via `cars` |
| `rc_transfers` | RTO transfer tracking with buyer token | MOTOS | via `cars` |
| `price_events` | Append-only price history (DB trigger blocks update/delete) | MOTOS | via `cars` |
| `leads` | Test-drive / enquiry / hold leads (encrypted phone, `preferred_at`) | MOTOS | `dealer_id` |
| `bookings` | A buyer's paid token amount for a car (Razorpay order, status) | MOTOS | `dealer_id` |
| `menu_categories` | Menu sections | EATS | `dealer_id` |
| `menu_items` | Dishes: price, `portions` JSON, single `image_url`, stock, veg flag | EATS | `dealer_id` |
| `orders` | Guest order: JSON `lines` snapshot, totals, status text, payment fields, rider token hash/enc, lat/lng, delivery timestamps | EATS | `dealer_id` |
| `delivery_partners` | Riders: code, name, phone, vehicle number, PIN hash, active | EATS | `dealer_id` |
| `delivery_zones` | Pincode zones with fee, min order, ETA | EATS | `dealer_id` |
| `stock_adjustments` | Inventory audit trail | EATS | `dealer_id` |
| `order_locations` | Dev/fallback latest rider position per order (prod uses the Durable Object) | EATS | `dealer_id` |

Notes that matter for Cabs:
- `bookings` is **Motors-specific** despite the name (FK to `cars`, `lead_id`). A cab "booking" needs its own table; reusing the name will confuse everyone. Suggest `trips`/`cab_bookings`.
- `orders.status`, `fulfilment`, `payment_method`, `payment_status` are free `text` with comments listing valid values, not enums or CHECKs. Typos are undetectable at the DB level.
- `orders.customer_phone` is **plaintext**; `leads.phone` and `bookings.buyer_phone` are encrypted. Inconsistent PII handling (see section 6, S3).
- Currency is whole rupees as `integer` everywhere. Fine for fixed prices; fares with per-km decimals and GST need paise or a rounding rule.
- Money for Razorpay is `amount * 100` at call sites.
- `dealers` has orphan JSDoc comments (the comments for `orderSettings`/`profile`/`subscriptionId` are misaligned with their columns). Cosmetic, but it signals that the row is accreting.

---

## 4. Reuse matrix

Legend: **REUSE AS-IS** works with no code change except config/data; **ADAPT** a working analogue exists and needs schema/UI/logic changes; **BUILD NEW** nothing usable (or the closest thing would be forced). Effort: S ≤ 2 days, M ≤ 1 week, L > 1 week (one engineer).

### 4.1 Customer PWA

| Feature | Status | Existing source | What changes / what's missing | Effort |
|---|---|---|---|---|
| Phone OTP login (customer) | ADAPT | Admin phone OTP: `components/auth/dealer-login-form.tsx`, `components/onboarding/phone-verify.tsx`, `lib/auth/firebase.ts` (`verifyFirebaseIdToken`), `lib/auth/firebase-user.ts`, `lib/tenant/user-phone.ts`. Dead stub: `components/login-form.tsx`, `app/(tenant)/sites/[dealer]/account/page.tsx` | Firebase OTP works but produces an *admin* session on `app.<root>` (`proxy.ts` allows `/api/auth` only there; `trustHost`). Tenant hosts are different origins, so a customer session cookie must be issued on `<slug>.tany.in` or a custom domain. Needs a separate customer session (new cookie, new `customers` table keyed by dealer + phone), reCAPTCHA on each tenant origin (Firebase Authorized domains includes wildcard? UNVERIFIED), and OTP cost controls. | L |
| Saved addresses, profile | BUILD NEW | None. Guests only; "recent orders" are codes in `localStorage` key `tany-orders` (`lib/restaurant/recent-orders.ts`); `lib/restaurant/customers.ts` derives "customers" from orders by phone. | `customers`, `customer_addresses` tables; profile page. Depends on the row above. | M |
| Trip type selection (airport / outstation one-way / round / hourly / package) | BUILD NEW | Pattern only: Eats fulfilment `delivery|pickup|dine_in` as a text enum (`lib/restaurant/settings.ts`, `lib/restaurant/orders.ts`) | New `trip_type` model, per-type form rules (hours vs days vs return date). shadcn `tabs` exists. | S-M |
| Pickup & drop with Maps autocomplete | ADAPT | `components/restaurant/store/location-picker.tsx` (type-ahead via server action `searchPlaces`), `lib/restaurant/geocode.ts` (Nominatim search/reverse/pincode), `components/restaurant/store/{pin-map,leaflet-pin-map,google-pin-map}.tsx` | Nominatim public endpoint is policy-limited (1 req/s, identifying UA, light use; code throttles *per server isolate*, not globally) and is poor at Indian landmarks. Production autocomplete needs Google Places (New) or a paid geocoder; this repo has **no Places code** (Google Maps is optional display only). India bounding is hard-coded (`validCoords`: lat 6-38, lng 68-98.5). Add two-point selection, saved places, airport/railway presets. | M |
| Date & time picker | BUILD NEW (UI only) | `react-day-picker` ^10 in `package.json`; no `components/ui/calendar.tsx`, `popover.tsx`, `command.tsx` | `pnpm dlx shadcn@latest add calendar popover`; time-of-day control; lead-time rules; IST handling. Motors' `leads.preferred_at` is the only time input and has no slot logic. | S |
| Vehicle class catalogue (photo, seats, luggage, AC) | ADAPT | `menu_items` + `menu_categories` (`lib/db/schema/menu.ts`), admin CRUD `app/(admin)/(shell)/menu/*`, `components/restaurant/{menu-item-form,categories-manager,image-upload}.tsx`, buyer grid `components/restaurant/store/{menu-catalogue,dish-card}.tsx`. For multi-photo: `car_media` + `components/capture/*` (12-angle car capture) | `menu_items` has one `image_url`, a veg flag, stock counts, and `portions` (label+price). Not a fit for seats/luggage/AC/bags/model examples. Recommend a new `vehicle_classes` table (the *product*), separate from the physical `vehicles` (the *asset*), reusing the form/grid/upload components. Do not overload `menu_items`. | M |
| Fare estimator (per-km × distance, min km/day, bata, toll, night, hill, permit, hourly slabs) | BUILD NEW | Closest ideas: pure pricing function `priceOrder()` (`lib/restaurant/orders.ts`, well unit-tested style), haversine `distanceKm` (`lib/restaurant/service-area.ts`), OSRM road route with km/min (`lib/restaurant/route.ts`), zone fee lookup by pincode (`lib/restaurant/delivery.ts`) | Whole rule engine is new: rate card per vehicle class × trip type, min billable km/day, multi-day outstation, driver bata per day, night window, hill/ghat surcharge, state permit/border tax, toll. **No toll data source exists** (OSRM demo has none; would need Google Routes/TollGuru or manual per-route tolls). OSRM public demo is "light use only" and gives no traffic. Server must compute the authoritative fare (same trust model as `priceOrder`). Needs an integer-paise or explicit rounding policy and GST. | L |
| Booking flow & confirmation | ADAPT | `placeOrder` server action (`app/(tenant)/sites/[dealer]/actions.ts`): rate limit, Zod parse, server-side pricing, idempotent code retry on unique violation, Razorpay order creation; confirmation page `app/(tenant)/sites/[dealer]/o/[code]/page.tsx`; `track-order` page | Replace line items with a trip request; replace stock reservation with vehicle-class availability hold; add quote expiry; add operator accept/reject before payment (Eats auto-accepts). | M |
| Booking history | ADAPT | Eats: device-local order codes only (`recent-orders.ts`). Admin side lists all orders. | Customer-visible history requires the customer identity above. | S (after OTP) |
| Repeat booking | BUILD NEW | None | "Book again" from a past trip prefilling route/vehicle; trivial once history exists. | S |
| Payments: advance / full via UPI (Razorpay), cash option | ADAPT | `createFoodOrder`, `refundPayment` (`lib/route/razorpay.ts`); `applyOrderPayment`, late-payment refund (`lib/restaurant/payments.ts`); client launcher `components/restaurant/store/razorpay.ts`, `pay-now.tsx`; webhook `app/api/webhooks/razorpay/route.ts`; payment-method toggle `cod|online` (`lib/restaurant/settings.ts`) | Razorpay Checkout shows UPI itself; no UPI-specific code needed. Eats models **one** payment per order. Cabs needs advance + balance (two or more payments), cash collected by driver (reconcile and commission-free ledger), cancellation fees/partial refunds (`refundPayment` already takes an amount; no policy engine), optional `on_hold` transfers released after trip (currently hard-coded `on_hold: 0`). Webhook currently routes `payment.captured` to Eats first, then Motors; add Cabs as a third branch by Razorpay order id (or tag with `notes`). | L |
| Driver & vehicle details shared after assignment | ADAPT | Rider-to-guest data in `lib/restaurant/admin-actions.ts` (rider name/phone to WhatsApp message), `components/restaurant/share-delivery.tsx`, guest page `app/(tenant)/sites/[dealer]/o/[code]/page.tsx` | Add driver photo, vehicle reg/model/colour, masked-number policy. Send via notification channel (missing). | S |
| Live tracking link | ADAPT (strong) | `workers/tracker/index.ts` (Durable Object, WS hibernation, 1 s min gap, India bounds check, 6 h self-delete), `lib/restaurant/{live-location,live-socket,ws-ticket,tracking,route-plan,route}.ts`, `app/api/t/{rider-location,ws-ticket,order-location,track}/route.ts`, `components/restaurant/store/track-live.tsx`, `components/restaurant/live-map.tsx` | Channel key is `<dealerId>:<orderId>` (rename to a generic `entityId`; or reuse with `tripId`). Routes are single-destination; a trip has pickup → (stops) → drop. Guest ticket needs a stronger secret than a 6-char code (see S4). `app/api/t/*` routes hard-reject non-restaurant tenants. Only the **latest** fix is kept; no breadcrumb history. | M |
| Trip start OTP | BUILD NEW | None. (Rider status step machine exists: `riderNext()` in `rider-session.ts`.) | Generate/store hashed 4-digit OTP per trip, show to customer, verify in driver app with attempt limit; ties into start-odometer. | S-M |
| SOS button | BUILD NEW | None | Customer SOS: share live link + coordinates to saved contacts and operator, call 112/operator; needs the notification channel (SMS/WhatsApp) to be real. Policy decision for operator escalation. | M |
| Share trip with family | ADAPT | Guest tracking + `whatsappLink()` (`lib/whatsapp.ts`, `lib/restaurant/tracking.ts`) | Dedicated, unguessable, expiring share token per trip, separate from the customer's own token. | S |
| Invoice / GST invoice download | BUILD NEW | None. `grep` for invoice/GSTIN finds only Tany's own pricing copy in super-admin and `lib/copy.ts`. | Invoice numbering (per tenant, per FY), GSTIN capture for operator and corporate customers, SAC code 9964 vs 9966 rules, PDF generation on Workers (no PDF lib present), storage in R2. | L |
| Rating & review | ADAPT | `reviews` table (name, rating, comment, `pending|approved|hidden`) and admin `app/(admin)/(shell)/reviews/page.tsx`; storefront reviews UI (UNVERIFIED which component) | Link to `trip_id` and `driver_id`; one-per-trip constraint; verified-customer badge once OTP exists. Currently `order_id` is a FK to `orders`, so add a nullable `trip_id`. | S |

### 4.2 Operator dashboard

| Feature | Status | Existing source | What changes / what's missing | Effort |
|---|---|---|---|---|
| Self-serve store setup (<3 min): logo, brand colour, subdomain | ADAPT | Wizard `app/(admin)/onboarding/{page,actions,onboarding-wizard}.tsx`, `lib/dealers/onboard.ts` (slug, palettes, hours, plan), `lib/tenant/create-dealer.ts` (transactional create), `lib/cloudflare/domains.ts` (attach `<slug>.tany.in`), `lib/theme/tokens.ts`, `components/onboarding/industry-picker.tsx` | Add `cabs` to `INDUSTRY_KEYS`/`INDUSTRIES` (`lib/industries.ts`), map `tanycabs` in `INDUSTRY_PRODUCT` (`lib/products.ts`), Cabs copy in `components/onboarding/*`, `HOURS_PRESETS` (cabs: 24×7), Razorpay profile category (`lib/route/razorpay.ts` currently chooses between "food/restaurants" and "automobile/dealer"; needs a transport category, verify against Razorpay's category list, UNVERIFIED). Subdomain mapping is "skipped unless `CLOUDFLARE_API_TOKEN` is set; never confirmed in production" per `docs/delivery/feature-audit.md`. | S-M |
| Fleet management: vehicles + documents (RC, insurance, permit, FC) with expiry alerts | BUILD NEW | Precedents: car record with `insurance_valid_till` date (`lib/db/schema/cars.ts`), RC lookup adapters (`lib/rc/*`: Surepass, never called with a real key per `DECISIONS.md`), photo/doc upload (`lib/upload/*`, `lib/media/keys.ts`, `api/upload`) | `vehicles`, `vehicle_documents` (type, number, valid_from/till, file key). Expiry alerts need a scheduler + a notification channel (neither exists). `/api/upload` allows only image content types (`PHOTO_TYPES`; PDF support UNVERIFIED), so PDFs of RC/insurance need allowing. RC auto-fetch (Surepass) is optional. | L |
| Driver management: license, documents, availability, attendance | ADAPT | `delivery_partners` (code, name, phone, vehicle number, PIN hash, active), admin `app/(admin)/(shell)/delivery-partners/page.tsx`, `components/restaurant/{assign-partner,forms}.tsx`, `lib/restaurant/admin-actions.ts` | Add license number/expiry, Aadhaar/PAN refs (encrypt), badge, photo, employment type (own/attached/freelance), languages, status (available/on-trip/off), duty log for attendance. Decide: rename table or create `drivers`. Drivers are not `users` today (PIN only); a phone-OTP driver login would be better for cabs (see 4.3). | M |
| Rate card configuration per vehicle class & trip type | BUILD NEW | Config CRUD precedents: `delivery_zones` + `app/(admin)/(shell)/delivery-zones/page.tsx`, `settings/ordering`, form kit `components/restaurant/{forms,simple-forms,data-grid}.tsx` | `rate_cards` (class × trip_type × validity) + `rate_surcharges` (night, hill, permit by state), toll table, preview calculator. Effort driven by UX of the matrix, not by plumbing. | L |
| Booking inbox: accept / reject / assign driver; status pipeline | ADAPT | Orders list/detail `app/(admin)/(shell)/orders/{page,[id]/page}.tsx`, `components/restaurant/{live-board,ops-grids,action-button,order-alerts}.tsx`, status machine `nextStatuses()`/`timelineFor()` (`lib/restaurant/orders.ts`), driver assignment `assign-partner.tsx` + `issueRiderToken`/`forgetRiderLink` (`lib/restaurant/trip.ts`) | New states: `requested → quoted? → confirmed → driver_assigned → en_route_to_pickup → arrived → in_trip → completed → settled`, plus `rejected/cancelled/no_show`. Eats uses free-text status; make the new one a DB enum + transition table. Conflict detection on assignment (driver or vehicle double-booked) is new. Alerts: 20 s polling only. | M |
| Availability calendar (which vehicle is free when) | BUILD NEW | None. `lib/hours.ts` is display-only formatting. No slot or overlap logic exists anywhere (`grep slot` finds nothing relevant). | `trip` time ranges on vehicle and driver; overlap query (a Postgres `tstzrange` exclusion constraint is the robust way; Drizzle has no native range type so raw SQL migration); buffer/turnaround rules; calendar/Gantt UI (not in shadcn; consider `ag-grid` or a simple custom timeline). | L |
| Manual booking entry (phone / walk-in) | BUILD NEW | Form kit only. (`app/(admin)/(shell)/order-by-location/page.tsx` is an analytics page, despite the name.) | Operator-side create-trip form reusing the same fare engine and trip creation function; channel = `phone|walk_in|web`. Falls out of well-factored booking code. | M |
| Payments, driver payouts, expense tracking (fuel, toll) | ADAPT / BUILD NEW | Payments view `app/(admin)/(shell)/payments/page.tsx` + `PaymentsGrid` (reads `orders`); refunds `refundOrder` | Customer payments view adapts. **Driver payouts and expenses are new**: `driver_payouts`/ledger, `trip_expenses` (fuel, toll, parking, with receipt), settlement per trip or per day. Operators do not use Razorpay for driver pay in MVP; this is a ledger, not a payment rail. | L |
| Reports: revenue, trips, per-vehicle profitability | ADAPT | `lib/restaurant/stats.ts`, `app/(admin)/(shell)/{reports,analytics,dashboard}/page.tsx`, `components/restaurant/{analytics-charts,restaurant-charts,range-switch}.tsx`, `components/dashboard/stat-card.tsx` | Chart/grid components are reusable; queries are new. Per-vehicle profit needs expenses + payouts to exist first. | M |
| Coupons | REUSE AS-IS (+ small adapt) | `coupons` table, `couponDiscount()` pure function (`lib/restaurant/orders.ts`), admin page `app/(admin)/(shell)/coupons/page.tsx`, `previewCoupon` action | Works for percent/flat/min/cap/expiry. Missing for cabs: per-customer limit, max-uses cap, trip-type/route restriction, first-ride-only. Note `used_count` is bumped non-atomically with respect to a max (there is no max). | S |
| Corporate accounts | BUILD NEW | None | `corporate_accounts` (GSTIN, credit terms, billing contact), linked customers/employees, monthly consolidated invoice. Depends on invoicing. | L |
| Customer CRM | ADAPT | `summariseCustomers()` (`lib/restaurant/customers.ts`), `app/(admin)/(shell)/customers/{page,[phone]/page}.tsx` | Derived-from-orders today. With a `customers` table: tags, notes, last trip, lifetime value. | S-M |
| Staff roles & permissions | BUILD NEW | `dealer_role` enum owner/staff (`lib/db/schema/enums.ts`); teammates all have identical access (`docs/delivery/feature-audit.md`); one user = one dealer (`lib/auth/context.ts`) | Cabs needs at least `owner`, `manager`, `dispatcher`, `accountant`, `driver`. Needs a permission check helper on every admin server action (today most check only `ctx.status === "ok"`). A driver who is also an operator's employee, or a user who works for two operators, is blocked by the one-dealer rule. | M-L |

### 4.3 Driver PWA

| Feature | Status | Existing source | What changes / what's missing | Effort |
|---|---|---|---|---|
| Driver login; assigned trip list | ADAPT | PIN sign-in `riderSignIn` + cookie scoped to path `/delivery` (`app/(tenant)/sites/[dealer]/delivery/actions.ts`, `lib/restaurant/rider-session.ts`); trip list `app/(tenant)/sites/[dealer]/delivery/[code]/{page,rider-view}.tsx`; per-trip link page `delivery/t/[token]/{page,rider-trip}.tsx` | Works as a pattern: signed cookie, brute-force limits (8/15 min per ID, 30/15 min per IP), same error whether ID/PIN wrong. Gaps: PIN auth is weak for a driver who sees customer phone numbers; the limiter is per-isolate (S1); cookie is bound to `/delivery`, so it cannot also serve `/driver/*` unless paths change. A separate installable manifest/start URL is needed so a driver can "install" the app (platform manifest is for `/dashboard`). | M |
| Navigation deep link | REUSE AS-IS | `https://www.google.com/maps/dir/?api=1&destination=lat,lng` in `rider-trip.tsx:196` and `rider-view.tsx:79`; `mapsUrl()` in `lib/restaurant/location.ts` | Add waypoint(s) for pickup then drop. Pure link generation, no API key. | S |
| Start / end trip with OTP + odometer photo | BUILD NEW | Status step helper `riderNext()` only | OTP verify, odometer photo capture (camera component exists for car angles: `components/capture/*`, but is admin-session bound), `trip_events` with odometer start/end and timestamps, tamper-evidence. | M |
| Toll / parking receipt upload | BUILD NEW | Upload pipeline exists but `PUT /api/upload` requires `getDealerContext()` (an admin session) and the key prefix `dealers/<dealerId>/` (`app/api/upload/[...key]/route.ts`). A driver has neither. | New driver-authenticated upload path (accept the rider/driver cookie or trip token), with content-type, size and per-trip key prefix limits. Reuse `lib/storage` and `lib/upload/queue.ts` unchanged. | M |
| Live location sharing during trip only | ADAPT (strong) | `rider-trip.tsx` (geolocation `watchPosition`, wake lock, WS with HTTP fallback), `sharingAllowed(status)` (`lib/restaurant/tracking.ts`), tracker DO (`workers/tracker/index.ts`), `POST /api/t/rider-location` | Trip statuses replace order statuses in `sharingAllowed`. Key facts: web geolocation stops when the PWA is backgrounded or the screen locks (wake lock only helps while visible); outstation trips of 6-12 h on Android need a foreground notification, which a PWA cannot do. Expect gaps in tracking; design for it. DO purges after 6 h without updates (`KEEP_MS`), and each update re-arms the alarm, so long trips survive as long as fixes arrive. No history is stored (S6). | M |
| Daily earnings | BUILD NEW | None | Aggregate from `trips` + `driver_payouts`; a simple screen. Depends on payout ledger. | S-M |

### 4.4 Platform layer

| Feature | Status | Existing source | What changes / what's missing | Effort |
|---|---|---|---|---|
| Tenant onboarding | ADAPT | see 4.2 first row | as above | S-M |
| Subscription / tech-fee billing | ADAPT | State machine `lib/billing/state.ts` (free, trial, active, grace, suspended, legacy), Razorpay subscriptions `lib/billing/razorpay.ts` (plans created lazily by `notes.key`), service `lib/billing/service.ts`, UI `components/billing/*`, `app/(admin)/(shell)/settings/{billing,plan}/*`, webhook handlers | State machine is vertical-neutral and reusable as-is. Plan *content* is not: `PlanConfig.maxLiveCars`, the Razorpay plan description literal `Up to ${maxLiveCars} live cars` (`lib/billing/razorpay.ts`), `planLimitLabel()` branching on `"restaurants"` (`lib/plans.ts`). Need a per-industry limit map (vehicles, drivers, monthly bookings). Pricing for Cabs is a product decision (flat tech fee vs per-booking). "Zero commission" implies flat fee. | M |
| Super-admin | ADAPT | `app/(super)/super/*` (businesses, orders, cars, menu, customers, revenue...), `lib/super/{data,queries,guard}.ts`, `components/super/*` | Add Cabs pages/tabs and include trips in GMV, activity feed, health, CSV export. Queries are hand-written per vertical. Read-only today; suspensions/plan changes require an audit-log table first (`DECISIONS.md`). | M |
| WhatsApp Business notifications (confirmed, driver assigned, trip done) | BUILD NEW | Only `lib/whatsapp.ts` (`wa.me` link) and `components/restaurant/share-delivery.tsx` (admin taps to open WhatsApp with a prefilled message) | Real implementation needs: BSP or Meta Cloud API account, business verification, template approval (days to weeks), opt-in capture, webhook for delivery/read/inbound, an outbox table + worker with retries, per-tenant sender number decision (Tany-wide number vs operator's own), cost metering. SMS fallback (DLT registration in India) is separate. **Start the approvals on day 1; code is the easy part.** | L |
| SEO landing pages ("Chennai to Tirupati cab") | BUILD NEW | Tenant `generateMetadata` only gives `title` (`app/(tenant)/sites/[dealer]/layout.tsx`). No `sitemap.ts`, no `robots.ts`, no structured data, no OG images (`find app -name sitemap* -o -name robots*` returns nothing). | `route_pages` (origin, destination, distance, rate-card-derived "from ₹" price, FAQ), `generateStaticParams`/ISR per tenant, per-tenant sitemap served via the proxy (host-based), JSON-LD (`TaxiService`/`Offer`), canonical URLs for custom domains. Thin/duplicate content risk across tenants serving the same route. | L |
| Analytics / event tracking | ADAPT | `lib/analytics/{events,track,query}.ts` (Analytics Engine; blob schema is `[event, carSlug, source, device, country]`), `components/tenant/view-beacon.tsx`, `/api/t/track` | Event enum is `view|share_click|chat|store_view` and the second blob is a car slug. Add `quote_viewed`, `booking_started`, `booking_paid`, `cab_route_view`, with `route`/`vehicle_class` in the blob slot; keep dealer id as the index. | S |

### 4.5 Tally

43 rows above (rows with two statuses counted once by their dominant one).
- REUSE AS-IS: 2 (navigation deep link, coupons).
- ADAPT: 22.
- BUILD NEW: 19.

By effort weight the **new** work is larger than the adapt work: about 60% of estimated person-weeks are in the BUILD NEW rows (fare engine, scheduling, invoicing, WhatsApp, documents, roles, payouts).

---

## 5. Cross-vertical pattern mapping

| Eats / Motors concept | Cabs concept | Generic enough to share? | Coupling risk if shared |
|---|---|---|---|
| `menu_items` + `portions` (`lib/db/schema/menu.ts`) | `vehicle_classes` / rate card rows | **No.** Share the *UI kit* (forms, grid, image upload), not the table. A menu item is a priced SKU with stock; a vehicle class has capacity attributes and a rate matrix. | High: stuffing seats/luggage into `jsonb` on `menu_items` would leak veg flags, stock, portions into cab UIs and force `if (industry)` everywhere. |
| `menu_categories` | Vehicle class grouping (Sedan / SUV / Tempo) | Trivially; but a plain `sort_order` column on `vehicle_classes` is simpler. | Low if skipped. |
| `cars` (asset with docs, status, media) | `vehicles` (asset with docs, status, media) | **Partly.** Shared concepts: registration number (encrypted), insurance validity, photos via `car_media`-style table, status. But `cars` is a *for-sale listing* (price, km, owner count, short code, price events, RC transfer). A cab `vehicle` is an *operating asset*. Extract a neutral `media` table (kind, key, status, sort, analysis) and the upload plumbing; do not reuse `cars`. | Medium: `CHILD_TENANT_TABLES` scopes through `cars`. A generic media table needs its own scope strategy (`dealer_id` column directly is simplest). |
| `orders` + status machine (`ORDER_STATUSES`, `nextStatuses`, `timelineFor`) | `trips`/`cab_bookings` + lifecycle | **The pattern, not the table.** A pure "status graph with next-allowed" module generalises well (`nextStatuses` is already a pure function). The `orders` row is full of Eats fields (lines, fulfilment, stock_released, rider tokens). | High if shared: `orders.lines` JSON snapshot and `stock_released` have no meaning for cabs. Create `trips`; extract `statusGraph` helper. |
| `order_code` (6-char) + `/o/[code]` tracking | Booking reference | Share the generator `newOrderCode` (`lib/restaurant/orders.ts`) and the unique-retry insert loop. Use a **longer** token for the live-share link (S4). | Low. |
| Delivery partner + PIN login + rider token link | Driver + driver login + per-trip link | **Yes, mostly.** Concepts match 1:1: assign person → issue link → person updates status → share location. Generalise `lib/restaurant/{trip,rider-session,tracking}.ts` into a neutral `fulfilment-agent` module and keep Eats wrappers. | Medium: the code is named for orders/restaurants (`orders.riderTokenHash`, `industry !== "restaurants"` guards in four `/api/t/*` routes). Refactor once, in place. |
| Live location DO (`OrderTracker`) | Trip tracker | **Yes.** Pure position pub/sub keyed by a string; nothing Eats-specific inside `workers/tracker/index.ts`. Rename key semantics (`entityId`). | Low. |
| `delivery_zones` (pincodes → fee, min order, ETA) | Service-area / city pricing / permit zones | Concept only. Cabs prices by distance and route, not pincode. Reuse the admin CRUD pattern; keep zone as an optional "serviceable area" gate. `dealers.service_area` (radius from a point) could gate pickup cities. | Medium: `service_area` is a jsonb on `dealers` named for restaurants. |
| Delivery fee / min order logic in `priceOrder` | Fare estimator | Share nothing but the **shape**: pure function in, `{ok, breakdown}` out, server-authoritative, unit-tested. | None; it is a new function. |
| `coupons` | Cab coupons | **Yes**, as-is plus columns. | Low. |
| `reviews` | Trip reviews | **Yes**, add `trip_id`/`driver_id`. | Low. |
| `enquiries` | Quote requests / custom package enquiries | **Yes.** A natural fit for "package tours" (request custom itinerary). | Low. |
| `banners` | Offers/promos | **Yes.** | Low. |
| Motors `leads` + `preferred_at` | Quote request with preferred pickup time | Pattern only; Motors lead is car-bound (FK). | Low. |
| Motors `bookings` (token payment to hold a car) + `applyBookingPayment` | Advance payment to hold a vehicle/date | **Closest analogue to cab advance payment** (Razorpay order → transfer → webhook → state change inside a transaction using `scopedDb(..., tx)`; `lib/bookings/service.ts`). Copy the transaction pattern, not the table (FK to `cars`). | Medium: webhook dispatch is a chain of "try Eats, else Motors" (`app/api/webhooks/razorpay/route.ts`); a third vertical makes it a three-way guess by order id. Tag Razorpay orders with `notes.kind` and dispatch on that. |
| `hours.ts` business hours | Operator working hours / office hours | Display only. Cabs are mostly 24×7; hours matter for "dispatch desk open" messaging. | Low. |
| Eats stock reservation (`reserveStock`/`releaseStock`) | Vehicle/driver availability hold | Same *idea* (reserve then release on failure/expiry) but different mechanics (counter vs time range). Share the "hold with expiry, release lazily" pattern. | Medium; do not share code. |
| `expireUnpaidOrders` lazy sweep | Unpaid booking expiry | Share the pattern; with a real scheduler available, prefer cron (R5). | Low. |
| Motors price history trigger | Fare snapshot per booking | Snapshot the quote breakdown on the trip (like `orders.lines` snapshot) so rate-card edits never rewrite history. | None. |

**Rule of thumb that emerges:** share *behaviour* (pure functions, patterns, UI kit, workers, infrastructure adapters); do **not** share *tables* between verticals, because the existing tables carry vertical-specific columns and shared FKs (`reviews.order_id`, `bookings.car_id`) already show the strain.

---

## 6. Architecture assessment & recommended refactors

### 6.1 Is there a clean place to add a third vertical?

**Yes, but only by copying the pattern.** The cleanest path today: add `cabs` to `lib/industries.ts`, new `lib/cabs/*`, `components/cabs/*`, `lib/db/schema/cabs.ts` registered in the barrel and in `scoped.ts`, guard helper like `requireRestaurant()`, new admin pages under `app/(admin)/(shell)/` with unique route names, tenant pages under `app/(tenant)/sites/[dealer]/` branching in `layout.tsx`/`page.tsx`.

Problems with doing exactly that:
1. **Route collisions.** Admin pages share one URL namespace (`/orders`, `/customers`, `/payments`, `/reviews`, `/coupons`, `/delivery-partners`). Cabs would either reuse Eats' paths (and fight `requireRestaurant()`) or invent new names (`/trips`, `/drivers`, `/fleet`). The catch-all `[...slug]` serves "coming soon" for unknown links, so mistakes are quiet.
2. **Tenant site collisions.** `app/(tenant)/sites/[dealer]/page.tsx` imports Motors' car components *and* Eats' `StoreHome` and branches in one file. `[carSlug]` is a dynamic root segment that would also match `/trips`, `/book`, `/driver`, unless static segments win (they do in Next, but any new static segment must not equal an existing car slug; Motors slugs look like `2017-maruti-baleno-alpha-tn11`, so collisions are unlikely).
3. **Admin shell, mobile nav and sidebar** each hard-code industry arrays (`components/admin/nav-config.ts`, `components/app-sidebar.tsx`, `components/admin/mobile-nav.tsx`).
4. **`context()` guards are copy-pasted** in `actions.ts`, `delivery/actions.ts`, and four `/api/t/*` routes with `industry === "restaurants"` literals.

### 6.2 Recommended refactors (prioritised)

Do R1-R4 **before** feature work (about 1 week). R5-R7 can ride alongside Sprint 1-2.

| # | Refactor | Why | Effort |
|---|---|---|---|
| **R1** | **Vertical registry.** One typed object per industry: `{key, product, nav, adminGuard, tenantShell, planLimits, razorpayCategory, features}` in `lib/verticals/`. Replace the literal branches (list in 2.3) with lookups. Make `dealers.industry` a Postgres enum or a CHECK. | A third vertical is the moment to stop adding `if`s. Cheap now, expensive at vertical #5 (TanyGarage/TanySalon are already in `lib/products.ts`). | M |
| **R2** | **Generic tenant guard.** `requireIndustry("cabs")` for admin and `tenantContext("cabs")` for tenant actions/routes, replacing `requireRestaurant()` and the repeated `context()` functions. | Removes copy-paste in ≥6 files; one place to enforce suspension/billing. | S |
| **R3** | **Make `scopedDb` composable.** Today every table is a hand-written line in one return object plus two const maps. Let each vertical module export its `direct` tables and have `scopedDb` merge them from a registry (keep the explicit allow-list so the leak test still guards). Optionally add Postgres RLS as defence in depth (`SET LOCAL app.dealer_id` per transaction; note Neon HTTP has no session state, so this needs the transaction path). | ~15 new Cabs tables × 3 touch points each; also reduces the risk of forgetting one. | M |
| **R4** | **Extract neutral modules from `lib/restaurant`:** `lib/core/tracking` (rider/agent token, session, WS ticket, live-location, route cache), `lib/core/payments` (Razorpay order + refund + apply-payment idempotency, `notes.kind` dispatch for the webhook), `lib/core/geo` (geocode, route, distance, `validCoords`), `lib/core/status-graph`. Keep thin Eats wrappers. | These are the 4 assets TanyCabs reuses most, and all are named/guarded for restaurants. The webhook dispatch by trial-and-error is the sharpest edge. | M |
| **R5** | **Scheduler.** Add Cloudflare Cron Triggers (`wrangler.jsonc` `triggers.crons`) calling an authenticated internal route, or host the pg-boss worker (it has no production host today). Pick one; Workers cron is simpler and already on the platform. | Document expiry, booking reminders, unpaid-hold expiry, driver-no-show checks, payout rollups. | M |
| **R6** | **Notification outbox + channel interface.** `notifications` table (event, recipient, channel, template, payload, status, attempts) and a `Channel` adapter (WhatsApp Cloud API, SMS/DLT, web push, email). Worker drains the outbox via R5. Keep `wa.me` as the zero-config fallback. | Required for ≥8 Cabs features; do it once. Also fixes Eats' manual "tap to send" flow. | L |
| **R7** | **Customer identity module.** `customers` (per tenant: phone verified, name, default addresses) + OTP session on tenant origins. Retrofit Eats guest checkout to optionally attach to it. | Blocker for Cabs trust and safety; benefits all verticals. | L |
| R8 | Replace in-memory `rate-limit.ts` with a shared limiter (Durable Object counter or Workers Rate Limiting binding). | See S1. | S-M |
| R9 | Per-tenant PWA manifest + service worker (offline shell, push). Route handler `app/manifest.ts` must read the tenant from the host. | Customers/drivers install the *operator's* app. | M |
| R10 | Use enums or CHECK constraints for status/payment text columns in new tables; adopt paise or a rounding policy for fares. | Prevent the `orders` pattern from spreading. | S |

### 6.3 Tech debt / bugs in reusable code that will bite

1. **`dealers` is accreting.** It mixes tenant identity, billing state, Eats config, Motors hours and Route account. Adding Cabs config (`cab_settings`: cancellation policy, advance %, service cities, night window) here continues the trend. Prefer a `tenant_settings` jsonb-per-vertical table or `dealer_settings(dealer_id, kind, data)`.
2. **`lib/plans.ts` / billing copy are car-centric** (`maxLiveCars`, Razorpay plan description "Up to N live cars"). Existing Eats tenants get that description on their Razorpay plan too (`lib/billing/razorpay.ts`). Fix in R1.
3. **Webhook dispatch by trial** (`app/.../webhooks/razorpay/route.ts`): Eats lookup first, then Motors. Adding Cabs as a third lookup costs two extra DB reads per payment and makes mis-attribution possible if Razorpay order ids collide across tables (unlikely, but unique indexes are per-table). Use `notes.kind`.
4. **Single payment per order assumption** in `applyOrderPayment` (`orders.razorpay_order_id` unique, one `razorpay_payment_id`). Cab advance/balance breaks it.
5. **Lazy expiry on read** (`expireUnpaidOrders` called by page loads and actions, capped to 50 rows). Unpaid holds on a vehicle calendar would stay blocked until someone opens an admin page. Needs R5.
6. **The Eats `[...slug]` catch-all** returns "coming soon" for unbuilt nav links, which hides broken links; and `docs/delivery/feature-audit.md` records `/cars/sold` as a stub reachable from the nav. Not harmful, but Cabs nav items must not point at unbuilt pages.
7. **Money as `integer` rupees** will force rounding decisions for per-km fares (e.g. ₹13.5/km × 143 km). Decide before writing the engine.
8. **Auth.js `trustHost: true`** with host validation delegated to `proxy.ts` (`lib/auth/index.ts` comment). Customer sessions on tenant hosts would need the same guarantee; the proxy currently blocks every `/api/*` except `/api/t/*` on tenant hosts, so customer auth endpoints must live under `/api/t/`.
9. **`DEV_BYPASS`/`local-login`** are guarded by `NODE_ENV === "development"` (`lib/auth/dev-bypass.ts`, `local-login.ts`). `local-login.ts` has a default password `admin123` (`DEFAULT_LOCAL_PASSWORD`). Safe only while `NODE_ENV` is reliably `production` in deployments; the previous audit flagged "must be proven inactive in production".
10. **Working tree not committed.** Large amounts of Eats/billing/super code have existed only in the working tree (`docs/delivery/feature-audit.md`). Land that before branching Cabs work.
11. **No Postgres RLS**; all isolation depends on developers using `scopedDb` and on the unscoped client staying confined (see the unscoped-importer list in 2.2).

### 6.4 Security and tenant-isolation risks found

| ID | Severity | Finding | Where | Why it matters for Cabs |
|---|---|---|---|---|
| S1 | **High** | **Rate limiter is in-memory per isolate.** Cloudflare Workers run many isolates; limits (8 orders/10 min, rider PIN 8/15 min, OTP/slug checks) are per isolate and reset on eviction. Comment in file: "TODO(phase 6): move to a shared store". | `lib/rate-limit.ts` (used in `actions.ts`, `delivery/actions.ts`, `/api/t/*`, `settings/team/actions.ts`, `onboarding/actions.ts`) | PIN brute-force on driver login, booking spam that blocks vehicle calendar slots, quote-endpoint abuse (paid geocoder/routing calls). |
| S2 | **High** | **Guest identity is an unverified typed phone.** No OTP at checkout. | `checkoutSchema` in `lib/restaurant/orders.ts`; `placeOrder` | Cab bookings reserve scarce capacity and send a stranger to a location; prank/fake bookings and impersonation are real. Also PII: you'd message a number that never consented. |
| S3 | **Medium** | **Inconsistent PII encryption:** `orders.customer_phone` and `orders.address` are plaintext; `leads.phone`/`bookings.buyer_phone` are AES-GCM encrypted. Lat/lng of the customer's home are stored plaintext on `orders`. | `lib/db/schema/restaurant.ts`, `lib/db/schema/cars.ts` | Cab records hold home/pickup addresses, phone, and trip history (movement data). DPDP Act exposure is higher. Decide a field-level policy before building; encrypt phone and addresses, add a blind index (HMAC) for lookup (the repo already notes this need for plates in `DECISIONS.md`). |
| S4 | **Medium** | **Weak share/track token for rides.** Guest tracking is authorised by the 6-char order code (~32^6 ≈ 1.07e9) with 20 tickets/min per IP+code limited per isolate. Fine for food; a ride's live location is more sensitive. | `app/api/t/ws-ticket/route.ts` (GET), `newOrderCode` | Use 128-bit random share tokens (the rider link already uses 24 random bytes, `newRiderToken`) and expire them at trip end. |
| S5 | **Medium** | **Driver upload path does not exist**; `PUT /api/upload` is admin-only. A shortcut (reusing admin credentials, loosening the prefix check) would break tenant isolation. | `app/api/upload/[...key]/route.ts` | Receipt/odometer upload must be a new, narrowly scoped endpoint keyed by trip id and bound to the driver's session. |
| S6 | Low | **Only the latest position is kept** (Durable Object / `order_locations` single row per order). No history. | `workers/tracker/index.ts`, `lib/restaurant/live-location.ts` | Disputes ("driver took a detour", "didn't reach pickup"), km-based billing verification, and safety investigations need breadcrumbs. Privacy trade-off: store minimally (e.g. every 30-60 s) with a retention period. |
| S7 | Low | **Dealer row is fully loaded and passed around.** `getDealerBySlug` returns the whole `dealers` row (subscription id, Razorpay account id, etc.) as `DealerProfile`, and some server components pass it to client-visible props such as `StoreShell dealer={dealer}` and `StoreFooter dealer={dealer}`; whether sensitive fields reach the client bundle depends on those children being server components. `StoreShell` is a server component (`async`), `StoreFooter` UNVERIFIED. | `lib/tenant/dealer.ts`, `components/restaurant/store/shell.tsx` | Select a public projection once (R1/R2). |
| S8 | Low | **Cross-tenant payment confirmation has no tenant check.** `confirmOrderPayment` verifies the Razorpay signature, then `applyOrderPayment` finds the order by Razorpay order id across all tenants (unscoped), not just the host's tenant. Not exploitable for fraud (a real, signed payment is required) but allows a payment for tenant A's order to be confirmed through tenant B's host. | `app/(tenant)/sites/[dealer]/actions.ts` `confirmOrderPayment`; `lib/restaurant/payments.ts` | Assert `order.dealerId === ctx.dealer.id` in the new Cabs code path. |
| S9 | Info | **Public geocoder/router usage policy.** Nominatim and the OSRM demo server forbid heavy/production use; the app identifies itself with an email (`GEOCODER_CONTACT` default in code) and may be blocked. | `lib/restaurant/geocode.ts`, `route.ts` | Plan paid providers before launch. |
| S10 | Info | Secrets hygiene looks fine: `.env*` is git-ignored except `.env.example`; `git ls-files` shows only `.env.example`. `wrangler.jsonc` contains Firebase *web* config (public by design) and Cloudflare zone id (not secret). Rider sessions fall back to a dev secret only outside production (`rider-session.ts`). `.env.local` and `.env.local.bak` exist on disk (ignored). I did not read them. | `.gitignore`, `wrangler.jsonc` | None. |

Positive findings worth keeping: signed-cookie + HMAC patterns use constant-time compare; webhook verifies signature before parsing; webhook returns 500 to force a retry on transient errors; late payments are refunded not revived; rider links are hashed at rest; the tracker validates origin and ticket and clamps update rate; `scopedDb` strips tenant keys from updates.

### 6.5 What is missing entirely

| Need | State | Notes |
|---|---|---|
| Real-time location streaming | **Present** (Durable Objects + WebSockets) | Reuse. Gaps: no history, single destination, backgrounded-PWA limits. |
| Real-time push to operator (new booking) | Polling only (20 s) | WebSocket/SSE channel or push needed; the DO pattern can be reused for a per-tenant "inbox" channel. |
| Maps integration (autocomplete, distance matrix, tolls) | Partial: display + free OSM services | Google Places/Routes (or Mappls/Ola Maps) account, key restriction, cost model. |
| Scheduling / calendar engine | **Absent** | Time-range overlap with DB-level guarantee; buffers; driver duty rules. |
| Document-expiry jobs | **Absent** | Needs R5 + R6. |
| Background workers / cron | Weak | pg-boss worker has no production host; no Workers cron. |
| Notification channels (WhatsApp API, SMS, push, email) | **Absent** (link only) | R6. |
| PDF generation (invoices) | **Absent** | Workers-compatible approach needed (HTML→PDF via a service, or a lightweight PDF lib). |
| Customer sessions | **Absent** | R7. |
| Audit log | **Absent** (planned per `DECISIONS.md`) | Needed for fare edits, refunds, driver reassignments. |
| Roles/permissions | **Minimal** | owner/staff only. |
| Offline / service worker | **Absent** | Drivers on poor networks; at least an offline shell and queued status updates. |
| Per-tenant manifest/installability | **Absent** (platform manifest only) | R9. |
| Sitemap/robots/structured data | **Absent** | SEO pages. |
| E2E tests for tenant flows | Minimal (3 Playwright specs, all for add-a-car/camera) | Booking + payment flow should have e2e. |

---

## 7. Net-new modules required, with proposed new tables

Names and key columns only; no SQL. All tenant tables carry `dealer_id` and must be registered in `scopedDb` + the leak test. Status-like columns should be Postgres enums.

**M1. Customers (platform-wide, benefits all verticals)**
- `customers`: id, dealer_id, phone (encrypted) + phone_hash (HMAC, unique per dealer), name, verified_at, language, created_at.
- `customer_addresses`: id, customer_id, label, address, lat, lng, place_ref.
- `customer_sessions` (or a signed cookie scheme with no table).
- `otp_attempts` or reliance on Firebase (decision needed; see section 8).

**M2. Fleet**
- `vehicle_classes`: id, dealer_id, name, seats, luggage_bags, ac, fuel_types, description, image_key, sort_order, is_active.
- `vehicles`: id, dealer_id, class_id, reg_number (encrypted) + reg_hash, make_model, year, colour, fuel, odometer, ownership (own/attached), status, home_base.
- `vehicle_documents`: id, vehicle_id, type (RC/insurance/permit/FC/PUC/tax), number, valid_from, valid_till, file_key, status.
- `vehicle_media`: reuse the neutral media table if R4 extracts one; else id, vehicle_id, key, sort_order.

**M3. Drivers**
- `drivers`: id, dealer_id, user_id (nullable), code, name, phone, photo_key, license_no (encrypted), license_valid_till, badge_no, employment_type, languages, status, pin_hash or OTP login.
- `driver_documents`: id, driver_id, type, number, valid_till, file_key.
- `driver_duty_logs`: id, driver_id, started_at, ended_at, source (attendance).
- `driver_vehicle_assignments` (default vehicle, optional).

**M4. Pricing**
- `rate_cards`: id, dealer_id, vehicle_class_id, trip_type, base_fare, per_km, min_km_per_day, per_hour, package_km, extra_km, extra_hour, driver_bata_per_day, valid_from/to, active.
- `rate_surcharges`: id, dealer_id, kind (night/hill/permit/airport/parking), scope (state/route/city), amount or percent, conditions (jsonb).
- `toll_entries`: id, dealer_id (nullable for platform defaults), from_place, to_place, amount, vehicle_class.
- `route_distances` (cache): origin_ref, dest_ref, km, minutes, source, fetched_at.
- `tax_settings` (GST rate, SAC, inclusive/exclusive) as part of settings.

**M5. Trips (core)**
- `trips`: id, dealer_id, code, customer_id (nullable for manual), trip_type, status, pickup (lat/lng/address), drop, stops (jsonb), start_at, end_at (planned), return_at, pax, luggage, notes, quote (jsonb snapshot), fare_total, advance_due, vehicle_class_id, vehicle_id, driver_id, source (web/phone/walk_in), share_token_hash, start_otp_hash, created_by.
- `trip_events`: id, trip_id, type, at, actor, data (odometer, photo key, lat/lng).
- `trip_legs` for multi-day outstation / package tours (optional).
- `trip_payments`: id, trip_id, kind (advance/balance/refund), method (razorpay/cash/upi_manual), amount, razorpay_order_id, razorpay_payment_id, status, collected_by.
- `trip_expenses`: id, trip_id, driver_id, kind (toll/parking/fuel/other), amount, receipt_key, status.
- `trip_locations_history` (optional, sampled).

**M6. Scheduling**
- Availability derives from `trips` (vehicle_id, driver_id, time range) with an exclusion constraint; plus `blocked_periods` (vehicle/driver unavailable: maintenance, leave): id, resource_type, resource_id, starts_at, ends_at, reason.

**M7. Finance**
- `driver_payouts`: id, driver_id, period, trips_count, earnings, deductions, status, paid_at, method.
- `invoices`: id, dealer_id, trip_id or corporate period, number (sequence per dealer per FY), customer GSTIN, amounts, tax breakup, pdf_key.
- `corporate_accounts`: id, dealer_id, name, gstin, billing_email, credit_terms_days, discount_percent; `corporate_members` linking customers.

**M8. Notifications and jobs**
- `notifications`: id, dealer_id, event, recipient_type/id, channel, template, payload, status, attempts, sent_at, provider_ref.
- `notification_optins`: customer/driver consent record.
- `scheduled_jobs` bookkeeping if not using pg-boss.

**M9. Roles**
- Extend `dealer_users.role` or add `dealer_user_permissions`: user_id, dealer_id, role (owner/manager/dispatcher/accountant/driver), custom permissions (jsonb).
- `audit_log`: id, dealer_id, actor, action, entity, entity_id, diff, at (needed also by super-admin per `DECISIONS.md`).

**M10. SEO**
- `route_pages`: id, dealer_id, slug, origin, destination, distance_km, copy, faq (jsonb), published, indexable.

**M11. Customer extras**
- `trip_contacts` (SOS/family): customer_id, name, phone.
- `sos_events`: id, trip_id, at, lat/lng, status, handled_by.

**Reuse without new tables:** `coupons` (+ columns), `reviews` (+ `trip_id`, `driver_id`), `enquiries`, `banners`, `dealer_users`, `dealer_domains`, `dealers`.

Estimated new tables: ~25-30. Estimated new `scopedDb` registrations: ~22.

---

## 8. Risks and open questions for the product owner

**Product / business**
1. **Who is the end customer of the PWA?** B2C travellers booking a pre-planned trip (needs OTP, SEO, trust) or repeat corporate/regular customers (needs accounts, invoicing)? This sets how much of M1/M7 is in the MVP.
2. **Is the "zero commission" promise compatible with advance payments through Tany's Razorpay?** Today money transfers straight to the operator via Route (`on_hold: 0`). Cancellation refunds reverse the transfer (`reverse_all`). Confirm the cancellation/refund policy (who bears the cost, operator-configurable?), and whether Route onboarding (KYC) is acceptable friction for small travel operators.
3. **Driver apps:** Are drivers employees, attached owner-drivers, or freelancers? Do they get their own phone number login (OTP) or a PIN issued by the operator? Can a driver work for multiple operators? (The current data model blocks one user across two dealers.)
4. **Cash handling:** if the customer pays the balance in cash to the driver, who reconciles and what stops leakage? Is the driver expected to record it in the app?
5. **Fare rules:** please supply 2-3 real operators' rate sheets (per-km, bata, night, hill, permit, toll, waiting) to validate the engine design. Are tolls actual or estimated? Does the customer pay tolls on actuals?
6. **Pricing of the Tany plans for Cabs:** flat monthly tech fee per fleet size? Limits on vehicles/drivers/monthly bookings?
7. **On-demand later:** if ride-hailing is next, dispatch/matching changes the data model (driver availability streams, offers). Decide now whether trips are modelled as scheduled-only or "scheduled with start_at = now".
8. **Languages:** Tamil is partially supported in the admin (`lib/copy-ta.ts`). Do customer and driver apps need Tamil/Hindi/Telugu/Kannada?
9. **SEO strategy:** per-tenant subdomain pages compete with each other for "Chennai to Tirupati cab". Do operators want canonical pages on their own custom domains? Is a Tany-level directory in scope (which conflicts with "not a marketplace")?

**Compliance / legal**
10. **Motor Vehicles Aggregator Guidelines / state rules / permits:** does the platform need to display driver verification (PCC, badge), vehicle commercial permit, or insurance details? Different states differ.
11. **DPDP Act:** consent for live location and for retained trip history; retention period; data deletion path (there is an `app/data-deletion` page, untracked, content UNVERIFIED).
12. **GST:** operators below the threshold, passenger transport by non-AC vs AC, and operator vs aggregator liability affect invoice content. Needs an accountant.
13. **WhatsApp Business:** template approvals, opt-in rules, and a decision between one Tany-wide sender and per-operator numbers.
14. **SOS:** liability and escalation expectations. A button that does nothing real is worse than none.

**Technical**
15. **Maps provider and budget** (Google Places/Routes, Mappls, or Ola Maps). Free OSM services are not suitable for production autocomplete.
16. **Reliability of background location in a PWA.** If tracking continuity is a hard requirement for outstation trips, a native wrapper (Capacitor/TWA with foreground service) may be needed. Decide before committing to "Driver PWA".
17. **Customer auth origin problem:** Firebase phone auth + reCAPTCHA on wildcard subdomains and custom domains (authorized-domain list limits). UNVERIFIED whether wildcard authorized domains are allowed; may force a hosted login on `app.tany.in` with a redirect.
18. **Hosting the background worker:** pg-boss needs a long-running Node host; Workers cron avoids it. Choose.
19. **Uncommitted work:** the Eats/billing/super modules this plan reuses are largely uncommitted in the working tree. Confirm they are merged before Cabs branches off.

---

## 9. Suggested build order

Assumes 2 engineers, 2-week sprints. Long-lead items (WhatsApp BSP, Razorpay Route category, maps account, DLT) start in Sprint 0 as non-code tasks.

**Sprint 0 (≈1 week): refactor first. Yes, refactor first.**
- R1 vertical registry (+ `industry` enum/CHECK), R2 generic guards, R3 composable `scopedDb`, R4 extract tracking/payments/geo/status-graph (thin Eats wrappers; keep tests green), R8 shared rate limiter.
- Land uncommitted work; decide Q1, Q3, Q5, Q15, Q16, Q17.
- Kick off: WhatsApp BSP application + template drafts; maps provider account; Razorpay category check.

**Sprint 1: onboarding + catalogue + rate cards**
- Add `cabs` industry end-to-end (onboarding card, Razorpay category, plan limits, admin nav, tenant shell skeleton, per-tenant manifest start).
- M2 `vehicle_classes` + basic `vehicles`; M4 `rate_cards` + `rate_surcharges`; admin CRUD using the existing form/grid kit.
- Fare engine as a pure, heavily unit-tested function (airport, one-way, round trip, hourly first).
- shadcn `calendar`, `popover`, `command`.

**Sprint 2: customer identity + booking flow (no payment yet)**
- R7 customers + OTP session on tenant origins.
- Customer PWA: trip type → places autocomplete → date/time → vehicle classes → quote → request booking (`trips` table, status graph, longer share token).
- Operator inbox: accept/reject, manual booking entry, status pipeline, alerts.

**Sprint 3: assignment, driver app, tracking**
- M3 drivers; driver login; assigned trips; navigation deep link; start/end with OTP + odometer photo; driver upload endpoint (S5).
- Adapt live tracking to trips; customer tracking page; share-with-family link.
- R5 scheduler in place; first jobs: unpaid-hold expiry, pickup reminders.

**Sprint 4: payments + notifications**
- Advance/full/cash; balance collection; cancellation/refund policy; webhook dispatch via `notes.kind`.
- R6 notification outbox with WhatsApp (templates approved by now) and SMS fallback; booking-confirmed / driver-assigned / trip-done messages; owner alerts.
- Availability calendar and conflict detection (M6) (may slip to Sprint 5 if Sprint 3-4 are tight).

**Sprint 5: operations and compliance**
- Fleet/driver documents + expiry alerts; expenses; driver earnings and payouts ledger; reports; coupons adjustments; reviews linked to trips.
- Invoices (GST) + PDF; roles/permissions (M9); audit log.
- Super-admin Cabs views; analytics events.

**Later (post-MVP):** SEO route pages (`route_pages`, sitemap) can start in Sprint 3 in parallel if a third engineer exists; corporate accounts; SOS with real escalation; service worker/offline/push; native wrapper if tracking requires it; on-demand dispatch.

**What to cut if time is short for an MVP demo:** invoices, corporate accounts, SEO pages, payouts, SOS. What must not be cut: customer OTP, fare engine tests, tenant isolation tests for every new table, payment idempotency, a working notification for "driver assigned".

---

### Appendix A. Files read for this audit

`package.json`, `README.md`, `DECISIONS.md`, `docs/delivery/feature-audit.md` (first 40 lines), `proxy.ts`, `wrangler.jsonc`, `workers/tracker/{index.ts,wrangler.jsonc}`, `workers/index.ts`, `lib/db/{client,scoped}.ts`, `lib/db/schema/*.ts`, `drizzle/*.sql` (table list), `lib/tenant/{host,dealer,route,create-dealer}.ts`, `lib/dealers/onboard.ts`, `lib/industries.ts`, `lib/products.ts`, `lib/plans.ts`, `lib/billing/{state,razorpay}.ts`, `lib/auth/{index,context,firebase,firebase-user,dev-bypass,local-login}.ts`, `lib/route/razorpay.ts`, `lib/bookings/service.ts`, `lib/restaurant/{orders,payments,customers,trip,rider-session,ws-ticket,tracking,live-location,geocode,route,service-area,recent-orders}.ts`, `lib/storage/*`, `lib/crypto/index.ts`, `lib/rate-limit.ts`, `lib/jobs/boss.ts`, `lib/analytics/events.ts`, `lib/whatsapp.ts`, `lib/hours.ts`, `lib/theme/tokens.ts`, `app/(tenant)/sites/[dealer]/{layout,page,actions,delivery/actions}.ts*`, `app/api/{webhooks/razorpay,t/track,t/rider-location,t/ws-ticket,upload,t/media}/route.ts`, `app/(admin)/(shell)/layout.tsx`, `app/(admin)/(shell)/{payments,order-by-location}/page.tsx` (heads), `app/(admin)/(shell)/settings/team/actions.ts`, `app/(admin)/onboarding/actions.ts`, `app/manifest.ts`, `app/layout.tsx`, `components/{login-form,app-sidebar}.tsx`, `components/tenant/account-menu.tsx`, `components/restaurant/{order-alerts,store/shell}.tsx`, `tests/tenant-leak.test.ts` (head), `eslint.config.mjs`, `components.json`, `.env.example`, `.gitignore`, `public/brand/tanycabs-how-it-works.html` (head).

### Appendix B. Not read / UNVERIFIED items

- Contents of `.env.local` and `.env.local.bak` (deliberately not opened).
- `components/restaurant/store/*` beyond `shell.tsx` and `razorpay.ts` heads; `components/restaurant/{live-board,live-map,ops-grids,share-delivery}.tsx` bodies; most admin pages (`orders`, `customers`, `reviews`, `reports`, `coupons`, `delivery-partners`, `delivery-zones`).
- `lib/cars/*`, `lib/rc/*`, `lib/video/*`, `lib/voice/*`, `lib/ai/*` internals; `workers/video.ts`; `workers/jarvis/*` (internal ops tool).
- `lib/super/*` internals and `app/(super)` pages beyond file names.
- `lib/cloudflare/domains.ts`; whether subdomain provisioning has ever worked in production.
- Whether `app/(admin)/(shell)/settings/{actions,team/*}` and `onboarding/page.tsx` import `unscopedDb` in a way that ESLint's `**/db/client` pattern would flag (they appear in the `unscopedDb` grep).
- Test results: I did not run `pnpm test`, `typecheck` or `lint`.
- Firebase wildcard authorized-domain behaviour for customer OTP on tenant origins.
- Razorpay Route category values for a transport business.
- Extent of Tamil coverage in `lib/copy-ta.ts`; content of `app/data-deletion`.
