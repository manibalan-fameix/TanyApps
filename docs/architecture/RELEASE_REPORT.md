# Release report (updated after pass 5)

Status words: **PASSED** (executed, passed) · **FAILED** · **BLOCKED** (a named prerequisite is missing) · **NOT RUN**. "Local" = a laptop with a throwaway Postgres, the Firebase Auth emulator and local build tooling. Nothing here was run on a deployed environment, on GitHub, against Razorpay, Cloudflare Access or Google Cloud, and no commit, push, deploy, shared-environment migration or live credential was used.

## Verdicts

| Release | Verdict | Evidence |
|---|---|---|
| **Isolated security hotfix** (frozen patch, 15 files) | **GO for staging; GO for production after the staging checks and your authorization** | Patch checksum unchanged, applies cleanly to `main`, typechecks and passes the whole `main` suite on `main`'s own dependencies (pass 4); 31 hotfix tests. Not exercised on a real Firebase project or Cloudflare. **Public repository: ship it through a private route and quickly.** |
| **Full architecture branch: review** | **GO for review** | All local gates pass (below); the delivery plan is rehearsed. Not mergeable until the hotfix is live and GitHub CI has run. |
| **Staging deployment** | **CONDITIONAL GO** | Needs the staging secrets file, the Cloudflare login that sees the account, and Razorpay test keys (`deploy:preflight staging` blocks on 7 items). Migrations 0033-0036 apply first. No code blocker found. |
| **Production release** | **NO-GO** | See "Production blockers". A staging GO is not a production GO. |

## Local evidence

| Check | Result |
|---|---|
| Disposable-DB suite | PASSED: 98 files, **1523** tests (1369 at the start of pass 5) |
| Suite without a DB | PASSED: 1161 passed, 362 skipped |
| Typecheck; lint | PASSED; 0 errors, 29 warnings (unchanged) |
| Playwright, fresh DBs + Firebase Auth emulator | PASSED: **18/18** (restaurant checkout, subscription page state and cab double-tap are new) |
| `next build`, OpenNext build, 4 Wrangler dry-runs (clean copy, no `.env`) | PASSED |
| `pnpm audit --prod` | PASSED: no known vulnerabilities (2 dev-tool advisories remain) |
| `scripts/staging-smoke.sh` vs local `next dev` | PASSED (headers incl. CSP report-only, closed endpoints, routing) |
| Migrations 0033-0036 from empty and onto the existing test DB | PASSED (additive; guard test) |
| Delivery rehearsal: hotfix branch = 15 files; 8 commits on top; fast-forward and squash merge; identical final tree | PASSED |
| CSP report-only: violations seen in the 18 browser journeys | none logged (Razorpay and Firebase are not loaded locally: unverified for them) |

## What pass 5 fixed (confirmed weaknesses)

| Severity | Weakness | Fix | Tested by |
|---|---|---|---|
| P1 | Owners could create and hold credentials for accounts, enabling identity squatting | Verified-acceptance invitations; owner-set passwords removed; legacy accounts released when the person verifies | `team-invites.integration`, `identity-ownership` |
| P1 | No durable record of privileged actions; exports unaudited | Append-only security trail; exports fail-closed | `security-audit.integration` |
| P1 | A lost renewal webhook could suspend a paying business | Daily reconciliation job (read-only against Razorpay) | `subscription-reconcile.integration` |
| P2 | Cost per business/feature not measurable or limitable | Idempotent metering, atomic limits, observe-first policy, views | `usage-metering.integration` |
| P2 | Cab double-tap created two requests | Operation key + unique index | `booking-idempotency.integration`, Playwright |
| P2 | Failed scheduled jobs invisible in the admin | Job status on `/super/platform` | `cron-status.integration` |
| P2 | Access-control drift risk | Access-mode ratchet and adversarial cross-product tests | `tenant-access`, `tenant-adversarial` |
| P2 | Jarvis protected by a per-isolate limit only | Access JWT verification and shared limiter in the Worker (dashboard side pending) | `jarvis-access` |
| P3 | No CSP | Report-only CSP and report endpoint | `csp` |

## Production blockers

1. **BLOCKED**: the historical super-admin weakness has not been shown to be unexposed in production (owner investigation: `operational-security.md` section 1), and the hotfix is not deployed anywhere.
2. **NOT RUN**: GitHub CI has never executed; branch protection depends on it.
3. **NOT RUN**: deployed-Worker behaviour of `next` 16.4.3 / OpenNext 1.20.13, server actions, Durable Objects and cron on staging.
4. **BLOCKED**: Razorpay test-mode verification (payments, replays, refunds, subscription events, reconciliation job against real subscriptions).
5. **BLOCKED**: Cloudflare Access in front of Jarvis (owner dashboard action) and rotation of the Jarvis passphrase.
6. **BLOCKED**: Google Maps browser and server key restrictions (owner Google Cloud action).
7. **NOT RUN**: real Firebase browser verification of admin versus normal-business authorization (needs three accounts on staging).
8. **NOT RUN**: CSP reports from Razorpay and Firebase journeys; CSP enforcement is therefore not enabled.
9. Migrations 0033-0036 must be applied to staging and then production *before* the application (additive, previous code unaffected).

## Remaining risks

| Class | Item |
|---|---|
| Confirmed code limits | audit trail is tamper-*resistant*, not tamper-proof (database owner can drop triggers); route-quote metering over-counts cache hits; Durable Object requests not attributed per business; legacy teammate password provider still present until migration completes |
| Operational gaps | no alerting on `usage_*`, `csp_violation`, `security_audit_failed` metrics; no R2 lifecycle rule for unconfirmed uploads; no off-database copy of the security trail |
| Unverified integrations | Firebase (real), Razorpay (real), Cloudflare Access, Google Cloud restrictions, GitHub CI |
| Optional future work | CSP nonces and enforcement; RLS for a read-only reporting role (ADR-1); per-plan quotas once usage is measured; operator-visible usage for businesses |

## Required owner actions, in order

1. Choose the disclosure route and ship the hotfix (`SECURITY_HOTFIX_PLAN.md`); answer the exposure question.
2. Review and commit with `docs/release/GIT_DELIVERY.md` (hotfix first, full branch on top; hold the documents back).
3. Rotate the Jarvis passphrase; create the Access application and set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`; restrict the Maps keys.
4. Provide staging prerequisites, run `pnpm deploy:preflight staging` to a clean pass, apply migrations, deploy, run `scripts/staging-smoke.sh`, then the matrix in `docs/staging/staging-release-checklist.md` (rows 1-22).
5. Open the PR (public-safe branch) and confirm both CI jobs pass on GitHub.
6. After 2-4 weeks of `/super/usage` data, set unit costs, abuse ceilings and any allowances.
