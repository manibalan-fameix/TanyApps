# Implementation report

Branch `arch/hardening-pass`, uncommitted working tree on top of `main` @ 13fef4f. No push, deploy, migration, external service call, or production credential was used. No schema migration was added: every change is code, config, tests or docs, so Git revert fully undoes it.

Status words: **IMPLEMENTED** code changed · **TESTED** automated tests executed and passed · **VERIFIED** confirmed in the real environment · **BLOCKED** prerequisite missing · **RECOMMENDED** not done.

## Changes

| # | Change | Files | Status |
|---|---|---|---|
| 1 | One trusted `clientIp()` for all rate-limit keys (was three divergent copies, two preferring spoofable `x-forwarded-for`). Static test forbids new copies. | `app/api/t/chat/route.ts`, `app/api/t/track/route.ts`, `app/(admin)/(shell)/cars/actions.ts`, `tests/security-hardening.test.ts` | IMPLEMENTED, TESTED (test fails on the old code: confirmed) |
| 2 | Subscription status cannot leave a terminal Razorpay state (`cancelled/completed/expired`) because of a late event. Entitlement (`paidThrough`, grace) untouched. | `lib/billing/state.ts`, `lib/billing/service.ts` | IMPLEMENTED, TESTED (unit). Live Razorpay: BLOCKED (no test credentials/webhook endpoint used) |
| 3 | Photo upload: content type from magic bytes must equal declared type; body read with a hard size cap (no reliance on `Content-Length`); private documents use the same capped read. Also tests cross-tenant prefix, `..`, anonymous. | `app/api/upload/[...key]/route.ts`, `lib/media/read-body.ts`, `tests/security-hardening.test.ts` | IMPLEMENTED, TESTED. All in-app photo producers emit canvas JPEG, so legitimate uploads still pass (read from `lib/image/resize.ts`, `camera-session.tsx`); not exercised in a browser |
| 4 | Baseline security headers on all routes; `/login` no-store rule kept. | `next.config.ts` | IMPLEMENTED, TESTED (config), `next build` passes. Headers on a deployed host: not VERIFIED |
| 5 | Per-tenant usage attribution (`recordUsage`) and `countMetric` quantity argument (default 1, backward compatible). Wired to chat, OCR, RC lookup. | `lib/core/usage.ts`, `lib/core/metrics.ts`, chat route, `cars/actions.ts`, `lib/rc/lookup.ts`, `tests/usage.test.ts` | IMPLEMENTED, TESTED. Analytics Engine dataset/queries: not VERIFIED |
| 6 | Architecture boundary ratchet (product→product and core→product). | `tests/architecture-boundaries.test.ts` | IMPLEMENTED, TESTED |
| 7 | CI: typecheck, lint, then migrations + full suite on a throwaway Postgres that passes the disposable-DB guard. | `.github/workflows/ci.yml` | IMPLEMENTED. The same steps were run locally on a fresh database (create role/db/marker → `test:db check` → `migrate` → full suite: 1307 passed at that point, then dropped). Never run on GitHub: not VERIFIED |
| 8 | Docs | `docs/architecture/*` | — |

## Test results (actual)

| Run | Result |
|---|---|
| Baseline, no DB | 1042 passed, 249 skipped |
| Baseline, local disposable DB | 1291 passed |
| Final, local disposable DB `tany_test` | **82 files, 1310 passed, 0 failed, 0 skipped** |
| Final, no DB | 65 files passed, 17 skipped; 1061 passed, 249 skipped (the skips are the live-database tests) |
| Fresh-database run (CI steps) | migrations applied from empty; 1307 passed (before the boundary test was added) |
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 29 warnings (same count as baseline) |
| `pnpm build` (Next, separate dist dir) | succeeded |
| `pnpm audit --prod` | 41 advisories (3 critical, 13 high), pre-existing; not changed |
| Playwright e2e, OpenNext/wrangler build, Neon staging, Razorpay test mode | **NOT RUN** (no browsers/credentials/staging used) |

New tests: 14 (security-hardening) + 2 (usage) + 3 (boundaries) = 19.

## Compatibility

No public route, response shape, schema or migration changed. Behavioural differences a user could see: (a) a photo upload whose bytes are not a real JPEG/PNG/WebP now gets 415 instead of being stored; (b) a request that supplies a forged `x-forwarded-for` now shares the real client's rate-limit bucket; (c) responses carry extra headers (`X-Frame-Options: SAMEORIGIN` would break only if a third party embeds our pages; none does in-repo).

## Remaining issues

See ARCHITECTURE_BASELINE.md findings F7–F11, and "Not audited". No confirmed cross-tenant vulnerability was found in the audited surface, but the audit was targeted, not exhaustive.

---

# Pass 2 (security, unaudited modules, release verification)

Same rules: nothing committed, pushed, deployed or migrated; no live credential used. No schema change. Everything is reverted by `git revert` *except* that the dependency upgrade also changes `pnpm-lock.yaml` (revert the lockfile with it).

| # | Change | Files | Status |
|---|---|---|---|
| 9 | **P0** Super-admin privilege escalation closed: guard requires the Firebase-verified email (JWT claim `verifiedEmail`), not `users.email`; team addresses refused for teammates. Super admins must sign in once more. | `lib/super/guard.ts`, `lib/super/emails.ts`, `lib/auth/index.ts`, `settings/team/actions.ts` | IMPLEMENTED, TESTED (`super-admin-guard.test.ts`, 4 of 6 fail on old code) |
| 10 | `addTeammate` cannot overwrite the password of a person who signed in themselves. | `lib/tenant/team.ts`, `settings/team/actions.ts` | IMPLEMENTED; helper TESTED live (`team-security.integration.test.ts`); the action path covered by existing `refund-authorization` suite loading it, not by a dedicated end-to-end test |
| 11 | Dependencies: `next` 16.3.4→16.4.3, `@opennextjs/cloudflare` →1.20.13, `wrangler` →4.152.0, `zod` →4.6.7, `vitest` →5.0.5, plus 10 same-major overrides. Advisories 41→2, criticals 3→0. | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | IMPLEMENTED, TESTED, builds verified (below). Runtime on a deployed Worker: NOT RUN |
| 12 | Jarvis: lockout after 10 wrong passphrases/min/IP, before comparison. | `workers/jarvis/index.mjs` | IMPLEMENTED, TESTED |
| 13 | Video worker: 15-minute duration cap (failed, not retried) and 10-minute process timeout. | `workers/video.ts`, `tests/cars.integration.test.ts` | IMPLEMENTED, TESTED (live DB) |
| 14 | `from-video`: multipart body capped while reading. | `app/api/cars/from-video/route.ts` | IMPLEMENTED, TESTED |
| 15 | CI: added `pnpm build` and a `worker-bundle` job (OpenNext build + three `wrangler --dry-run`). | `.github/workflows/ci.yml` | IMPLEMENTED. Never run on GitHub: NOT RUN |

## Re-verification of pass-1 changes

| Item | Result |
|---|---|
| Trusted IP helper | `cf-connecting-ip` is edge-set and overwritten by Cloudflare, so unforgeable on any Cloudflare-fronted host; fallbacks are forgeable and exist for local use. Test forbids other readers. Caveat documented. |
| Subscription transitions | Terminal-state guard only. A re-subscription gets a new Razorpay id and takes the adoption path, which does not use the guard, so it is unaffected. Delayed `halted→active`, `authenticated→active`, `active→pending` still apply. Unit-tested; **not run against Razorpay**. |
| Image formats | Browser paths re-encode to JPEG on a canvas (`lib/image/resize.ts`, camera capture); cab documents were already byte-sniffed. HEIC was never in `PHOTO_TYPES`. Real phone upload through the new check: NOT RUN (needs a device/staging). |
| Bounded read | Cap enforced while streaming, reader cancelled on overflow; tested with and without `Content-Length`. |
| HSTS | Ignored over HTTP (local dev); no `includeSubDomains`/`preload`. Tradeoff on custom domains documented in SECURITY_AND_TENANCY. |
| Usage metering | `dealer` is always the server-side session or host tenant, never request input; RC counts only real provider calls (cache hits excluded). Counts attempts, including provider failures. |
| Boundary tests | The 16 allow-listed edges are shared UI/util and scheduled jobs; none is a security boundary. Gap: the check covers `lib/` and `components/` only, not `app/`. |

## Test and build results (final, actual)

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 29 warnings (unchanged) |
| Disposable-DB suite (`pnpm test:db test`) | **84 files, 1322 passed, 0 failed, 0 skipped** |
| `pnpm test` without DB | 66 files passed, 18 skipped; 1072 passed, 250 skipped |
| `next build` in a clean copy with no `.env*` files | passed |
| `opennextjs-cloudflare build` (clean copy) | passed |
| `wrangler deploy --dry-run` app / tracker / cron | passed; app bundle 36,076 KiB raw / 7,417 KiB gzip |
| `pnpm audit` | 2 left (1 high, 1 moderate), both dev tooling |
| Playwright e2e (local seeded Postgres) | **15 failed**; pass count not captured (output was truncated). All captured failures stop at `e2e/helpers.ts:26`, clicking "Continue with Google". `/login` now renders `DealerLoginForm`, which has no such button, and this branch changed neither the form nor `e2e/`. Classified as a **pre-existing stale e2e helper**, not proven by running `main`. The cab-booking and upload flows these specs cover are therefore **not verified end-to-end**. |

A regression was caught and fixed during this pass: importing the guard module into the team action pulled real `next-auth` into `refund-authorization.integration.test.ts`; fixed by `lib/super/emails.ts`.

## CI workflow review

Runs on `pull_request` and `push` to `main` with `contents: read` and **no secrets**, so fork PRs cannot exfiltrate anything and there is no path to production. The Postgres is a job-local service; the role is non-superuser, the database carries the disposable marker, and `pnpm test:db check` re-validates it before migrations and tests (the guard is not weakened). `pnpm build` runs with no env file, which I reproduced locally in a clean copy. Gaps: actions are pinned by tag, not commit SHA; the pnpm version is installed with `npm -g`; the `ci-admin-only` service password is a throwaway on a job-local port. The workflow has **never executed on GitHub**; local replication of its steps does not count as a green run.

---

# Pass 3 (security verification, E2E recovery, release readiness)

No commit, push, deploy, migration or live credential. Statuses: IMPLEMENTED · TESTED (automated, executed, passed) · VERIFIED (confirmed in a real environment) · BLOCKED · NOT RUN.

## Changes

| # | Change | Files | Status |
|---|---|---|---|
| 16 | Super-admin guard: optional `SUPER_ADMIN_UIDS` second factor (Firebase uid in the JWT); `loadOverview` guards itself; structural tests that every `/super` data function, action and route calls the guard, no page touches the database, and auth callbacks never merge client data into the token. `SUPER_ADMIN_EMAILS`/`UIDS` now uploaded by `upload-secrets.sh` (previously `SUPER_ADMIN_EMAILS` was not, so a script-deployed environment had no super admin). | `lib/super/*`, `lib/auth/{index,firebase}.ts`, `scripts/upload-secrets.sh`, `.env.example`, `tests/super-admin-guard.test.ts` | IMPLEMENTED, TESTED (16) |
| 17 | `clientIp()`: in a production build only `cf-connecting-ip` is trusted; no edge header answers `"unknown"` (one shared bucket) instead of trusting `x-forwarded-for`. Forwarded headers remain a local-development fallback. | `lib/core/guards.ts`, `tests/guards.test.ts` | IMPLEMENTED, TESTED |
| 18 | Subscriptions: `paidThrough` now advances with one conditional `UPDATE` (`advancePaidThrough`), so concurrent or replayed events can never write an older date over a newer one (previously a stale read could). First direct tests of `applySubscription`: replay, delayed, reordered, terminal state, re-subscription, cross-business, unknown business, 8-way concurrency. Razorpay stubbed at the module boundary; no Razorpay call exists in these tests. | `lib/billing/service.ts`, `lib/tenant/billing.ts`, `tests/subscription-events.integration.test.ts` | IMPLEMENTED, TESTED (8, stable over 3 repeats). Against real Razorpay: NOT RUN |
| 19 | Photo rejections are distinguishable (`x-reject-reason`: `heic_unsupported`, `type_mismatch`, `unrecognised`); status codes and accepted formats unchanged. | `lib/media/photo-check.ts`, upload route | IMPLEMENTED, TESTED |
| 20 | `shadcn` moved to `devDependencies` (build-time CLI only). `pnpm audit --prod`: **no known vulnerabilities**. CI gate `pnpm audit --prod --audit-level=high`. | `package.json`, `ci.yml` | IMPLEMENTED, TESTED locally |
| 21 | CI: third-party Actions pinned to commit SHAs (checkout v4.4.0, setup-node v4.4.0), including the two pre-existing Jarvis workflows. | `.github/workflows/*.yml` | IMPLEMENTED. Not run on GitHub |
| 22 | E2E repaired (see matrix): sign-in helper, optional "Marketplace details" wizard step, price assertion, cab home and drop-first booking flow, repeat-booking assertion; default config no longer globs the cab specs; new `test:e2e:cabs-login` script. | `e2e/*`, `playwright.config.ts`, `package.json` | IMPLEMENTED, TESTED locally (below) |
| 23 | `docs/architecture/SECURITY_HOTFIX_PLAN.md` | docs | — |

## Playwright: root cause and results

The 15 failures were **not one cause**. Reproduced on a quiet machine before changing anything.

| Cause | Specs | Verdict |
|---|---|---|
| Login helper clicked "Continue with Google"; the dev sign-in is now a button "Open the demo dealer" (still `NODE_ENV=development` + `E2E=1` only; no new bypass) | all | test maintenance |
| Wizard gained an optional "Marketplace details" step between photos and price | 4 add-car specs | test maintenance (app change) |
| Price now rendered twice on the buyer page (strict-mode locator) | 1 add-car spec | test maintenance |
| Cab specs ran under the default config, which has no server/DB/emulator for them | 9 | config defect, fixed with `testIgnore` |
| Cab home redesigned: "Book your cab"/"Our vehicles" gone, drop-first "Where to?" flow, repeat opens on the details step | 3 | test maintenance; **the vehicle-list assertion was retired**, the "no price before a trip is chosen" invariant is kept |
| Transient Turbopack dev-server panic seen once in one run | 2 | environment; did not recur in 3 later runs |

No application regression caused by this branch was found by these suites.

| Run (all local; databases and Firebase Auth emulator are throwaway, `demo-` project) | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| Default config: add-car (5) + live camera (1) | 6 | 6 | 0 | 0 |
| `playwright.cabs.config.ts`: operator setup, public site | 2 | 2 | 0 | 0 |
| `playwright.cabs-login.config.ts`: customer booking, reject/cancel/sign-out-everywhere, phone booking, subdomain login, custom-domain login, single-use ticket, refuses non-business host | 7 | 7 | 0 | 0 |
| **Total** | **15** | **15** | **0** | **0** |

Final tallies were reached over several runs after the fixes, not one uninterrupted run, and the cab suites need fresh databases (the operator spec requires an empty business).

## Journey coverage requested

| # | Journey | Status |
|---|---|---|
| 1 | Business login and session | TESTED (dev demo sign-in). Real Firebase sign-in: NOT RUN |
| 2 | Business owner denied super admin | TESTED at server level (16 guard tests). **Browser: BLOCKED**: in development the demo owner is also a team address, and a realistic owner session needs a real or emulated Firebase dealer login not wired in the e2e configs |
| 3 | Authorized super admin in a browser | BLOCKED (same reason) |
| 4 | Tenant separation | TESTED (another business's subdomain does not resolve a short link; customer session valid on its own host only; ticket single-use and host-bound) |
| 5-7 | Vehicle creation, mobile-compatible upload, publication | TESTED (add-car 5/5; offline resume; Fast-3G publish 13 s). Invalid-image rejection: TESTED at route level, not in a browser |
| 8 | Customer storefront browsing | TESTED (buyer page renders price, hides plate) |
| 9 | Cab fare presentation and booking request | TESTED against the Firebase emulator and a fake map service; real Google Maps/Razorpay: NOT RUN |
| 10 | Repeated booking request | **Not idempotent by design**: a double submit creates two requests (documented P2); no browser test. The repeat-this-booking prefill is TESTED |
| 11 | Restaurant ordering and checkout | **NOT RUN**: no e2e spec exists. Covered only by integration tests (`restaurant-orders`, `restaurant-stock`, refund suites) |
| 12 | Subscription UI without payment | **NOT RUN**: no e2e spec exists |

## Final local gates (actual)

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 29 warnings (unchanged) |
| Disposable-DB suite | **85 files, 1342 passed, 0 failed, 0 skipped** |
| Suite without DB | 66 files passed, 19 skipped; 1084 passed, 258 skipped |
| `next build`, clean copy, no `.env*` | passed |
| `opennextjs-cloudflare build` | passed |
| `wrangler deploy --dry-run` app / tracker / cron | passed; app 36,079 KiB raw, 7,417 KiB gzip |
| `pnpm audit --prod` | no known vulnerabilities |
| `pnpm audit` (all) | 2: `esbuild` 0.18 (moderate), `zod` 3 (high), both dev tooling |
| `pnpm deploy:preflight staging` | **BLOCKED**, 7 findings (no `.env.staging`; Cloudflare login cannot see the target account); nothing deployed |
| Hotfix patch alone on `main` (9 files) | typecheck clean, 38 targeted tests pass |
| GitHub Actions | **NOT RUN** |

## Re-verification (pass 1/2 fixes)

Trusted IP, subscriptions and media: see items 17-19. **Video worker:** one job at a time per process (`batchSize: 1`); each ffmpeg call is killed at 10 minutes; videos over 15 minutes are refused without retry; temp directories are removed in `finally`. A pathological file that times out is retried up to 3 times with backoff (about 4 attempts of bounded work), then stays failed. **Jarvis:** the lockout now runs before the passphrase comparison and is per Worker isolate, so a distributed guesser is slowed, not stopped. Cloudflare Access (or a Rate Limiting rule) in front of it is still required for real protection, and needs a dashboard change.

**Dependency compatibility on Cloudflare:** build, bundle and dry-run pass on `next` 16.4.3 / OpenNext 1.20.13 / wrangler 4.152.0. Behaviour of a deployed Worker is NOT RUN.

## New findings this pass

1. `applySubscription` could regress `paidThrough` under concurrent events (fixed, item 18).
2. `SUPER_ADMIN_EMAILS` was never uploaded by `upload-secrets.sh` (fixed, item 16).
3. `pnpm test:e2e` could never be green (cab specs under the wrong config) (fixed, item 22).
4. Owner-provisioned staff accounts are owner-controlled by design (the owner sets and resets their password). A person who later signs in with a verified matching email or phone is linked to that account, so an owner can pre-register someone's address and hold that identity's credentials. Not a cross-business data exposure, but it can block that person from creating their own business (one membership per person). **P2, open**; the fix is an invitation/acceptance flow or clearing the owner password when the real person first signs in.
5. The e2e logs show the cab map loading Google Maps with a browser API key from local configuration (it was refused: referer not allowed). Browser keys are public by design; confirm it is HTTP-referrer restricted.

## Commit and PR organization (commands for the owner; nothing was run)

Review first: `git status`, `git diff --stat`. Then, from this branch:

```
git switch arch/hardening-pass
# 1. P0 hotfix (ship first, on its own PR from main)
git add lib/auth/index.ts lib/auth/firebase.ts lib/super/guard.ts lib/super/emails.ts lib/super/data.ts lib/tenant/team.ts \
        "app/(admin)/(shell)/settings/team/actions.ts" tests/super-admin-guard.test.ts tests/team-security.integration.test.ts
git commit -m "fix(security): require a Firebase-verified email for super admin; stop owners provisioning team identities"
# 2. dependencies
git add package.json pnpm-lock.yaml pnpm-workspace.yaml && git commit -m "chore(deps): next 16.4.3, OpenNext 1.20.13, wrangler 4.152, zod 4.6.7; patched overrides; shadcn to devDependencies"
# 3. request hardening
git add lib/core/guards.ts tests/guards.test.ts app/api lib/media next.config.ts lib/core/metrics.ts lib/core/usage.ts lib/rc "app/(admin)/(shell)/cars/actions.ts" tests/security-hardening.test.ts tests/usage.test.ts
git commit -m "fix(security): trusted client IP, verified photo bytes, bounded bodies, security headers, usage metering"
# 4. billing
git add lib/billing lib/tenant/billing.ts tests/subscription-events.integration.test.ts && git commit -m "fix(billing): terminal subscription states; atomic paid-through advance"
# 5. workers
git add workers tests/cars.integration.test.ts && git commit -m "fix(workers): Jarvis passphrase lockout; video duration cap and ffmpeg timeout"
# 6. CI, scripts, e2e, tests, docs
git add .github scripts .env.example e2e playwright.config.ts tests/architecture-boundaries.test.ts docs
git commit -m "ci: add workflow with pinned actions; repair e2e; architecture docs"
```

Check that nothing was left behind with `git status`. To ship the hotfix alone: `git switch -c hotfix/super-admin-verified-email main && git cherry-pick <hotfix commit>`, then `git push -u origin hotfix/super-admin-verified-email` and `gh pr create --base main`. Do not push until you have reviewed the diff. Add the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` to the commits if you want attribution.

---

# Pass 4 (controlled release preparation)

No commit, push, deploy, migration or live credential. Details and verdicts: `RELEASE_REPORT.md`.

| # | Change | Files | Status |
|---|---|---|---|
| 24 | Identity-claim logic made pure and testable; real-token chain tests; `signInSuperAdmin` enforces the uid list; `resetTeammatePassword` refuses people with their own sign-in | `lib/auth/session-claims.ts`, `lib/auth/index.ts`, `lib/super/actions.ts`, `app/(admin)/(shell)/settings/team/actions.ts`, `tests/super-admin-claims.test.ts`, `tests/super-sign-in-action.test.ts` | IMPLEMENTED, TESTED |
| 25 | Hotfix isolated as 15 files and verified on clean `main` | see `SECURITY_HOTFIX_PLAN.md` | TESTED locally; real Firebase/Cloudflare NOT RUN |
| 26 | CI: no persisted checkout credentials; `main` runs are never auto-cancelled; properties enforced by a test | `.github/workflows/ci.yml`, `tests/ci-workflow.test.ts` | IMPLEMENTED, TESTED; GitHub NOT RUN |
| 27 | Deploy guard notes on `SUPER_ADMIN_EMAILS`/`UIDS` | `lib/deploy/guard.ts`, `tests/deploy-guard.test.ts` | IMPLEMENTED, TESTED |
| 28 | Credential-free smoke checks for a deployed environment | `scripts/staging-smoke.sh` | IMPLEMENTED; run locally against `next dev` (all pass); deployed NOT RUN |
| 29 | Docs: staging checklist and matrix, operational security, Git delivery plan, release report | `docs/staging/staging-release-checklist.md`, `docs/release/*`, `docs/architecture/RELEASE_REPORT.md` | — |

Final local gates: typecheck PASSED; lint 0 errors; disposable-DB suite 88 files / 1369 passed; clean frozen install, `next build`, OpenNext build and three Wrangler dry-runs PASSED; `pnpm audit --prod` clean; Playwright 15/15.

---

# Pass 5 (identity ownership, tenant enforcement, audit trail, cost protection, reliability, security controls)

No commit, push, deploy, shared-environment migration or live credential. Migrations 0033-0036 were applied only to local disposable databases. Details: `SECURITY_AND_TENANCY.md`, `COST_GUARDRAILS.md`, `RELIABILITY_AND_RECOVERY.md`, `MIGRATION_AND_COMPATIBILITY.md`, `ARCHITECTURE_DECISIONS.md`.

## Batches

| Batch | What | Key files | Tests (all executed, passing) |
|---|---|---|---|
| 0 | Baseline reconciled with the checkout (HEAD `13fef4f` == main; 1369/1369 before changes). Frozen the pass-4 hotfix as a patch (sha256 `6325eca4…`); still applies to `main` | `docs/release/hotfix/*` | — |
| 1 | **Staff identity ownership.** Invitation lifecycle (hashed token, 7-day expiry, single use, revocable, staff-only by DB CHECK, atomic acceptance, verified email or OTP-phone match, generic failures); owner-created accounts and password set/reset removed; legacy password accounts transition when the real person verifies; `verifiedPhone` claim; invitation page and team UI | `lib/tenant/invites.ts`, `lib/auth/firebase-user.ts`, `lib/auth/session-claims.ts`, `app/(admin)/invite/[token]/*`, `app/(admin)/(shell)/settings/team/*`, `components/settings/team-actions.tsx`, migration 0033 | `team-invites.integration` 32 (valid, expired, revoked, replay, forged, wrong identity, 10-way concurrency, existing account, cross-business, takeover, squatting, escalation, enumeration; two mutations caught), `identity-ownership` 5 |
| 2 | **Tenant enforcement.** Access-mode ratchet (every raw-client file with its mode; every route and server action guarded or listed public with a reason); adversarial cross-product isolation; RLS decision recorded | `tests/tenant-access.test.ts`, `tests/tenant-adversarial.integration.test.ts` | `tenant-access` 11, `tenant-adversarial` 15; probes for an unguarded route and an unreviewed raw-client file both fail the build |
| 3 | **Security audit trail.** Append-only `security_audit_events` (DB triggers), fail-closed in-transaction recording for exports, exception resolution, invitations, removal, business creation, limit changes; best-effort for sign-in; correlation id; `/super/security` | `lib/core/security-audit.ts`, `lib/core/request-id.ts`, migration 0034, export/payments/security pages, `lib/tenant/team.ts`, `lib/tenant/create-dealer.ts` | `security-audit.integration` 19 (append-only, redaction, idempotency, fault-injection proving no record means no action, access restriction) |
| 4 | **Cost protection.** Idempotent ledger, atomic day/month counters, configurable limits (observe-first), abuse ceilings, overrides, exemptions, top-ups, failure fail-open, cost views and an audited limit form; meters at chat, OCR, RC, video AI, upload bytes, video seconds, Maps | `lib/core/usage.ts`, `lib/super/usage.ts`, `app/(super)/super/usage/*`, migration 0035 | `usage-metering.integration` 20 (40-way race, duplicates, UTC boundaries, isolation, soft/abuse/quota, overrides, recovery, metering failure; mutation caught by 5 tests) |
| 5 | **Reliability.** Daily subscription reconciliation job; scheduled-job status on `/super/platform`; cab booking operation key (unique index, 24 h expiry, client key per review visit) | `lib/core/jobs/reconcile-subscriptions.ts`, `lib/cabs/idempotency.ts`, `lib/cabs/public-actions.ts`, `components/cabs/book/booking-flow.tsx`, migration 0036 | `subscription-reconcile.integration` 8, `booking-idempotency.integration` 9, `cron-status.integration` 1 |
| 6 | **Security controls and tests.** CSP report-only + report endpoint; Jarvis Access-JWT verification and shared limiter (code; dashboard side is an owner action); new browser journeys (restaurant checkout, subscription UI, cab double-tap) | `lib/security/csp.ts`, `app/api/t/csp-report/route.ts`, `workers/jarvis/access.mjs`, `e2e/restaurant-order.spec.ts`, `e2e/subscription-ui.spec.ts`, `e2e/cabs-booking.spec.ts` | `csp` 8, `jarvis-access` 14; Playwright 18/18 |
| 7 | Final gates and delivery plan (rehearsed) | `docs/release/GIT_DELIVERY.md` | below |

## Compatibility-affecting decisions (summary)

Removed: `addTeammate`, `resetTeammatePassword` (replaced). Moved: `clientIp` to `lib/core/client-ip.ts` (still exported from `guards.ts`). Behaviour: `/super` exports can answer 503 if the audit write fails (by design); `requestBooking` gained an optional key (old clients behave as before); the daily cron runs one more job. Migrations are additive and compatible with the previous code. See `MIGRATION_AND_COMPATIBILITY.md`.

## Results (actual)

| Gate | Result |
|---|---|
| Disposable-DB suite | **98 files, 1523 passed**, 0 failed, 0 skipped (baseline at start of pass 5: 1369) |
| Suite without a DB | 73 files passed, 25 skipped; 1161 passed, 362 skipped (the live-database tests) |
| Typecheck / lint | clean / 0 errors, 29 warnings (unchanged) |
| Playwright, three configs, fresh DBs, Firebase Auth emulator | **18 of 18** (default 8, cab operator 2, cab login and booking 8), 0 failed/skipped/flaky |
| `next build`, OpenNext build (clean env-less copy) | passed |
| Wrangler dry-runs: app, tracker, cron, **Jarvis** | passed (app 7,210 KiB gzip; Jarvis 42 KiB) |
| `pnpm audit --prod` / full | no known vulnerabilities / 2 dev-tool advisories (unchanged) |
| `scripts/staging-smoke.sh` against a local `next dev` | passed, now including the CSP and report-endpoint checks |
| Delivery rehearsal (hotfix branch, 8 commits on top, fast-forward and squash merges) | passed |
| GitHub CI, staging, Razorpay test mode, Cloudflare Access, Google Cloud key restrictions | **NOT RUN / BLOCKED** (owner actions) |

## Not done, and why

Plan quotas and abuse ceilings (no baseline data, by design); external immutable audit copy and a restricted database role (recommended in ADR-4); durable alerting on usage metrics; attributing Durable Object requests per business; an expiry job for unconfirmed R2 uploads (needs an R2 lifecycle rule, configuration); CSP enforcement (needs reports from Razorpay and Firebase journeys on staging); Razorpay-backed browser journeys (need test keys on staging); removal of the legacy teammate password provider (a later contract step after migration completes).
