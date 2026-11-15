# Security and tenancy

## Tenant resolution (verified)

| Surface | Tenant comes from | Spoofable by client? |
|---|---|---|
| Public storefront, `/api/t/*`, tenant server actions | `x-tenant-slug`, set by `proxy.ts` from the Host; any client-sent value is deleted first | No |
| Custom domain | `dealer_domains` row with `verified_at` set and a plan that allows it (60 s cache) | No (unverified mapping → 404) |
| Admin (`app.<root>`) | the signed-in user's `dealer_users` membership (`getDealerContext`), never a request field | No |
| Webhooks | provider order/subscription id looked up in our tables; the signed payload's `notes.dealer_id` is trusted only after HMAC verification | No |
| Rider/guest tracking | rider: private token (hashed lookup, scoped to the dealer); guest: 6-char order code scoped to the dealer from the host; WS ticket HMAC-signed with role and `dealerId:orderId` | No |

Customer identity: `customers` rows are per dealer (`scopedDb.customers`), so the same phone at two businesses is two unrelated records.

## Authorization

- Business roles: `owner`, `staff` (`dealer_users.role`). `canRefund` is owner-only and enforced in server actions (`lib/core/permissions.ts`), not just in the UI. Cab documents and uploads are additionally limited to `industry === "cabs"` / own prefix.
- Cross-product: `industrySession(industry)` / `requireIndustry` / `tenantFrom(headers, industry)` in `lib/core/guards.ts` reject a business of another product.
- Platform admin lives under `app/(super)`. **Pass 2:** the guard accepts only the email Firebase verified at sign-in (JWT claim `verifiedEmail`), because `users.email` is writable by business owners. Teammate-password sessions and phone-linked sessions can never be super admin. Team addresses cannot be given to teammates. Existing super-admin sessions must sign in again.
- Row-Level Security: **not enabled, and deliberately not recommended yet.** The app connects as a single role through Neon (HTTP and WebSocket drivers, pooled), with no per-request `SET` of a tenant GUC; RLS would need that plumbing in every transaction and a separate privileged path for webhooks, cron and the super admin. The application-layer scope is complete, mechanically enforced and tested. Revisit RLS as defense-in-depth for a *read-only* reporting role first.

## Controls added in this pass

- One `clientIp()` (`lib/core/guards.ts`: `cf-connecting-ip` → `x-real-ip` → first `x-forwarded-for`). A test fails if any other file reads those headers.
- Photo uploads: type decided by magic bytes, must equal the declared type; body read with a hard cap even without `Content-Length` (`lib/media/read-body.ts`).
- Response headers on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera/microphone/geolocation=(self)`, `Strict-Transport-Security: max-age=15552000` (no `includeSubDomains`/`preload` until every subdomain is confirmed HTTPS). **No CSP yet**: the app loads Razorpay checkout, Firebase auth, Google/OSM maps and inline Next scripts; ship `Content-Security-Policy-Report-Only` first, collect reports on staging, then enforce.
- Subscription status can no longer move out of a terminal Razorpay state.

## Media

Public photos: `dealers/<id>/…`, writable only under the caller's own prefix, `..` rejected, listed publicly by design on storefronts. Private paperwork: separate bucket, strict key shape, owner-only reads with `no-store`. One business cannot overwrite another's objects because every write path checks the dealer prefix (tested in `tests/security-hardening.test.ts`, including traversal). Video presigned URLs are prefix-scoped.

## Pass 2 additions

- `addTeammate` no longer overwrites the credentials of a person who signed in themselves.
- Jarvis locks a caller out after 10 wrong passphrases per minute (per isolate).
- Video worker refuses videos over 15 minutes and kills ffmpeg after 10 minutes; `from-video` bounds its multipart body.
- Dependencies: 41 → 2 advisories (`DEPENDENCY_ADVISORIES.md`).
- HSTS: `max-age=15552000` without `includeSubDomains`/`preload`. Browsers ignore it over plain HTTP (local dev). It is sent on every host including custom domains, so a custom domain whose HTTPS later breaks will not fall back to HTTP for returning visitors; Cloudflare may also add its own HSTS header, which is harmless.
- Client IP: `cf-connecting-ip` is set by Cloudflare and replaced if a client sends it, so it cannot be forged on any Cloudflare-fronted host. The `x-real-ip`/`x-forwarded-for` fallbacks exist only for local development; if the app were ever reachable without Cloudflare in front, per-IP limits would be forgeable again.

## Pass 3 additions

- Client IP: a production build trusts only `cf-connecting-ip`; with no edge header it answers `"unknown"` (shared bucket) rather than reading `x-forwarded-for`. The earlier caveat (forgeable if not behind Cloudflare) no longer applies to production builds.
- Super admin: optional `SUPER_ADMIN_UIDS` second factor; the email and uid both come from the Firebase token verified at sign-in (signature, issuer, audience, expiry; `email_verified` must be true, otherwise no email is carried). The JWT claims can only be written at sign-in; the callbacks do not merge client-supplied session data. `SUPER_ADMIN_EMAILS` and `SUPER_ADMIN_UIDS` are uploaded by `scripts/upload-secrets.sh`.
- Known design limit: owner-provisioned staff accounts (owner-set password) are owner-controlled and can be linked to a person who later signs in with a matching verified email or phone. Not cross-business data exposure; can block that person from creating their own business. Open P2.
- Photo rejections carry `x-reject-reason` (`heic_unsupported`, `type_mismatch`, `unrecognised`).

## Pass 5: identity and membership

**Who owns what.** A *person* is a `users` row with a Firebase identity (`accounts`). A *membership* is a `dealer_users` row (business, person, role). An *invitation* is a `team_invites` row. They are separate: an owner controls memberships and invitations of their own business and nothing about a person.

```
owner --creates--> team_invites (business, staff, token HASH, contact HASH, expires 7d)      owner never sees or sets a credential
invitee --signs in with own Firebase identity--> session claims {verifiedEmail | verifiedPhone, verifiedUid}   proof comes from Firebase
invitee --presses Accept--> acceptInvite(): ONE conditional UPDATE claims the invitation, then INSERT dealer_users ON CONFLICT DO NOTHING
```

- Single use, expiring, revocable, replay-safe (a repeat by the same person is a no-op success only while the membership still exists; anyone else gets the same generic refusal). Concurrent acceptance creates one membership (tested with 10 parallel callers).
- Role is `staff` only (database CHECK `team_invites_staff_only`); acceptance never changes an existing role.
- Matching is by keyed hashes of the Firebase-verified email or OTP-verified phone; the invited contact is also stored encrypted for the owner's list. The secret token is shown once and only its sha256 is stored.
- No enumeration: creating an invitation never looks the person up, and every failure (unknown, malformed, expired, revoked, used, wrong person) returns the same answer.
- Removed: owner-created accounts and owner-set or owner-reset passwords. A structural test (`identity-ownership.test.ts`) forbids any code from setting a password hash or creating user rows outside Firebase sign-in.
- **Legacy staff** (accounts an owner created before this change): they keep signing in with the owner-set password until the person first signs in with a *verified* matching email or phone. At that moment their Firebase identity is linked to the account and the owner-set password is cleared (`adoptVerifiedIdentity`), so the owner can no longer sign in as them. No password is reset in bulk and nobody is locked out. The team page marks these accounts "Password sign-in" so an owner can see who has not migrated.
- One person may belong to several businesses (the chooser already supports it); a membership grants nothing outside its business.

**Super admin.** Verified Firebase email **and**, when `SUPER_ADMIN_UIDS` is set, a listed Firebase uid; both come only from the sign-in token. Existing sessions without the claims must sign in again. Every `/super` data function, action and route calls the guard (enforced by tests).

## Pass 5: tenant isolation enforcement

Four access modes, and what each may touch:

| Mode | Data access | Enforced by |
|---|---|---|
| Tenant (a business's owner or staff) | `scopedDb(dealerId)` only, business from the session | ESLint ban on the raw client outside `lib/`; `tenant-leak*.test.ts`; `tenant-adversarial.integration.test.ts` |
| Public (anonymous visitor or customer) | `scopedDb` for the business resolved from the host header | proxy strips client tenant headers; `tenant-access.test.ts` requires host-derived tenants in storefront actions |
| Platform (Tany team) | raw client, only in `lib/super/*`, every function behind the guard | `super-admin-guard.test.ts` structural checks |
| System (webhooks, cron, workers) | raw client only to find a tenant by a provider id or to sweep; then `scopedDb`/`scopedTransaction` | `tenant-access.test.ts` (every raw-client file listed with its mode; additions fail the build) |

`tests/tenant-access.test.ts` is the ratchet: the exact set of files allowed to import the raw database client (with the reason for each), a guard inventory for every route handler and every exported server action (with a short list of intentionally public ones, each with a reason), and checks that pages, components, hooks, the proxy and Workers never import the client.

### Decision record: PostgreSQL Row-Level Security (not adopted now)

*Context.* RLS would make the database itself refuse cross-tenant rows. The app reaches Neon through the HTTP driver (stateless, one statement per request) and the WebSocket driver (transactions), pooled, as a single role. RLS needs the tenant id set per connection or transaction (`SET LOCAL app.dealer_id`), and a separate privileged path for webhooks, cron, the super admin and migrations.
*Decision.* Do not enable RLS yet. Reasons: (1) with the HTTP driver there is no session to carry the setting, so every query would need to become a transaction, adding a round trip to each request on the hot path (a cost and latency regression); (2) every system and platform path would need a bypass role, widening, not narrowing, the surface that must be audited; (3) the application-layer controls are complete, mechanical and tested, and now ratcheted; (4) a half-applied RLS gives false confidence. *Revisit when:* the app moves to a single WebSocket pool with per-request transactions, or a read-only reporting role is introduced (the safest first use of RLS). *Equivalent controls implemented instead:* the access-mode ratchet, adversarial cross-product tests, owner-only role checks, structural guards, and an append-only audit trail.

## Pass 5: security audit trail

Two trails, deliberately: `audit_log` (per business, existing: fare edits, refunds, reassignments) and `security_audit_events` (platform-wide: who did a privileged or identity-sensitive thing).

| Event | Recorded | If the record cannot be written |
|---|---|---|
| Tany team export (`super.export`: kind, row count, business filter; never content) | before the data is released | **export refused (503)** |
| Payment exception resolved (`payment_exception.resolve`) | in the same transaction | exception stays open |
| Invitation created / revoked / accepted, staff removed, business created | in the same transaction as the change | the change does not happen |
| Usage limit changed (`usage.limit_changed`) | in the same transaction | not saved |
| Team sign-in success or refusal (`super.sign_in`) | best effort | sign-in unaffected |
| Refused acceptance of a real invitation | best effort | n/a |

Ordinary customer actions are not audited here and never depend on this table. Fields: id, time, actor type/id/label (a team member's verified email only), business, action, target type/id, outcome, request id (Cloudflare `cf-ray`), minimal redacted metadata (sensitive keys dropped, strings and size capped), optional dedupe key. **Integrity:** database triggers reject UPDATE, DELETE and TRUNCATE, and `business_id` has no foreign key so deleting a business cannot delete its trail. This is tamper *resistance*, not tamper-*proofing*: whoever owns the database can drop the triggers. Stronger protection needs a separate database role without those rights and a periodic copy outside the database (recommended below). **Retention:** keep at least 24 months (investigation window plus the usual dispute period); there is no deletion path in the application. **Reading:** only the Tany team, at `/super/security`, and read-only SQL in `docs/release/operational-security.md`.

## Pass 5: response headers

The CSP is now sent as **Report-Only** (`lib/security/csp.ts`), built from the origins found in the code: Razorpay, Firebase Auth and reCAPTCHA, Google Maps, OpenStreetMap, our R2 CDNs, the tracker socket, R2 uploads. Violations go to `/api/t/csp-report` (rate limited, size capped, logs only the directive and the blocked *origin*). Enforce only after the reports are quiet on staging and then production for the real journeys; the next step after that is nonces instead of `'unsafe-inline'`.

## Open items

- CSP (above). CSRF: server actions use Next's origin check; no custom CSRF tokens were added.
- Two dev-tooling advisories remain (`DEPENDENCY_ADVISORIES.md`); the CSP and Jarvis network-level protection (Cloudflare Access / Rate Limiting) need Cloudflare/dashboard changes and were not made.
- Local-only bypass paths (`dev-bypass`, `local-login`) rely on `NODE_ENV === "development"`. Workers builds set production; keep it that way.
- Audit-event coverage for every security-sensitive admin action was not enumerated.
