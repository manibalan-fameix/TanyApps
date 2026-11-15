# Operational security: what the owner must verify and do

None of this has been done. I accessed no production data, logs or configuration. Every step marked **[PROD, owner]** needs the owner's authorization and a production login. Steps with no mark are local or documentation work.

## 1. Was the historical super-admin weakness deployed?

Background: the Tany team area decided access from `users.email` from 2026-10-17 (commit `69b3a31`) until the fix. See `SECURITY_HOTFIX_PLAN.md`.

**[PROD, owner]** Establish exposure, in this order (stop as soon as the answer is "no"):

1. Was any build from commit `69b3a31` or later ever deployed to the production worker `tanyapps`? Cloudflare dashboard, Workers, `tanyapps`, Deployments, compare version dates with `git log --format='%h %ad %s' --date=iso main`. `docs/release/PRODUCTION-RELEASE.md` says nothing had been run against production, but it is not a deployment record.
2. Does production have a non-empty `SUPER_ADMIN_EMAILS`? `pnpm exec wrangler secret list` shows names only. If the secret does not exist, nobody (including an attacker) could pass the guard, so the weakness was dormant.
3. If both answers are yes, run the investigation queries in `SECURITY_HOTFIX_PLAN.md` (read-only SQL against a Neon read replica or a branch if available) and review Cloudflare request logs for `/super/*`.

Decision rule: "exposed" if a vulnerable build was live **and** `SUPER_ADMIN_EMAILS` was set. Otherwise record "not exposed" with the evidence (dates, secret names) in the ticket.

## 2. Suspicious super-admin actions and cross-tenant exports

What can be investigated, and what cannot:

| Action | Recorded where | Gap |
|---|---|---|
| Closing a payment exception | `payment_exceptions.resolved_by`, `resolved_at`, `resolution` | none |
| Viewing any `/super` page | Cloudflare request logs only | the app writes no audit row for reads |
| CSV export `/super/export/<kind>` (all tenants' data) | Cloudflare request logs only | **no audit row**; not attributable to a person except via the session cookie in edge logs |
| Team changes by owners (add/remove/reset) | `audit_log` (`team.add_staff`, `team.remove_staff`, `team.reset_password`) | none |

**Built in pass 5:** every `/super` export now writes a `security_audit_events` row (who, kind, row count; never content) *before* releasing the data, and refuses if it cannot; sign-ins, payment-exception resolutions and limit changes are recorded too. View: `/super/security`. Page views are deliberately not recorded. Exports made *before* this release exist only in edge logs.

**[PROD, owner]** Review: edge logs for `/super/export/*` with HTTP 200 since 2026-10-17, grouped by client IP and user agent; compare with the team's known IPs. A 200 from an unknown IP on an environment that had the vulnerable guard is an incident.

## 3. Session invalidation, if needed

- Effect of the fix alone: old sessions have no verified-identity claim, so every super admin signs in again; ordinary business sessions are unaffected.
- If exploitation is suspected: `wrangler secret put AUTH_SECRET` with a new random value signs out **everyone**: all business users, **and every customer's session on every business site** (customer cookies and login tickets are derived from the same secret, `lib/core/login/sign.ts`), and invalidates in-flight login tickets. Do it in a quiet window and tell the businesses. It does not remove owner-set teammate passwords: for rows found suspicious, delete the `dealer_users` and `users` row, or reset the password.
- Revoking one person without a global sign-out: remove them from `SUPER_ADMIN_EMAILS` (effective on the next request, the list is read per request) and from Firebase.

## 4. Jarvis: credential rotation and Cloudflare Access (Worker side now built)

**What the code now does** (`workers/jarvis/access.mjs`, tested with locally signed tokens): when both `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, every `/api/` call except Slack's events path must carry Cloudflare Access's signed JWT, checked against Cloudflare's published keys for your team domain (signature, issuer, audience, expiry, RS256 only). With only one of the two set the Worker answers 503 rather than silently turning the check off. When a `RATE_LIMITER` Durable Object binding exists, every attempt is counted in a limit shared by all isolates (60 per minute per IP) before the passphrase is compared; unbound or unreachable means the in-isolate limits alone apply. **None of this protects anything until the owner creates the Access application and sets the two values. The local tests prove the Worker's checks, not that Access is configured.**

**Exact configuration (owner, Cloudflare dashboard and CLI)**
1. Zero Trust, Access, Applications, Add, Self-hosted. Application domain: the Jarvis hostname (`tany-jarvis.<your-subdomain>.workers.dev`, or a custom domain you add). Policy 1: Allow, selector Emails, the team's addresses only. Policy 2: **Bypass** with a path rule for exactly `/api/slack/events` (Slack calls it; it is protected by Slack's signature and a 5-minute window).
2. Copy the application's **Audience (AUD) tag** and your team domain (`<team>.cloudflareaccess.com`).
3. `pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN -c workers/jarvis/wrangler.jsonc` and the same for `ACCESS_AUD`. Redeploy Jarvis (`pnpm deploy:jarvis`; it deploys only Jarvis).
4. Optional shared limit: add the `RATE_LIMITER` binding described in the comments of `workers/jarvis/wrangler.jsonc`, only after the tracker Worker is deployed in the same account.
5. If `workers_dev` stays true the raw `*.workers.dev` URL still exists; with step 3 done it answers 401 without the Access JWT.

**Verification (expected evidence)**: (a) in a private browser the Jarvis URL redirects to the Access login; (b) `curl -s -o /dev/null -w "%{http_code}" -X POST https://<jarvis>/api/warm -H "authorization: Bearer <passphrase>"` returns **401**, not 204; (c) after signing in through Access the page works and `/api/warm` returns 204; (d) a Slack test event still reaches `/api/slack/events`; (e) deleting `ACCESS_AUD` makes the Worker answer **503** (proves it cannot be switched off by accident).

### Credentials and rotation (unchanged, still owner actions)

Jarvis (`workers/jarvis`, worker `tany-jarvis`, a public `workers.dev` URL) is protected by one shared passphrase and, after this work, a per-isolate lockout. That slows guessing but does not stop a distributed attempt.

**[PROD, owner]**
1. Rotate: `openssl rand -base64 24`, then `pnpm exec wrangler secret put JARVIS_PASSPHRASE -c workers/jarvis/wrangler.jsonc`. Update whoever uses it. Treat the old passphrase as exposed.
2. Rotate `JARVIS_TOKEN` (GitHub, classic with `repo`): replace it with a **fine-grained read-only** token scoped to the project repo; keep `JARVIS_WRITE_TOKEN` separate and narrow. Consider rotating `GEMINI_API_KEY` and the Slack tokens if the passphrase may have been guessed.
3. Put it behind **Cloudflare Access** (Zero Trust, Access, Applications, self-hosted, the Jarvis hostname; policy: allow the team's emails only). Add a **Bypass** rule for the exact path `/api/slack/events` only, because Slack calls it directly and it is already protected by Slack's HMAC signature and a 5-minute timestamp window. Acceptance: an unauthenticated browser or `curl` to `/` and `/api/ask` is redirected to the Access login; a Slack test event still reaches `/api/slack/events`.
4. Optionally add a Cloudflare Rate Limiting rule for `/api/*`.

## 5. Google Maps browser key: referrer and API restrictions

The e2e logs show the browser key being refused for `localhost` (`RefererNotAllowedMapError`). That is a **positive sign** that an HTTP-referrer restriction exists, but it is not proof of the right restriction.

**[PROD, owner]** In Google Cloud console, APIs and Services, Credentials, for each key:
- Browser key (the one shipped to pages): Application restriction = HTTP referrers listing `https://app.tany.in/*`, `https://*.tany.in/*` and **each cab operator's verified custom domain** (a customer's own domain fails the map until it is listed; decide how that is handled operationally). API restriction = only Maps JavaScript API (and Places, if the browser calls it).
- Server key (`GOOGLE_MAPS_SERVER_KEY`, Workers have no fixed egress IP, so IP restriction is not available): API restriction = only Places API (New) and Routes API as actually used; set **per-day quotas** on those APIs and a **budget alert**.
- Staging gets its own keys.
Acceptance: a request with a foreign `Referer` using the browser key is refused; the server key cannot call an unlisted API; the daily quota stops runaway spend.

## 6. Staff invitations (built in pass 5; the design below is what was implemented)

Problem (P2): an owner can create or preload a staff account for any email or phone and set its password. If that person later signs in with a matching verified identity they are linked to that account, so the owner knew its credentials and the person cannot create their own business (one membership per person).

Proposed design: replace owner-set passwords with **invitations**.
1. `team_invites(id, dealer_id, email_hash/phone_hash, role='staff', token_hash, expires_at, created_by, accepted_by, accepted_at)`, additive migration.
2. Owner invites by email or phone; no password is created. The invitee signs in with their own Firebase identity (verified email or OTP-verified phone matching the invite) and accepts; only then a `dealer_users` row is created. Invites expire in 7 days and are single-use.
3. Remove `resetTeammatePassword` and the owner-password teammate login for new staff. Existing password staff keep working until their first Firebase sign-in, at which point `users.password_hash` is cleared.
4. Tests: an invite cannot be accepted by a different identity, twice, after expiry, or across businesses; an owner cannot read or set any credential; the existing "one business per person" rule is preserved or explicitly changed.
Status: **implemented** (migration 0033, `lib/tenant/invites.ts`, `/invite/<token>`, team page). A person may belong to several businesses (the existing chooser already supports it). Legacy staff keep their password until their first verified Firebase sign-in, which clears it (see `MIGRATION_AND_COMPATIBILITY.md`). Verification on staging: matrix rows 14 and 15 in `docs/staging/staging-release-checklist.md`.

## 7. Tenant isolation on deployed infrastructure

Automated locally (passing): `tenant-leak.test.ts`, `tenant-leak.integration.test.ts`, upload/prefix tests, `super-*` tests. On deployed infrastructure run `scripts/staging-smoke.sh` (anonymous checks) and rows 6 and 9 of the matrix in `docs/staging/staging-release-checklist.md` with two real owner accounts. Acceptance: no request from business A returns any data, media or document of business B, including by guessing ids, order codes, booking ids, storage keys and cab file keys.
