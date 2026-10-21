# Staging

The same code as production on its own domain (**tanystaging.in**, a separate Cloudflare zone), database, buckets, secrets, Workers and Razorpay **test** keys. Nothing here has been created or deployed: every item below is yours to do.

| | Production | Staging |
|---|---|---|
| Domain / Cloudflare zone | `tany.in` | `tanystaging.in` (new zone) |
| Marketing | `tany.in` | `tanystaging.in` |
| Admin app | `app.tany.in` | `app.tanystaging.in` |
| Business sites | `<slug>.tany.in` | `<slug>.tanystaging.in` |
| Live-location socket | `track.tany.in` | `track.tanystaging.in` |
| Public files | bucket `tany`, `cdn.tany.in` | bucket `tany-staging`, `cdn.tanystaging.in` |
| Private documents | production private bucket | `tany-staging-private` (no public access) |
| Workers | `tanyapps`, `tanyapps-tracker`, `tanyapps-cron` | `…-staging` of each |
| Database | production Neon | its own fresh Neon database |
| Secrets | `.env.local` | `.env.staging` |
| Razorpay | live keys | **test** keys (`rzp_test_…`) and a test-mode webhook |
| Deploy | `pnpm deploy` | `pnpm deploy:staging` |

**Staging is only a different `ROOT_DOMAIN`.** `classifyHost` and every other piece of code read the domain from the environment; there is no staging special case (`tests/host.test.ts` runs the same host cases with both roots and checks a production host is never treated as a staging business or the reverse). Because `tanystaging.in` is its own zone, Cloudflare's free Universal certificate (the apex plus `*.tanystaging.in`) covers every host, so no paid certificate is needed.

What is in the repository:

- `env.staging` blocks in `wrangler.jsonc`, `workers/tracker/wrangler.jsonc` and `workers/cron/wrangler.jsonc` (each checked with `wrangler deploy --dry-run --env staging`).
- `pnpm deploy:staging`: `bash scripts/predeploy-check.sh staging`, then tracker, app build and deploy, cron, all to the `staging` environment.
- `pnpm db:migrate:staging`, `pnpm secrets:staging` (`scripts/upload-secrets.sh staging`), `pnpm seed:staging` (`scripts/seed-staging.ts`), and `bash scripts/setup-wildcard-dns.sh staging`.

`predeploy-check.sh staging` **blocks** when: `.env.staging` is missing or a core value is empty; the database is local or is production's (same host and database, whatever the options); `AUTH_SECRET`, `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `CRON_SECRET` or `TRACKER_SECRET` equals production's; `R2_PRIVATE_BUCKET` is production's; the Razorpay key is not `rzp_test_`; a dev/test-only setting (`GEO_FIXTURE`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E`, `FIREBASE_TEST_PHONES`, …) is present; the working tree is dirty; or typecheck, lint or tests fail. `upload-secrets.sh staging` repeats the database, Razorpay and shared-secret checks, and `seed-staging.ts` refuses to run against the database named in `.env.local`.

## The order (summary)

1. Buy `tanystaging.in`. 2. Add it to Cloudflare, point the registrar's nameservers there, wait for **Active**. 3. Create the Neon database. 4. Create the two R2 buckets, the CDN domain and the token. 5. Razorpay test keys and webhook. 6. Firebase: authorised domain, App Check domain, test phone numbers. 7. Maps key. 8. Write `.env.staging`. 9. Run the commands: `wrangler login`, `pnpm db:migrate:staging`, `bash scripts/setup-wildcard-dns.sh staging`, `pnpm deploy:staging`, `pnpm secrets:staging`, `pnpm seed:staging`. 10. Check it.

The Cloudflare zone must be **Active before the first deploy** (the Workers' custom-domain routes cannot be created otherwise), and the secrets can only be uploaded after the first deploy has created the Workers.

## 1. Buy the domain

Buy **`tanystaging.in`** from any registrar. When I checked the `.in` registry's own WHOIS (whois.nixiregistry.in) on 21 October 2026 it said the name was available for registration; that can change before you buy, and a registrar may price it as premium. Free at the same check, if you want a different name: `tanystage.in`, `tanytest.in`, `tanystg.in`. If you pick one of those, tell me and I will change the five places the name appears (`wrangler.jsonc`, the tracker and cron configs, `predeploy-check.sh`, `setup-wildcard-dns.sh`) and the tests.

## 2. Cloudflare

1. Dashboard → **Add a domain** → `tanystaging.in` → **Free** plan. Cloudflare shows two nameservers.
2. At the registrar, replace the domain's nameservers with those two. Wait until the zone's status is **Active** (minutes to a few hours).
3. *Overview* (right-hand column) → copy the **Zone ID**. It goes in `.env.staging` as `CLOUDFLARE_ZONE_ID`.
4. *My Profile → API Tokens → Create Token* → the **Edit zone DNS** template → zone resources: **`tanystaging.in`** → create, and copy it. It goes in `.env.staging` as `CLOUDFLARE_API_TOKEN`. (Your production token is probably limited to `tany.in`, so it cannot be reused.)
5. *SSL/TLS → Overview* → set the encryption mode to **Full (strict)**. *SSL/TLS → Edge Certificates* → confirm the Universal certificate is **Active** for `tanystaging.in, *.tanystaging.in`.
6. Do **not** create DNS records for `tanystaging.in`, `app` or `track` by hand: the Workers create them when deployed (custom domains refuse an existing record). The wildcard record for business sites is created by `bash scripts/setup-wildcard-dns.sh staging` (step 9).

## 3. Neon: a fresh empty database

Create a **new, empty database** for staging: a new Neon project (cleanest), or a new database in the existing project. Copy its **pooled** connection string into `.env.staging` as `DATABASE_URL`.

> **Do not branch production.** A branch copies every row, so real customers' phone numbers and addresses would sit in staging, encrypted with a key staging does not have.

## 4. R2

1. Create **`tany-staging`** (public files). *Settings → Custom Domains* → add **`cdn.tanystaging.in`** (the zone from step 2 is on the same account, so it is offered).
2. Create **`tany-staging-private`** (documents, and later trip photos). **No custom domain, no public access.**
3. CORS on `tany-staging`: copy production bucket's CORS rule and change the allowed origin to **`https://app.tanystaging.in`** (browsers upload straight to the bucket from the app host).
4. *R2 → Manage API tokens* → a token with **Object Read & Write limited to those two buckets**. Note the Access Key ID and Secret for `.env.staging`.

## 5. Razorpay (test mode)

1. Dashboard → switch to **Test Mode** → *Account & Settings → API Keys* → generate. `rzp_test_…` goes in `.env.staging` as `RAZORPAY_KEY_ID`; the secret as `RAZORPAY_KEY_SECRET`.
2. *Account & Settings → Webhooks* (still Test Mode) → **Add new webhook**:
   - URL: **`https://app.tanystaging.in/api/webhooks/razorpay`**
   - Secret: a long random string; the same value goes in `.env.staging` as `RAZORPAY_WEBHOOK_SECRET`.
   - Active events: **`order.paid`** (primary), **`payment.captured`** (fallback), every **`subscription.*`** event, and every **`account.*`** event (Route linked accounts).
   - Without `order.paid`, every payment is handled by the fallback; after your first test payment the Workers logs should **not** show `razorpay_webhook_fallback`.
3. Route (linked accounts) in test mode: if Route is not enabled for test mode on your account, enable it, otherwise operator payout onboarding fails on staging only.
4. Use Razorpay's test cards and UPI ids; no real money moves with a `rzp_test_` key.

## 6. Firebase

Staging uses **the same Firebase project** by default (the web keys in `wrangler.jsonc` are the same public values). That shares one SMS bill and one set of Auth users with production; the databases are separate, so nobody sees the other's data. For full separation, create a second Firebase project and change the four `FIREBASE_*` values in `env.staging.vars`.

1. *Authentication → Settings → Authorized domains* → add **`app.tanystaging.in`**. (Business sites and customers' own domains need no listing: the login lives only on the app host.)
2. **App Check:** open the reCAPTCHA Enterprise site key you made for `app.tany.in` (Google Cloud console → *Security → reCAPTCHA Enterprise*) and **add `app.tanystaging.in`** to its allowed domains (or create a second key and set `FIREBASE_APPCHECK_SITE_KEY` to it in `.env.staging`). If App Check is enforced and the key does not include the staging host, every staging login is refused.
3. **Avoid SMS spend while testing:** *Authentication → Sign-in method → Phone → Phone numbers for testing* → add fictional numbers with fixed codes (up to 10). They send nothing and cost nothing. (I have not tried them with the real login page; if the page refuses a test number, tell me.)

## 7. Google Maps

Create a **separate server key** for staging, restricted to **Places API (New)** and **Routes API**; it goes in `.env.staging` as `GOOGLE_MAPS_SERVER_KEY`. A separate key shows staging spend on its own. If you use the browser key (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`), add the referrer **`https://*.tanystaging.in/*`** to it.

## 8. `.env.staging`

At the repository root (git ignores it; never commit it). **Generate new values; do not reuse production's:**

```
openssl rand -base64 32     # AUTH_SECRET
openssl rand -base64 32     # ENCRYPTION_KEY (back this up separately)
openssl rand -base64 32     # BLIND_INDEX_KEY (back this up separately)
openssl rand -hex 32        # CRON_SECRET
openssl rand -hex 32        # TRACKER_SECRET
```

```
DATABASE_URL=              # step 3
AUTH_SECRET=
ENCRYPTION_KEY=
BLIND_INDEX_KEY=
CRON_SECRET=
TRACKER_SECRET=
CLOUDFLARE_ZONE_ID=        # step 2.3 (the tanystaging.in zone)
CLOUDFLARE_API_TOKEN=      # step 2.4
R2_ACCESS_KEY_ID=          # step 4
R2_SECRET_ACCESS_KEY=
R2_PRIVATE_BUCKET=tany-staging-private
RAZORPAY_KEY_ID=           # step 5, rzp_test_...
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
GOOGLE_MAPS_SERVER_KEY=    # step 7
CABS_ALLOWED_EMAILS=       # emails allowed to create a cab business on staging
PHONE_OTP_PROVIDER=firebase
FIREBASE_APPCHECK_SITE_KEY=
PILOT_DEALERS=
STAGING_OWNER_EMAIL=       # optional: links this Google account as owner of the demo businesses (seed step)
```

## 9. Commands, in this order

```
pnpm exec wrangler login

pnpm db:migrate:staging                    # creates every table in the empty staging database
bash scripts/setup-wildcard-dns.sh staging # the *.tanystaging.in record (zone must be Active)

pnpm deploy:staging                        # predeploy check, tracker, app, cron. First run creates the Workers.
pnpm secrets:staging                       # uploads .env.staging to the three staging Workers (they must exist)
pnpm seed:staging                          # demo cab operator, restaurant and car dealer (fake data)
```

The seed creates `demo-cabs`, `demo-eats` and `demo-motors`. It only links an owner when `STAGING_OWNER_EMAIL` is set; to manage the demo businesses, sign in once with that Google account, then run `pnpm seed:staging` again (it is safe to repeat).

After this, `pnpm deploy:staging` is the only command for a new version (run `pnpm db:migrate:staging` first when a branch adds a migration). Secrets take effect immediately; no second deploy is needed after `pnpm secrets:staging`.

## 10. Check it

1. `https://app.tanystaging.in/login` loads with a valid certificate; so do `https://tanystaging.in` and `https://demo-cabs.tanystaging.in`.
2. `https://nosuch.tanystaging.in` answers 404 (not a certificate error).
3. Cloudflare → *Workers → tanyapps-cron-staging → Logs*: a line every minute for `expire-trip-holds`.
4. On `https://demo-cabs.tanystaging.in`: book an airport trip, log in with a Firebase test phone number, request; in the operator app (signed in as the owner) accept it; the customer page shows Confirmed.
5. A Razorpay test payment (a subscription on the billing screen): the webhook shows delivered (200) in Razorpay's dashboard, and the Workers logs do **not** show `razorpay_webhook_fallback`.

## What is shared with production, and what is not

- **Separate:** domain and zone, database, encryption and signing keys, Workers and their Durable Objects (rate limits and live positions), buckets, Razorpay mode, the Maps key, cron locks, analytics datasets (`*_staging`).
- **Shared:** the Cloudflare account, the Firebase project (and its SMS bill and budget alert), the GitHub repository.
