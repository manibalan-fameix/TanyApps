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
| Firebase project | `tany-6c638` | **`tany-staging`** (its own project: users, SMS bill, App Check) |
| Database | production Neon | its own fresh Neon database |
| Secrets | `.env.local` | `.env.staging` |
| Razorpay | live keys | **test** keys (`rzp_test_…`) and a test-mode webhook |
| Deploy | `pnpm run deploy production` (guarded: needs `--secrets-file`, `--confirm`, `--migrations-applied`) | `pnpm deploy:staging` (same guard, staging checks) |

**Staging is only a different `ROOT_DOMAIN`.** `classifyHost` and every other piece of code read the domain from the environment; there is no staging special case (`tests/host.test.ts` runs the same host cases with both roots and checks a production host is never treated as a staging business or the reverse). Because `tanystaging.in` is its own zone, Cloudflare's free Universal certificate (the apex plus `*.tanystaging.in`) covers every host, so no paid certificate is needed.

What is in the repository:

- `env.staging` blocks in `wrangler.jsonc`, `workers/tracker/wrangler.jsonc` and `workers/cron/wrangler.jsonc` (each checked with `wrangler deploy --dry-run --env staging`).
- `pnpm deploy:staging`: `bash scripts/predeploy-check.sh staging`, then tracker, app build and deploy, cron, all to the `staging` environment.
- `pnpm db:migrate:staging`, `pnpm secrets:staging` (`scripts/upload-secrets.sh staging`), `pnpm seed:staging` (`scripts/seed-staging.ts`), and `bash scripts/setup-wildcard-dns.sh staging`.

`predeploy-check.sh staging` **blocks** when: `.env.staging` is missing or a core value is empty; the database is local or is production's (same host and database, whatever the options); `AUTH_SECRET`, `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `CRON_SECRET` or `TRACKER_SECRET` equals production's; `R2_PRIVATE_BUCKET` is production's; the Razorpay key is not `rzp_test_`; the Firebase web config is missing or names production's project; `wrangler.jsonc` hard-codes a Firebase value in the staging block; a dev/test-only setting (`GEO_FIXTURE`, `FIREBASE_AUTH_EMULATOR_HOST`, `E2E`, `FIREBASE_TEST_PHONES`, …) is present; the working tree is dirty; or typecheck, lint or tests fail. `upload-secrets.sh staging` repeats the database, Razorpay and shared-secret checks, and `seed-staging.ts` refuses to run against the database named in `.env.local`.

## Live-database tests and Razorpay test-mode runs

Two separate documents cover them, because they carry their own safety rules (a disposable, marked test database; test keys only, nothing run
without an explicit go-ahead): [`docs/staging/neon-test-database.md`](../staging/neon-test-database.md) and
[`docs/staging/razorpay-test-mode-runbook.md`](../staging/razorpay-test-mode-runbook.md). The test database is a *separate role and database
inside the staging project* (never a branch of production, and never the staging app's own database).

## The order (summary)

1. Buy `tanystaging.in`. 2. Add it to Cloudflare, point the registrar's nameservers there, wait for **Active**. 3. Create the Neon database. 4. Create the two R2 buckets, the CDN domain and the token. 5. Razorpay test keys and webhook. 6. Create the **`tany-staging`** Firebase project and register its web app. 7. Maps key. 8. Write `.env.staging`. 9. Run the commands: `wrangler login`, **`pnpm secrets:staging`**, `pnpm db:migrate:staging`, `bash scripts/setup-wildcard-dns.sh staging`, `pnpm deploy:staging`, `pnpm seed:staging`. 10. Check it.

Only the Cloudflare zone must be **Active before the first deploy** (the Workers' custom-domain routes cannot be created otherwise). Secrets go **first**: see the note in step 9.

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

## 6. Firebase: a separate project, `tany-staging`

Staging has **its own Firebase project**, so its users, SMS bill, App Check enforcement and authorised domains are independent of production's. Nothing in the repository names the staging project: its web config lives in `.env.staging` and is uploaded with `pnpm secrets:staging`; the app reads `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` and `FIREBASE_APP_ID` from the environment at request time (`getFirebaseWebConfig`). The only place the production project (`tany-6c638`) appears is production's own config in `wrangler.jsonc` and the Firebase CLI files; `predeploy-check.sh` and `upload-secrets.sh` refuse a staging config that names it.

1. **Create the project.** Firebase console → *Add project* → name it **`tany-staging`** (the project id may get a suffix if the name is taken; use whatever id Firebase shows). Google Analytics is not needed.
2. **Blaze plan.** *Usage and billing → Details & settings → Modify plan → Blaze*, and attach a billing account (the same one as production is fine; the budget alert below is per project). Phone sign-in does not work on the free plan.
3. **Sign-in methods.** *Build → Authentication → Get started → Sign-in method*: enable **Phone**, **Google** (set the project support email) and **Email/Password**. These are the methods the app's logins use.
4. **SMS region policy = India only.** *Authentication → Settings → SMS region policy* → **Allow** → select only **India (+91)** → Save. (New projects allow no region at all, so phone sign-in is refused until you do this.)
5. **Authorised domain.** *Authentication → Settings → Authorized domains* → add **`app.tanystaging.in`**. Business sites and customers' own domains need no listing: the login lives only on the app host. (`localhost` is not allowed for phone sign-in.)
6. **Register the web app and copy its config.** *Project settings (gear) → General → Your apps → Add app → Web* (nickname `tany-staging-web`, no Firebase Hosting). Copy the four values it shows into `.env.staging`: `apiKey` → `FIREBASE_API_KEY`; `authDomain` → `FIREBASE_AUTH_DOMAIN` (`<project-id>.firebaseapp.com`); `projectId` → `FIREBASE_PROJECT_ID`; `appId` → `FIREBASE_APP_ID`. These are public values, not secrets.
7. **App Check with reCAPTCHA Enterprise.**
   1. Google Cloud console, project `tany-staging` → *APIs & Services* → enable **reCAPTCHA Enterprise API**.
   2. *Security → reCAPTCHA Enterprise* → **Create key** → *Website*, domain **`app.tanystaging.in`**, score-based (no checkbox). Copy the **site key** into `.env.staging` as `FIREBASE_APPCHECK_SITE_KEY`.
   3. Firebase console → *App Check → Apps* → the web app → **reCAPTCHA Enterprise** → paste the same site key → Save.
   4. After one successful test login (step 10), *App Check → APIs → Authentication* → **Enforce**. If you enforce before the key is in the page, every login is refused; that is the failure to watch for.
8. **Test phone numbers (no SMS, no cost).** *Authentication → Sign-in method → Phone → Phone numbers for testing* → add up to 10 fictional numbers with fixed codes, for example `+91 90000 00201` with code `123456`. I have not tried them with the real login page; if the page refuses a test number, tell me.
9. **Budget alert for this project.** Google Cloud console → *Billing → Budgets & alerts → Create budget* → scope to project `tany-staging` → a small monthly amount (suggest ₹500) → alerts at 50%, 90%, 100% to your email. A budget warns; it does not stop spending.

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
FIREBASE_API_KEY=          # step 6: the tany-staging web app's config
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
CABS_ALLOWED_EMAILS=       # emails allowed to create a cab business on staging
PHONE_OTP_PROVIDER=firebase
FIREBASE_APPCHECK_SITE_KEY= # step 6.7
PILOT_DEALERS=
SUPER_ADMIN_EMAILS=        # the Tany team's Google emails allowed into /super. Empty means NOBODY can open /super (safe, but staging checks need it)
SUPER_ADMIN_UIDS=          # optional second factor: the Firebase uids (from Authentication > Users) of those same accounts. Leave empty to use emails only
STAGING_OWNER_EMAIL=       # optional: links this Google account as owner of the demo businesses (seed step)
```

## 9. Commands, in this order

```
pnpm exec wrangler login

pnpm secrets:staging                       # uploads .env.staging to the three staging Workers (creates them as empty stubs)
pnpm db:migrate:staging                    # creates every table in the empty staging database
bash scripts/setup-wildcard-dns.sh staging # the *.tanystaging.in record (zone must be Active)
pnpm deploy:staging                        # predeploy check, tracker, app, cron. Fills in the stubs; secrets are kept.
pnpm seed:staging                          # demo cab operator, restaurant and car dealer (fake data)
```

**Why secrets come before the first deploy.** I first wrote it the other way round, on the belief that a Worker must exist before it can hold secrets. That was wrong: Wrangler's `secret bulk` (checked in the installed wrangler 4.136.3) creates a missing Worker as an empty stub holding just the secrets, and a later `wrangler deploy` replaces the stub's code and keeps its secrets (the same thing every production deploy relies on). Secrets first is better because the very first deploy is already complete and working, with nothing running briefly without its keys, and the secrets script's safety checks (database, shared keys, Firebase project, Razorpay) run before anything exists on Cloudflare. What I could not test without your account: the tracker's first deploy onto a stub (it applies the Durable Object migrations v1 and v2 to a Worker that has none). If that first deploy complains about migrations, stop and tell me the exact message.

**Expected warning.** During `pnpm deploy:staging`, Wrangler prints "The following vars exist at the top level, but not on env.staging.vars: CLOUDFLARE_ZONE_ID, FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID". That is intended: on staging those five come from secrets (`.env.staging`), not from the config file, so nothing of production's is hard-coded there. It is not an error.

`pnpm deploy:staging` runs the predeploy check first, which needs `.env.staging` but no uploaded secrets, so it can run before or after `secrets:staging`.

The seed creates `demo-cabs`, `demo-eats` and `demo-motors`. It only links an owner when `STAGING_OWNER_EMAIL` is set; to manage the demo businesses, sign in once with that Google account, then run `pnpm seed:staging` again (it is safe to repeat).

After this, `pnpm deploy:staging` is the only command for a new version (run `pnpm db:migrate:staging` first when a branch adds a migration). Secrets take effect immediately; no deploy is needed after changing one with `pnpm secrets:staging`.

## 10. Check it

1. `https://app.tanystaging.in/login` loads with a valid certificate; so do `https://tanystaging.in` and `https://demo-cabs.tanystaging.in`.
2. `https://nosuch.tanystaging.in` answers 404 (not a certificate error).
3. Cloudflare → *Workers → tanyapps-cron-staging → Logs*: a line every minute for `expire-trip-holds`.
4. On `https://demo-cabs.tanystaging.in`: book an airport trip, log in with a Firebase test phone number (step 6.8), request; in the operator app (signed in as the owner) accept it; the customer page shows Confirmed.
5. A Razorpay test payment (a subscription on the billing screen): the webhook shows delivered (200) in Razorpay's dashboard, and the Workers logs do **not** show `razorpay_webhook_fallback`.

## What is shared with production, and what is not

- **Separate:** domain and zone, Firebase project (users, SMS, App Check), database, encryption and signing keys, Workers and their Durable Objects (rate limits and live positions), buckets, Razorpay mode, the Maps key, cron locks, analytics datasets (`*_staging`).
- **Shared:** the Cloudflare account, the Google/Firebase billing account if you attached the same one (the projects and their budgets are separate), the GitHub repository.
