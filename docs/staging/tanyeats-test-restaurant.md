# TanyEats test restaurant: Marina Spice Kitchen

Fake data for staging QA. Create it with `STAGING_OWNER_EMAIL=you@gmail.com pnpm seed:tanyeats` (reads `.env.staging`, refuses production's database, safe to repeat).

## Real photos (Pexels)

The seed draws placeholder pictures. To replace them with real food photos, get a free key at https://www.pexels.com/api/, put `PEXELS_API_KEY=...` in the env file, then run `pnpm seed:photos` (reads `.env.local`) or `pnpm seed:photos:staging` (reads `.env.staging`). It searches Pexels for each dish and banner, saves the best match into the app's own storage, and writes the photographer credits to `docs/staging/photo-credits.md`. Re-running skips dishes that already have a photo; add `-- --force` to fetch them again. `pnpm seed:tanyeats` keeps real photos when it re-seeds.

## Details

| | |
|---|---|
| Name / slug | Marina Spice Kitchen / `marina-spice` (`https://marina-spice.tanystaging.in`) |
| Industry, plan | Restaurants, Growth (60-day trial) |
| Phone / WhatsApp | +91 90000 00201 |
| Email | hello@marina-spice.test |
| Address | 18, Venkatesa Agraharam Street, Mylapore, Chennai 600004 |
| Hours | Every day, 7 am to 10:30 pm |
| Brand | Burnt orange `#c2410c`, accent green `#15803d`, radius md |
| Ordering | Delivery, pickup and dine-in on; fee Rs 30, free above Rs 500, minimum Rs 150; cash and online |
| Service area | Mylapore pin, 10 km radius |
| Delivery zones | T. Nagar (Rs 30, 30 min), Anna Nagar (Rs 40, min Rs 200), Adyar (Rs 50, min Rs 250), Velachery (Rs 60, min Rs 300) |
| Menu | 8 categories, 30 dishes with pictures, portions, offers, one sold out, stock tracked on some |
| Offers | Coupons `WELCOME10`, `FLAT50`, `SOUTH20`, `DIWALI15` (expired, must be rejected); 3 banners |
| Riders | DP001 PIN 1111, DP002 PIN 2222, DP003 inactive (PIN 3333) |
| Orders | ~130 over 45 days in every status (pending payment, preparing, out for delivery with a live position, completed, cancelled/refunded) |
| Guests | 30 demo guests, phones `+91 90000 0xxxx` |

## Pages to check

**Storefront** (`marina-spice.tanystaging.in`): home (banners, featured dishes, hours, open/closed), menu, category/[slug], dish/[id] (portions, offer price, sold out), search, cart (coupon valid, expired, below minimum), checkout (delivery in/out of zone and radius, pickup, dine-in, cash, online with Razorpay test), o/[code] (order page), track-order, delivery/[code] (rider live link), offers, favourites, account, my, about, contact (enquiry form), pwa-manifest.

**Owner admin** (sign in with `STAGING_OWNER_EMAIL`): dashboard, orders, live-deliveries, order-by-location, menu, categories, inventory, banners, coupons, delivery-zones, delivery-partners, customers, reviews (approve the pending ones), enquiries, notifications, payments, analytics, reports, settings (storefront, hours, ordering, location, theme, payments, plan, billing, team).

**Super admin:** the business shows in the businesses list, usage and billing views.

## Expected results

- A guest can place a pickup order and a delivery order inside a zone; delivery outside the 10 km radius is refused.
- `DIWALI15` is rejected as expired; `WELCOME10` under Rs 200 is rejected.
- The sold-out dish cannot be added to the cart.
- Rider PIN 1111 opens the rider view; PIN 3333 is refused (inactive).
