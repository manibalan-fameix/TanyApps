# Production readiness (updated in pass 5)

**Pass 5 supersedes the verdict table below: see `RELEASE_REPORT.md`.** Summary: hotfix GO for staging then production with authorization; full branch GO for review; staging CONDITIONAL GO; production NO-GO. New since pass 4: invitation-based staff identity, security audit trail, usage metering and limits, subscription reconciliation, cab booking idempotency, CSP report-only, Jarvis Access verification, 18 browser journeys (restaurant checkout, subscription page state and cab double-tap added), migrations 0033-0036 (`MIGRATION_AND_COMPATIBILITY.md`), 98 test files / 1523 tests on the disposable database.

The current, evidence-based verdicts are in `RELEASE_REPORT.md`; this file keeps the longer requirement table and checklist. Corrections since pass 3: the hotfix is **15 files** (not 9) and was verified on a clean `main` with `main`'s own lockfile; browser tests are now **15/15**; local suite is **1369** tests; the GitHub repository is **public**, so the hotfix must ship through a private route (`SECURITY_HOTFIX_PLAN.md`); the staging checklist and 13-scenario matrix are in `docs/staging/staging-release-checklist.md`.

Status words: IMPLEMENTED (code changed) · TESTED (automated, executed, passed) · VERIFIED (confirmed in the real target environment) · BLOCKED (a named prerequisite is missing) · NOT RUN.

Nothing on this branch is VERIFIED in a real environment. Everything below that says TESTED ran locally against a throwaway Postgres, a Firebase Auth emulator and local dev/build tooling.

## Verdicts

| | Verdict | Reason |
|---|---|---|
| **A. Isolated security hotfix** (9 files, `SECURITY_HOTFIX_PLAN.md`) | **GO for staging, then GO for production after the staging checks** | Small, no migration, typechecks and passes 38 targeted tests alone on `main`. It closes a P0. The only behaviour change is that super admins sign in once more. Production release still needs the staging evidence in the plan and the owner's authorization. **If the vulnerable code (from 2026-10-17) is live, every day without this fix is open exposure.** |
| **B. Staging deployment of the full branch** | **CONDITIONAL GO** | Conditions: a real `.env.staging` and a Cloudflare login that can see the staging account (`deploy:preflight staging` currently BLOCKS on both); Razorpay **test** keys and a staging-only webhook; the staging checklist below. Local gates are green and nothing here changes a migration. |
| **C. Full production release** | **NO-GO** | No deployed-Worker evidence for the upgraded `next` 16.4.3 / OpenNext; no Razorpay test-mode run; GitHub CI never executed; no browser coverage of restaurant checkout, subscription UI, or super-admin/owner separation; the Jarvis network-level control and CSP are not done; the production exposure question for the P0 is unanswered. A staging GO is not a production GO. |

## Requirement status

| Requirement | Status |
|---|---|
| Super-admin guard uses only Firebase-verified identity (+ optional uid) | IMPLEMENTED, TESTED (16 tests; fails on the old guard). In a browser with real accounts: BLOCKED |
| `addTeammate` cannot create or take over a team identity or a self-registered account's password | IMPLEMENTED, TESTED (helper live DB; guard tests) |
| Every `/super` entry point guarded on the server | TESTED (structural tests) |
| Subscription terminal states and monotonic `paidThrough` under replay, reorder and concurrency | IMPLEMENTED, TESTED (8 live-DB tests, no Razorpay). Real Razorpay: NOT RUN |
| Trusted client IP in production | IMPLEMENTED, TESTED. On Cloudflare: NOT RUN |
| Photo upload byte verification, bounded bodies, distinguishable rejections | IMPLEMENTED, TESTED. From a real phone: NOT RUN |
| Video duration cap, process timeout | IMPLEMENTED, TESTED (live DB). On the real worker host: NOT RUN |
| Jarvis passphrase lockout | IMPLEMENTED, TESTED. Cloudflare Access / Rate Limiting: NOT DONE (dashboard) |
| Dependencies: runtime audit clean; 41 → 2 dev-only | IMPLEMENTED, TESTED |
| Next/OpenNext build, bundle, Wrangler dry-runs | TESTED (local clean copy) |
| Next 16.4.3 / OpenNext 1.20.13 on deployed Workers | NOT RUN |
| Playwright | TESTED: 15/15 across the three configs, re-run from fresh databases after the pass-4 auth refactor. Restaurant checkout and subscription UI: NOT RUN (no specs) |
| GitHub Actions CI | IMPLEMENTED (SHA-pinned). **NOT RUN on GitHub** |
| Razorpay test-mode verification | BLOCKED (staging, test keys, webhook) |
| Staging deploy preflight | BLOCKED (7 findings) |
| CSP | IMPLEMENTED as report-only (pass 5); enforcement NOT DONE pending staging reports |

## Staging prerequisites (checked against the repo)

- Isolation is configured: staging has its own worker names (`tanyapps-staging`, `-tracker-staging`, `-cron-staging`), routes on `tanystaging.in`, R2 bucket `tany-staging`, its own Analytics datasets, Durable Objects bound to the staging tracker script, cron triggers aimed at `app.tanystaging.in`, and its own Firebase project whose values come from `.env.staging` (not the repo).
- Required but absent here: `.env.staging` with `DATABASE_URL` (a staging Neon database, never production), `CRON_SECRET`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `TRACKER_SECRET`, `RAZORPAY_KEY_ID/KEY_SECRET` (**test mode**), `RAZORPAY_WEBHOOK_SECRET`, R2 keys, Firebase staging project values, `SUPER_ADMIN_EMAILS` (and optionally `SUPER_ADMIN_UIDS`); `pnpm secrets:staging` uploads them (this branch adds the two super-admin keys to that script).
- Migrations: none ship with this branch. Run `pnpm db:migrate:staging` only if the staging database is behind `main`.
- Preflight: `pnpm deploy:preflight staging` must print no `BLOCKED` line before any deploy.

## Staging verification checklist (evidence to capture)

1. `curl -sI https://app.tanystaging.in/login` → `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; `Cache-Control: private, no-store` still present.
2. **Tenant resolution:** `https://<slug>.tanystaging.in/` renders that business; an unknown slug 404s; `/sites/x` on any host 404s; `x-tenant-slug` sent by the client is ignored.
3. **Super admin:** team Google account → `/super` loads; business owner → 404; teammate-password session → 404; owner adding a team email as teammate → refused; with `SUPER_ADMIN_UIDS` set to another uid → 404.
4. **Server actions** on `next` 16.4.3: add a car, publish, change team settings: no 500s in `wrangler tail`.
5. **Vehicle images:** in-app camera photo from a phone is stored and displayed; `curl -X PUT` of HTML as `image/jpeg` → 415 with `x-reject-reason: unrecognised`; a HEIC file → 415 `heic_unsupported`.
6. **Restaurant ordering:** place a test order (cash, then online with a Razorpay test card), see it on the board.
7. **Cab booking:** fares appear, booking request created, operator accepts, customer sees "Confirmed".
8. **Durable Objects:** rider location socket connects (`wss://track.tanystaging.in/ws`) with a valid ticket and is refused without one; `rate_limiter_unreachable` metric absent.
9. **Cron:** all four triggers fire (`wrangler tail` on the cron worker, 200 from `/api/internal/cron/<job>`); a wrong `x-cron-secret` → 401.
10. **Webhooks / subscriptions / usage:** see below; and search logs for `"metric":"usage"` lines carrying a `dealer` id and no personal data.

## Razorpay test-mode requirements (all BLOCKED today)

Test keys and a staging-only webhook secret; `pnpm razorpay:check` against test mode; then: (a) pay a Motors booking, resend the same `order.paid` and `payment.captured` webhooks twice, expect one paid booking; (b) two buyers pay for one car, loser refunded once; (c) double payment on one booking, second refunded once; (d) refund by owner, staff refused; (e) create a test subscription, cancel it, then resend an older `subscription.authenticated` event: status stays `cancelled`; (f) resend an `active` event with an earlier `current_end`: paid-through does not move back; (g) simulate a failed refund and confirm the exception appears in `/super/payments`. Never use live keys.

## Remaining production blockers

1. P0 hotfix not yet deployed anywhere; the owner must answer whether production ran the vulnerable code and review the investigation queries in `SECURITY_HOTFIX_PLAN.md` (I accessed no production data).
2. GitHub CI has never run.
3. Deployed-Worker and Razorpay test-mode evidence (above).
4. Jarvis behind Cloudflare Access / Rate Limiting; passphrase rotation.
5. No e2e for restaurant checkout, subscription UI or owner-vs-super-admin in a browser.
6. Owner-provisioned staff accounts can squat a person's identity (P2); unfixed.
7. CSP; two dev-tool advisories; `addTeammate` enumeration message; double-tap cab requests (P2s).

## Rollback

Everything is code/config/tests/docs; revert the commits (including the lockfile) and redeploy. Reverting restores the vulnerable `next` and the super-admin hole, so prefer rolling forward; hotfix-specific rollback guidance is in `SECURITY_HOTFIX_PLAN.md`. Code reverts never undo past migrations, refunds or payments.
