# Security hotfix plan: super-admin privilege escalation (P0)

**If the code from 2026-10-17 onward has ever been deployed to a production environment, that environment is exposed until this fix ships. Delaying the hotfix leaves the exposure open.** This repository cannot say whether that has happened: `docs/release/PRODUCTION-RELEASE.md` states nothing has been run against production, but no deployment record is in the repo. The owner must confirm.

## The vulnerability

- Introduced with the super console, commit `69b3a31` (2026-10-17). `requireSuperAdmin()` decided access from `session.user.email`, which is `users.email`.
- A business owner can write that column: `addTeammate` (owner-only) creates a user with an owner-chosen email and password, or takes over an existing user row that matches the supplied email or phone. The teammate then signs in with the password flow and the session carries that email.
- Result: any owner who knows or guesses a team address could read every tenant's data in `/super`, download CSV exports of all tenants, and resolve payment exceptions as that team member.

> **Pass 5 note.** The hotfix is shipped from the **frozen patch** `docs/release/hotfix/super-admin-identity-fix.patch` (sha256 starts `6325eca4`), not from the current files: pass 5 improved 7 of the 15 files afterwards (audit events, invitations, uid enforcement in sign-in, removal of owner passwords). The patch was re-checked in pass 5 and still applies cleanly to `main`. The full branch is built on top of the hotfix commit (`docs/release/GIT_DELIVERY.md`), so shipping the hotfix never depends on pass 5.

## Minimum patch (independent of everything else on `arch/hardening-pass`)

**15 files, +483/-31 lines, no migration.** Built on a clean `main` worktree with `main`'s own lockfile (`next` 16.3.4), and saved as a patch outside the repository (`git apply --check` passes on `main`).

| File | Change |
|---|---|
| `lib/auth/session-claims.ts` (new) | Pure helpers: which Firebase identities may sign in, the claims a sign-in carries (`verifiedEmail`, `verifiedUid`), writing them into the JWT at sign-in only, exposing them read-only on the session. |
| `lib/auth/index.ts` | NextAuth wiring uses the helpers. |
| `lib/auth/firebase.ts` | `verifiedEmailOf()`: the email only when `email_verified` is true. |
| `lib/super/emails.ts` (new) | Dependency-free `superAdminEmails()` and optional `superAdminUids()`. |
| `lib/super/guard.ts` | Uses only the verified email (and, when `SUPER_ADMIN_UIDS` is set, the uid). |
| `lib/super/actions.ts` | The sign-in action also enforces the uid list before any session starts. |
| `lib/super/data.ts` | `loadOverview()` calls the guard itself. |
| `app/(admin)/(shell)/settings/team/actions.ts` | Reserved team addresses refused; no password set or reset on a person who signs in with their own account. |
| `lib/tenant/team.ts` | `hasOwnSignIn()`. |
| `scripts/upload-secrets.sh`, `.env.example` | `SUPER_ADMIN_EMAILS` and `SUPER_ADMIN_UIDS` are uploaded and documented. |
| 4 test files | `super-admin-claims` (11, real signed Firebase tokens through verification, claims, JWT, session and guard), `super-admin-guard` (16), `super-sign-in-action` (3), `team-security.integration` (1). |

Not part of the hotfix: dependency upgrades, `package.json`/lockfile, CI, headers, uploads, billing, workers, e2e. Do not bundle them.

### Evidence that it is ready (all local)

| Check | Result |
|---|---|
| Patch applies cleanly to `main` | PASSED |
| `tsc --noEmit` on `main` + patch, with `main`'s own dependencies | PASSED |
| Whole `main` suite plus the patch, disposable database | PASSED: 83 files, 1322 tests |
| `eslint` | PASSED: 0 errors (15 existing warnings) |
| `next build` with no `.env` file | PASSED |
| Token validation: wrong audience, wrong key, expired, garbage, unverified password account | PASSED (tests) |
| Unverified email, phone sign-in, profile-row email, password session, forged session object, pre-claim session | all refused (tests) |
| Real browser sign-in with real Firebase accounts, deployed environment | **NOT RUN / BLOCKED** (needs staging) |

**Is it ready for an emergency release?** The code is ready to ship: it is small, additive, has no migration, and passes everything that can be run without a deployed environment. It has **not** been exercised against a real Firebase project or on Cloudflare, so ship it to staging first (about an hour of work once staging exists) unless production is demonstrably exposed. If exposure is confirmed and staging does not exist, the owner can accept the code-level evidence above and deploy with `SUPER_ADMIN_EMAILS` set, then verify with a real team sign-in immediately. That is a risk decision for the owner, not something this report can make.

### Disclosure: the repository is public

`manibalan-fameix/TanyApps` is **public**, and the weak guard has been readable on `main` since 2026-10-17. Therefore:

- Do **not** open an ordinary public PR for the hotfix before production is secured. A diff of the guard explains the issue.
- Preferred route: a GitHub **draft security advisory** with a **temporary private fork** (Repository, Security, Advisories, New draft advisory, Start a temporary private fork). Push the hotfix branch to that private fork, review and merge there, deploy, then publish the advisory.
- If that route is not available, deploy from a **local** hotfix branch with the guarded deploy script (it deploys what is checked out) and publish the code afterwards.
- Do not push the architecture documents in `docs/architecture/` or `docs/release/` (they describe the issue in detail) until after production is secured. The Git plan keeps them in a separate, held-back commit.
- The PR/commit text for the hotfix is deliberately neutral ("derive super-admin access from the Firebase-verified identity"); keep it that way until the advisory is published.

## Behaviour change on release

All existing sessions lack the new claims, so **every super admin is signed out of `/super` once and must sign in again with Google** (the `/super/login` flow already exists). Business users are unaffected. Teammates who were created by an owner keep working for their own business.

## Required tests (all in the patch)

`tests/super-admin-guard.test.ts` (16): team email via a password/teammate session is refused; a session predating the claim is refused; a verified non-team address gets 404; a team `users.email` with a different verified address is refused; uid allow-list on, off, wrong uid, missing uid, uid listed but email not; `currentSuperAdmin()` never reports a spoofed session; every exported function in `lib/super/data.ts` and `queries.ts` calls the guard first; every `app/(super)` action and route calls it; no `/super` page imports the database; the auth callbacks never merge client-supplied session data into the token. `tests/team-security.integration.test.ts`: an owner cannot get a password set on a self-registered account.

## Staging validation (evidence to record)

1. Deploy to **staging only** after `pnpm deploy:preflight staging` passes (it currently blocks: no `.env.staging`, Cloudflare login cannot see the account).
2. Sign in to `app.<staging>/super/login` with a team Google account: dashboard loads.
3. As a business owner, add a teammate whose email is a team address: request refused. Create a teammate with any other email and sign in with that password: `/super` answers 404.
4. A signed-in business owner opening `/super`: 404. Signed out: redirect to `/super/login`.
5. With `SUPER_ADMIN_UIDS` set to a different uid, the same team account gets 404; unset it, access returns.
6. `curl` the CSV export `/super/export/businesses` with a business-owner cookie: 404; without a cookie: redirect.

## Production prerequisites

Owner authorization; the staging evidence above; the hotfix deployed on its own; `AUTH_SECRET` untouched (see below); a recorded rollback point (previous deployment version in Cloudflare).

## Rollback or forward recovery

Preferred: forward. If the hotfix itself misbehaves for super admins (cannot sign in), set `SUPER_ADMIN_EMAILS` correctly and sign in again; do not roll back to the vulnerable guard. A Cloudflare version rollback restores the vulnerability: do it only to restore availability, and keep `/super` disabled in the meantime (remove the `SUPER_ADMIN_EMAILS` secret: the guard then admits nobody). The patch has no migration, so nothing in the database needs reversing.

## Investigation (needs owner authorization; I accessed no production data)

Read-only queries to run against **production** by the owner:

1. Teammates whose email is a team address: `select u.id, u.email, u.phone, u.password_hash is not null as has_password, du.dealer_id, du.role from users u join dealer_users du on du.user_id = u.id where lower(u.email) = any(string_to_array(lower('<SUPER_ADMIN_EMAILS>'), ','));` Every row whose `u.id` is not a genuine team member is a likely exploit.
2. Every user with an owner-set password and no linked Firebase account (these are the rows an owner controls; `users` has no created-at column, so review all of them and compare with the real team lists): `select u.id, u.email, u.phone, du.dealer_id, du.role from users u left join accounts a on a.user_id = u.id left join dealer_users du on du.user_id = u.id where u.password_hash is not null and a.user_id is null;`
3. `audit_log` rows `where action in ('team.add_staff','team.reset_password') and at >= '2026-10-17'` (the `entity_id` is the affected user id); match `entity_id` against the users found in (1).
4. Payment exceptions resolved by a team email: `select * from payment_exceptions where status = 'resolved' and resolved_by <> 'system' order by resolved_at desc;` check each `resolved_by` against who was actually working.
5. Cloudflare Workers logs / Analytics for requests to `/super/*` and `/super/export/*` from sessions that are not team members (look for `/super/export` responses with status 200 from unusual IPs).

## Potentially affected actions

Read: every `/super` page (all businesses, users, cars, leads, orders, bookings, customers, reviews, menus, coupons, delivery partners, enquiries, analytics, revenue, activity, search), CSV exports of these. Write: `resolvePaymentException` only (the one `/super` server action), which closes payment exceptions and records the resolver's email. There is no other `/super` mutation.

## Sessions and credentials

- The fix invalidates *super-admin* use of old sessions automatically (no claim). No need to rotate `AUTH_SECRET` for this fix.
- If investigation finds exploitation, rotate `AUTH_SECRET`. This signs out **every business user and every customer on every business site** (customer cookies and login tickets derive from the same secret) and invalidates in-flight tickets; plan a quiet window and notify businesses. Then reset passwords on the suspicious teammate rows (or delete those `dealer_users`/`users` rows), and review the Google accounts on `SUPER_ADMIN_EMAILS`.
- Consider enabling `SUPER_ADMIN_UIDS` so a Firebase account re-created under a team address cannot pass.
- Rotate Razorpay and R2 secrets only if exports were taken (they contain business data, not secrets, but verify).
