# Migration and compatibility plan (pass 5)

## Database migrations (all additive; none edits an applied migration)

| # | File | Adds | Existing data | Preflight |
|---|---|---|---|---|
| 0033 | `0033_team_invites.sql` | table `team_invites` (+ CHECKs staff-only and has-contact, partial unique indexes) | none touched | table must not exist |
| 0034 | `0034_security_audit_events.sql` | table `security_audit_events` + append-only triggers | none touched | table must not exist |
| 0035 | `0035_usage_accounting.sql` | `usage_events`, `usage_counters`, `usage_limits` | none touched | tables must not exist |
| 0036 | `0036_trips_idempotency_key.sql` | nullable column `trips.idempotency_key` + partial unique index (rows with a key only) | every existing trip keeps `NULL`; the index covers no existing row, so it cannot fail on data | none needed; creating the index on a large `trips` table takes a short lock: run it in a quiet minute |

`tests/migrations.test.ts` enforces that migrations 0030 onward contain no DROP, RENAME, TRUNCATE, data-changing statement or non-defaulted NOT NULL column (protective trigger and function creation is exempt, by rule). All four were applied from scratch on a fresh database and onto the incrementally migrated test database, and the full suite passes on both.

**Order of release.** (1) migrate, (2) deploy the app, (3) deploy the cron Worker (it carries the new daily schedule mapping), (4) Jarvis separately. The new code needs the new tables; the previous code is unaffected by them, so a code rollback after migrating is safe (tables and column simply go unused). Do **not** deploy the app before migrating: invitations, audit writes and metering would fail (metering fails open; audit-guarded actions fail closed, by design).

**Rollback / forward recovery.** A Git revert does not drop tables. They are harmless when unused. If a table must be removed later, do it in a later, reviewed migration after the code that writes it is gone (expand, then contract). `security_audit_events` and `usage_*` hold history: never drop them to "undo" a release.

## Behavioural compatibility

| Area | Before | After | Impact |
|---|---|---|---|
| Add staff | owner types name, email, phone, password | owner enters an email or number and sends a link; person accepts | UI and server action replaced; `addTeammate` and `resetTeammatePassword` no longer exist |
| Existing password staff | owner-set password | unchanged until the person signs in with a verified identity, then the password is cleared and the identity linked | no lockout, no bulk reset; marked "Password sign-in" in the team list |
| Staff removal | action in the page | `removeStaff()` in one transaction with its audit rows | same result for users |
| Super admin | verified email (+ optional uid) | same, plus audited exports and sign-ins | exports can answer 503 if the audit write fails |
| Chat / OCR / RC / Maps | counted in logs only | counted durably; observe-only | no behaviour change until an operator sets an abuse ceiling |
| Cab booking request | each submit creates a trip | repeats of the same submission return the same trip | an old client without a key behaves exactly as before |
| Daily cron | `daily` placeholder | also `reconcile-subscriptions` | needs the cron Worker redeployed; app registry already has it |
| Headers | five baseline headers | plus CSP report-only | no blocking |
| `clientIp` | in `guards.ts` | in `client-ip.ts`, re-exported from `guards.ts` | imports keep working |
| Jarvis | passphrase (+ lockout) | plus optional Access JWT and shared limiter when configured | no change until `ACCESS_*` / `RATE_LIMITER` are set |

## Environment variables introduced across passes 4-5 (names only)

`SUPER_ADMIN_UIDS` (optional), `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (optional, Jarvis), and the optional `RATE_LIMITER` binding for Jarvis. Nothing new is required for the app to start.

## Legacy staff transition, step by step

1. Deploy: nothing changes for existing staff.
2. Each time a person signs in with a verified email or OTP phone that matches their account, the account is linked to that identity and the owner-set password is removed (metric `legacy_staff_identity_verified`).
3. Owners see who remains on password sign-in on the team page and can invite them properly; removing and re-inviting is also safe.
4. When no account has a password hash, the teammate password sign-in provider and `password_hash` can be removed in a later contract migration (not in this release).
