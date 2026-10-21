# Staging

The same code as production on its own hostnames, database, buckets, secrets, Workers and Razorpay **test** keys.

| | Production | Staging |
|---|---|---|
| App (Worker) | `tanyapps` | `tanyapps-staging` |
| Tracker (Worker + Durable Objects) | `tanyapps-tracker` | `tanyapps-tracker-staging` |
| Cron (Worker) | `tanyapps-cron` | `tanyapps-cron-staging` |
| Hosts | `tany.in`, `app.tany.in`, `*.tany.in` | `staging.tany.in`, `app.staging.tany.in`, `*.staging.tany.in` |
| Live-location socket | `track.tany.in` | `track.staging.tany.in` |
| Public files | bucket `tany`, `cdn.tany.in` | bucket `tany-staging`, `cdn.staging.tany.in` |
| Private documents | production private bucket | `tany-staging-private` (no public access) |
| Database | production Neon | its own Neon database (below) |
| Secrets | `.env.local` → `pnpm exec wrangler secret` | `.env.staging` → `pnpm secrets:staging` |
| Razorpay | live keys | **test** keys (`rzp_test_…`) and a test-mode webhook |
| Deploy | `pnpm deploy` | `pnpm deploy:staging` |

What is in the repository (nothing here deploys by itself):

- `env.staging` blocks in `wrangler.jsonc`, `workers/tracker/wrangler.jsonc` and `workers/cron/wrangler.jsonc` (validated with `wrangler deploy --dry-run --env staging`).
- `pnpm deploy:staging`: runs `bash scripts/predeploy-check.sh staging`, then deploys the tracker, builds and deploys the app, deploys the cron worker, all to the `staging` environment.
- `pnpm secrets:staging` (`scripts/upload-secrets.sh staging`) and `pnpm db:migrate:staging`.
- `bash scripts/setup-wildcard-dns.sh staging` creates the `*.staging` DNS record.

`predeploy-check.sh staging` **blocks** when: `.env.staging` is missing or has an empty core secret; the database is local or is production's (same URL, or the same database with different options); any of `AUTH_SECRET`, `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `CRON_SECRET`, `TRACKER_SECRET` equals production's; `R2_PRIVATE_BUCKET` is production's; the Razorpay key is not `rzp_test_`; a dev/test-only setting (`GEO_FIXTURE`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E`, `FIREBASE_TEST_PHONES`, …) is present; the tree is dirty; or typecheck, lint or tests fail. `upload-secrets.sh staging` repeats the database, Razorpay and shared-secret checks.

## What you must do, in order

### 1. Database (Neon)

Create a **new, empty database** for staging: a new Neon project (cleanest), or a new database in the existing project.

> **Do not branch production.** A Neon branch copies every row, so real customer phone numbers and addresses would sit in staging, encrypted with a key staging does not have. A branch of an earlier point in time, from before any data existed, would also work, but a brand-new database is simpler and applies the migrations from zero.

Copy its **pooled** connection string. You will put it in `.env.staging` (step 7).

### 2. Cloudflare: DNS and certificates

1. **Wildcard DNS record.** With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` in `.env.local` (the same zone, `tany.in`): `bash scripts/setup-wildcard-dns.sh staging`. This creates a proxied `*.staging` record. (`staging`, `app.staging` and `track.staging` records are created by the Workers themselves when deployed, because they are `custom_domain` routes.)
2. **Certificate for `*.staging.tany.in`.** Cloudflare's free Universal certificate covers `tany.in` and `*.tany.in` **only one level deep**, so it does **not** cover `acme.staging.tany.in`. Order an **Advanced Certificate** (Cloudflare dashboard → `tany.in` → *SSL/TLS* → *Edge Certificates* → *Order Advanced Certificate*, a paid add-on, about US$10 a month) for the hosts **`*.staging.tany.in`** and **`staging.tany.in`**. Without it, `https://<anything>.staging.tany.in` fails with a certificate error. (If you would rather not pay: tell me and I will change staging business sites to one level, `staging-<slug>.tany.in`, which the free certificate covers.)
3. **Routes.** They are in `wrangler.jsonc` and are created at deploy: `staging.tany.in` and `app.staging.tany.in` (custom domains) and `*.staging.tany.in/*` (zone route, zone `tany.in`). The production route `*.tany.in/*` may also match staging names; Cloudflare uses the most specific route, so `*.staging.tany.in/*` wins. If a staging page ever shows production behaviour, this is the first thing to check.
4. If `staging.tany.in` or `app.staging.tany.in` already has a DNS record, delete it before the first deploy (custom domains refuse an existing record).

### 3. R2 buckets

1. Create **`tany-staging`** (public files). *Settings → Custom Domains* → add **`cdn.staging.tany.in`**.
2. Create **`tany-staging-private`** (documents and, later, trip photos). **No custom domain, no public access.**
3. CORS on `tany-staging`: copy production bucket's CORS rule and change the allowed origin to **`https://app.staging.tany.in`** (browsers upload straight to the bucket from the app host).
4. *R2 → Manage API tokens* → create a token with **Object Read & Write limited to those two buckets**. Note the Access Key ID and Secret for `.env.staging`.

### 4. Razorpay (test mode)

1. Dashboard → switch to **Test Mode** → *Account & Settings → API Keys* → generate keys. Put `rzp_test_…` in `.env.staging` as `RAZORPAY_KEY_ID` and the secret as `RAZORPAY_KEY_SECRET`.
2. *Account & Settings → Webhooks* (still in Test Mode) → **Add new webhook**:
   - URL: **`https://app.staging.tany.in/api/webhooks/razorpay`**
   - Secret: make up a long random string; put the same value in `.env.staging` as `RAZORPAY_WEBHOOK_SECRET`.
   - Active events: **`order.paid`** (primary), **`payment.captured`** (fallback), every **`subscription.*`** event, and every **`account.*`** event (Route linked accounts).
   - Without `order.paid`, every payment is handled by the fallback; after your first test payment, the Workers logs should **not** show `razorpay_webhook_fallback`.
3. Route (linked accounts) in test mode: if the *Route* product is not enabled for test mode on your account, enable it under the same dashboard, otherwise operator onboarding to Razorpay will fail on staging only.
4. Test cards and UPI ids: use Razorpay's test credentials (documented in their dashboard). No real money moves with a `rzp_test_` key.

### 5. Firebase

Staging uses **the same Firebase project** by default (the web keys in `wrangler.jsonc` are the same public values). That shares one SMS bill and one set of Auth users with production; the databases are separate, so nobody sees the other's data. If you want full separation, create a second Firebase project and change the four `FIREBASE_*` values in `env.staging.vars`.

1. *Authentication → Settings → Authorized domains* → add **`app.staging.tany.in`**. (Business sites on `*.staging.tany.in` and customers' domains do not need listing: the login lives only on the app host.)
2. **App Check:** open the reCAPTCHA Enterprise site key you made for `app.tany.in` (Google Cloud console → *Security → reCAPTCHA Enterprise*) and **add `app.staging.tany.in`** to its allowed domains (or create a second key for staging and set `FIREBASE_APPCHECK_SITE_KEY` to it in `.env.staging`). If App Check is enforced and the key does not include the staging host, every staging login is refused.
3. **Avoid SMS spend while testing:** *Authentication → Sign-in method → Phone → Phone numbers for testing*: add fictional numbers with fixed codes (up to 10). They send nothing and cost nothing. (I have not tried this with the real login page; if the page refuses a test number, tell me and I will check how reCAPTCHA treats it.)
4. Google sign-in for owners on staging needs nothing else once the domain is authorised.

### 6. Google Maps

Create a **separate server key** for staging (Google Cloud console → *APIs & Services → Credentials*), restricted to **Places API (New)** and **Routes API**, and put it in `.env.staging` as `GOOGLE_MAPS_SERVER_KEY`. A separate key lets you see staging spend on its own. If you use the browser map key (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`), add the referrer **`https://*.staging.tany.in/*`** to it.

### 7. `.env.staging`

Create it at the repository root (it is ignored by git; never commit it). Generate **new** values for every secret; do not reuse production's:

```
openssl rand -base64 32     # AUTH_SECRET
openssl rand -base64 32     # ENCRYPTION_KEY (back this up separately)
openssl rand -base64 32     # BLIND_INDEX_KEY (back this up separately)
openssl rand -hex 32        # CRON_SECRET
openssl rand -hex 32        # TRACKER_SECRET
```

```
DATABASE_URL=            # step 1
AUTH_SECRET=
ENCRYPTION_KEY=
BLIND_INDEX_KEY=
CRON_SECRET=
TRACKER_SECRET=
R2_ACCESS_KEY_ID=        # step 3
R2_SECRET_ACCESS_KEY=
R2_PRIVATE_BUCKET=tany-staging-private
RAZORPAY_KEY_ID=         # step 4, rzp_test_...
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
GOOGLE_MAPS_SERVER_KEY=  # step 6
CABS_ALLOWED_EMAILS=     # the emails allowed to create a cab business on staging
PHONE_OTP_PROVIDER=firebase
FIREBASE_APPCHECK_SITE_KEY=
PILOT_DEALERS=
```

(`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ANALYTICS_TOKEN` are only needed if you want custom-domain verification and the analytics screens on staging; add them as in `.env.example`.)

### 8. First deploy (you run this; I do not deploy)

```
pnpm exec wrangler login
pnpm db:migrate:staging     # creates every table in the staging database
pnpm deploy:staging         # predeploy check, tracker, app, cron
pnpm secrets:staging        # uploads .env.staging to the three staging Workers
```

The Workers must exist before secrets can be set, so the first `pnpm deploy:staging` creates them and `pnpm secrets:staging` follows. Secrets take effect immediately; no second deploy is needed. After that, `pnpm deploy:staging` is the only command for a new version (run `pnpm db:migrate:staging` first when a branch adds a migration).

### 9. Check it

1. `https://app.staging.tany.in/login` loads (valid certificate).
2. Sign in as an owner whose email is in `CABS_ALLOWED_EMAILS`; create a cab business with slug `demo`. Its site is `https://demo.staging.tany.in`.
3. `https://nosuch.staging.tany.in` answers 404 (not a certificate error).
4. Cloudflare dashboard → *Workers → tanyapps-cron-staging → Logs*: a line every minute for `expire-trip-holds`.
5. Customer login with a Firebase test phone number from `https://demo.staging.tany.in`.
6. A Razorpay test payment (subscription on the billing screen): the webhook shows delivered (200) in Razorpay's dashboard, and the Workers logs do **not** show `razorpay_webhook_fallback`.

## What is shared with production, and what is not

- **Separate:** database, encryption and signing keys, Workers and their Durable Objects (rate limits and live positions), buckets, the Razorpay account mode, the Google Maps key, cron locks, analytics datasets (`*_staging`).
- **Shared:** the Cloudflare account and the `tany.in` zone, the Firebase project (and its SMS bill and budget alert), the GitHub repository.
- **Not done:** nothing on staging is deployed or created by me. No DNS record, certificate, bucket or webhook exists until you create it.
