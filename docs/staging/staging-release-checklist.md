# Staging release checklist and test matrix

Companion to `docs/tanycabs/STAGING.md` (how to build staging from nothing) and `docs/staging/workers-staging-runbook.md` / `razorpay-test-mode-runbook.md`. This file is the **go/no-go gate and the evidence list**. Nothing in it has been run against a deployed environment. Never commit `.env.staging`; never paste a secret into a ticket, chat or log.

## 1. Preflight state today (local, read-only)

`pnpm deploy:preflight staging` was run. It deploys nothing and printed 7 blocking findings, all missing prerequisites rather than code problems:

| Finding | Needed from the owner |
|---|---|
| `.env.staging` not found | create it (values below) |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` / `WEBHOOK_SECRET` missing | Razorpay **test-mode** keys and a staging webhook secret (guard also rejects any `rzp_live_` key on staging) |
| `DATABASE_URL` missing | a fresh, empty, **staging-only** Neon database (guard rejects localhost, production's host, or a name it recognises as the other environment) |
| `CRON_SECRET` missing | random value shared by app and cron worker |
| Cloudflare login cannot see the target account | `npx wrangler logout`, then `npx wrangler login` with the account that owns `tanystaging.in` (account id begins `8b98`, ends `2ede`) |

New in this branch: the guard also prints a note when `SUPER_ADMIN_EMAILS` is empty (nobody could open `/super`) and when `SUPER_ADMIN_UIDS` is set.

## 2. What staging is, and why it is isolated (read from the configs)

| Item | Staging value | Isolation evidence |
|---|---|---|
| Workers | `tanyapps-staging`, `tanyapps-tracker-staging`, `tanyapps-cron-staging` | guard blocks if a name differs |
| Hostnames | `tanystaging.in`, `app.tanystaging.in`, `*.tanystaging.in`, `track.tanystaging.in`, `cdn.tanystaging.in` | separate Cloudflare zone and certificate; guard blocks routes that belong to production |
| Database | own Neon database | guard compares host and database with production's |
| R2 | `tany-staging` (public, custom domain `cdn.tanystaging.in`) and `tany-staging-private` (no public access) | bucket names set in `wrangler.jsonc` staging env |
| Durable Objects | `TRACKER`, `RATE_LIMITER` bound to `tanyapps-tracker-staging` | separate script name, separate storage |
| Analytics Engine | `tany_listing_events_staging`, `tany_platform_metrics_staging` | separate datasets |
| Cron | `* * * * *`, `*/5 * * * *`, `30 2 * * *`, `30 0 1 * *` aimed at `https://app.tanystaging.in` | guard blocks if the target differs |
| Firebase | its own project (`tany-staging`); web config comes from `.env.staging`, **not** the repo | `wrangler.jsonc` staging block deliberately has no Firebase values |
| Razorpay | `rzp_test_` keys and a test-mode webhook | guard rejects live keys on staging |

## 3. Required configuration (names only)

`.env.staging` (see `docs/tanycabs/STAGING.md` section 8 for how to generate each): `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `CRON_SECRET`, `TRACKER_SECRET`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GOOGLE_MAPS_SERVER_KEY`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_APPCHECK_SITE_KEY`, `PHONE_OTP_PROVIDER`, `CABS_ALLOWED_EMAILS`, `SUPER_ADMIN_EMAILS`, optionally `SUPER_ADMIN_UIDS`, optionally `STAGING_OWNER_EMAIL`.

Must **not** be set (the guard blocks them): `RAZORPAY_ALLOW_DIRECT`, `GEO_FIXTURE`, `E2E`, `LOCAL_ADMIN_PASSWORD`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_TEST_PHONES`, any `TEST_DATABASE_*`, `NODE_ENV=development`.

**Use three different Google accounts for the authorization tests**, otherwise the tests prove nothing: (T) a Tany team account listed in `SUPER_ADMIN_EMAILS`; (O1) a business owner not on that list (`STAGING_OWNER_EMAIL` makes it owner of the three demo businesses); (O2) a second owner of a different business (create one through onboarding), for cross-business tests. For the uid factor, copy T's uid from Firebase console, Authentication, Users, into `SUPER_ADMIN_UIDS`.

## 4. Order of operations

1. Hotfix first, on its own (see `SECURITY_HOTFIX_PLAN.md`); then the full branch. Do not deploy both in one step.
2. `pnpm deploy:preflight staging` must print no `BLOCKED` line.
3. `pnpm secrets:staging`; `pnpm db:migrate:staging` (only if the staging database is behind `main`; this branch adds no migration); `bash scripts/setup-wildcard-dns.sh staging`; `pnpm deploy:staging`; `pnpm seed:staging`.
4. Run the smoke script: `scripts/staging-smoke.sh tanystaging.in demo-motors` (no credentials; exit 0 only if all checks pass). Expected output: every line `PASS`, final line `ALL CHECKS PASSED`.
5. Work the matrix below. Save the evidence in the ticket, never secrets.

## 5. Rollback and forward recovery

Code: `pnpm deploy:staging` of the previous commit (Cloudflare also keeps previous versions: Workers, the app, Deployments, roll back). Database: this branch has no migration, so nothing to undo; if a staging migration was applied for other reasons, forward-fix with a new additive migration, never edit an applied one. Payments: a test-mode mistake is resolved in the Razorpay test dashboard; no reconciliation with production is ever needed. If staging misbehaves after the hotfix (team cannot sign in), check `SUPER_ADMIN_EMAILS` spelling, sign in again with Google, and for the uid factor confirm the uid; do **not** roll back to the old guard.

## 6. Test matrix

Legend: **A** = automated and already passing locally (file named); **M** = manual on staging; **B** = blocked until a stated prerequisite exists. "Evidence" is what to capture. Local automation does not replace the staging run; it only says the logic held on a laptop.

| # | Scenario | Type | Steps (short) | Acceptance criteria | Evidence |
|---|---|---|---|---|---|
| 1 | Real Firebase admin vs normal-business authorization | A (logic: `super-admin-claims`, `super-admin-guard`, `super-sign-in-action`) + **M/B** (needs staging Firebase project, accounts T, O1, O2) | Sign in as T at `/super/login`; as O1 open `/super`; as O2 open `/super`; add a teammate with T's email; add a teammate with another email, sign in with that password, open `/super`; set `SUPER_ADMIN_UIDS` to a different uid, retry T | T: dashboard loads. O1, O2, password teammate: 404. Adding T's email as teammate: refused. Wrong uid: 404 | screenshots of statuses; no cookie values |
| 2 | Business onboarding and team management | A (`onboard`, `refund-authorization.integration`) + **M** | Onboard a new business as O2; add staff; staff attempts refund and settings; owner removes staff; removed staff reloads | staff cannot refund/change settings/manage team; removal takes effect on the next request; an audit row exists for each team change | list of audit_log actions |
| 3 | TanyMotos listing, uploads, storefront | A (Playwright `add-car` 5/5, `security-hardening` upload tests) + **M** | From a real phone: plate photo, 12 angles with the in-app camera, publish; open storefront and short link; upload HTML as `image/jpeg` with curl; upload a HEIC | listing published; photos display from `cdn.tanystaging.in`; storefront hides the plate; HTML upload 415 `x-reject-reason: unrecognised`; HEIC 415 `heic_unsupported`; a phone camera photo is accepted | storefront URL, curl output |
| 4 | TanyEats ordering and checkout | A (integration only: `restaurant-orders`, `restaurant-stock`, `eats-refund-recovery`) + **M** (no browser spec exists) | Guest orders (cash), then online with a Razorpay **test** card; owner moves it through statuses; refund | order appears on board; paid state set once; stock decremented once; refund recorded once | order code, board screenshot |
| 5 | TanyCabs booking and fares | A (Playwright cabs-login 7/7, cabs-operator 2/2 on emulator + fake maps) + **M** (real OTP test number, real Maps) | Customer picks airport drop, pickup, time; sees fares; verifies phone; books; operator accepts; customer sees confirmed; repeat booking prefill | fare shown equals review total; accept moves status to Confirmed; no price before a trip is chosen | booking code, timeline |
| 6 | Cross-business tenant isolation | A (`tenant-leak*.test`, upload/prefix tests, smoke script) + **M** | As O1 (business A), request business B's car id, order code, booking id, media key and cab file key through the admin and the public URLs | every request is 404/denied and returns nothing of B; unknown subdomain 404; `/sites/*` 404 | status table |
| 7 | Razorpay payment and subscription webhooks | A (mocked: `razorpay-webhook`, `payment-events.integration`, `subscription-events.integration`) + **B** (test keys, staging webhook) | Follow `razorpay-test-mode-runbook.md` scenarios | paid exactly once; refunds exactly once; statuses correct | Razorpay test dashboard ids |
| 8 | Duplicate, replayed, out-of-order events | A (above) + **B** | Resend the same `order.paid` and `payment.captured` twice; two buyers, one car; double payment; cancel a subscription then resend an older `subscription.authenticated`; resend `active` with an earlier `current_end` | one paid booking; loser refunded once; second payment refunded once; status stays `cancelled`; `paid_through` never decreases | DB rows (ids only), webhook delivery log |
| 9 | R2 uploads and media retrieval | A (route tests with mocked storage) + **M** | Upload photo and video; fetch by public URL; fetch a private cab document as owner and as another business | public media loads; private document only for its owner (404 for others); oversize rejected | URLs, statuses |
| 10 | Worker routing and server actions | A (`staging-smoke.sh` logic verified locally; build/dry-run) + **M** | Run the smoke script; exercise a server action in each product; `wrangler tail` | smoke: ALL CHECKS PASSED; no 5xx in the tail; server actions succeed on `next` 16.4.3 | script output, tail excerpt |
| 11 | Durable Object tracker | A (`ws-ticket`, `core-geo-tracking`) + **M** | Rider opens link, shares position; guest opens order page; connect to the socket without a ticket and with an expired one | positions relay in about 1 s; no ticket / expired / wrong origin refused; state gone after delivery or 6 h | wscat output |
| 12 | Scheduled cron jobs | A (`cron`, `cron-financial.integration`) + **M** | `wrangler tail` on the cron worker for 5 minutes; call a job with a wrong secret | each cadence fires; 200 on success; wrong secret 401; a failing job answers 500 and is retried | log lines |
| 13 | Usage metering and operational logs | A (`usage.test`) + **M** | Send chat messages, an OCR and an RC lookup as business A; search the logs and the Analytics Engine dataset | lines `{"metric":"usage","unit":...,"dealer":<A's id>}`, counts match actions, no phone/email/names in any line | query result |

### Pass 5 additions

| # | Scenario | Type | Steps (short) | Acceptance criteria | Evidence |
|---|---|---|---|---|---|
| 14 | Staff invitations and identity ownership | A (`team-invites.integration` 32, `identity-ownership` 5) + **M** with accounts O1 and a third Google account P | O1: Team, Invite teammate (P's email); open the link as P signed in; try the link as a different account; revoke and retry; invite P again after expiry (change the clock or wait); remove P | link works only for P, once; wrong account sees the generic message; revoked or expired link refused; P gets staff access to that business only; O1 never sees a password field | screenshots; `/super/security` rows `team.invite_*` |
| 15 | Legacy staff transition | A (live DB test) + **M** if any legacy staff exist | a legacy password teammate signs in with Google using the matching verified email | the Team list stops showing "Password sign-in" for them; their old password no longer works | before and after screenshot |
| 16 | Security trail | A (`security-audit.integration` 19) + **M** | as T: sign in, export businesses CSV, resolve a test payment exception, change a usage limit | one row each at `/super/security`, correct actor, no content or secrets; `curl` the export as O1: 404 and no row | `/super/security` screenshot |
| 17 | Usage metering and limits | A (`usage-metering.integration` 20) + **M** | use chat, OCR, RC lookup as business A; open `/super/usage`; set an abuse ceiling of 3 for chat on A; ask 5 questions; remove the ceiling | counts match; the 4th and 5th question are refused with 429; business B unaffected; after removal chat works | `/super/usage`, 429 responses |
| 18 | Subscription reconciliation job | A (`subscription-reconcile.integration` 8, fake provider) + **B** (Razorpay test mode) | with a test subscription whose webhook you did not deliver, run `POST /api/internal/cron/reconcile-subscriptions` | `paid_through` advances to Razorpay's `current_end`; a second run changes nothing | job result string, DB row |
| 19 | Cab double submit | A (Playwright, 1 test; `booking-idempotency.integration` 9) + **M** on a phone | double-tap Request booking; then book the same trip again deliberately | one booking from the double tap; the deliberate repeat is a second booking | `/my/bookings` list |
| 20 | CSP report-only | A (`csp.test` 8) + **M**, required before enforcing | open every journey (login, add car, storefront, checkout with Razorpay test, cab booking, tracking) with DevTools open; check worker logs for `csp_violation` | no violations for real journeys (local e2e logged none for the 18 covered journeys, which do not load Razorpay or Firebase) | log search result |
| 21 | Jarvis behind Cloudflare Access | A (`jarvis-access` 14; checks the Worker's own JWT verification only) + **M/B** (needs the Access application) | follow `docs/release/operational-security.md` section 4; then `curl` the Worker's raw `workers.dev` URL with the passphrase but no Access cookie | browser is redirected to Access login; raw URL without Access returns 401; Slack events still reach `/api/slack/events` | curl output |
| 22 | Scheduled job visibility | A (`cron-status.integration`) + **M** | `/super/platform` after a few minutes | every job shows a recent run; a deliberately wrong secret call leaves no failed run | screenshot |

Blocked today: 1 (staging), 7, 8 (staging + Razorpay test keys), and the manual halves of 3-6, 9-13.
