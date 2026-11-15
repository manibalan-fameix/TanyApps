# Audit coverage: the six previously unaudited areas

How to read this: **Read** = source inspected. **Tested** = an automated test now exercises it. Nothing here was exercised against a deployed environment. "No finding" means none in what was read, not a proof of absence.

## 1. Admin server actions and role authorization

- **Read:** every `"use server"` export (about 130 functions across 20 files) classified by guard. All admin actions go through `getDealerContext`, `industrySession` or an owner-only wrapper (`owner()`, `ownerDealerId()`, `open({owner:true})`); the dealer id always comes from the session. Owner-only: team, settings, payouts, cab pricing, refunds. Staff may run day-to-day menu/cab/order operations.
- **Finding P1 (fixed):** `addTeammate` set the password of any *existing* user row matched by the supplied email or phone, including people who had registered themselves and not yet joined a business. The owner then knew that person's credential. Fix: a row with a linked sign-in (`hasOwnSignIn`) keeps its own credentials; only accounts the owner is provisioning get the owner-set password. Test: `tests/team-security.integration.test.ts` (helper, live DB). The action itself is covered by review, not an end-to-end test.
- **Finding P2 (open):** `addTeammate` still tells an owner whether an email/phone belongs to a person at another business ("already belongs to another dealership"). Rate-limited to 20 per 10 minutes per owner. A neutral message would remove the enumeration; it changes UX copy, so it was left for the owner.
- **Note (business rule, not changed):** staff may adjust a cab booking's fare (`adjustBookingFare`); only the owner edits rate cards.
- **Note:** `industriesFor(email)` / `canCreateVertical(industry, email)` gate which products an account may create by `users.email`. That is feature gating, not authorization, but it reads the same owner-writable column.

## 2. Super admin

- **Read:** `lib/super/guard.ts`, `lib/super/actions.ts`, layout, payments action, CSV export route. Every page, action and the export route call `requireSuperAdmin()`; non-team users get a 404.
- **Finding P0 (fixed): privilege escalation to super admin.** The guard trusted `session.user.email`, which comes from `users.email`. Any business owner could create (via `addTeammate`) or take over a user row whose email is a Tany team address, then sign in with the teammate password flow, or a phone number linked to that row, and pass the guard: read every tenant's data, export CSV, resolve payment exceptions. Needed only a known team email.
- **Fix:** the guard now accepts only the email Firebase verified in the sign-in token, carried in the JWT as `verifiedEmail` (`lib/auth/index.ts`). Teammate-password and phone sessions carry none. `addTeammate` also refuses team addresses. **Impact:** super admins must sign in again once (existing sessions have no claim). Tests: `tests/super-admin-guard.test.ts` (6; 4 fail on the old guard).
- **Residual:** the allow-list is the `SUPER_ADMIN_EMAILS` variable; a compromised Google account on that list is full access. No second factor is enforced by the app; enforce it in Google/Firebase.

## 3. TanyCabs

- **Read:** public actions (places, quotes, `requestBooking`, `cancelMyBooking`, profile/address/contacts), trip state machine (`moveTrip`, `adjustTrip`), admin booking actions, identity linking, cab limits.
- **Verified:** prices are computed server-side and the customer's `expectedTotalPaise` must match or the booking returns `fare_changed`; places are sealed tokens (a client cannot invent a coordinate or price); all trip transitions are compare-and-set on the current status; customer id comes from a business-bound session; per-customer, per-IP and per-business rate limits on quotes, places and booking (Google Places cost is capped at 2,000 requests/hour per business); customer address/contact deletes include the owning customer id.
- **No P0/P1 found.** Not applicable in this build: cab payments (no Razorpay code in `lib/cabs`) and cab live tracking (no WebSocket). **Open P2:** a double-tap on "request" creates two requests (no dedupe by customer/time/route); the operator accepts one and rejects the other, nothing is double-booked because vehicles are not assigned at request time.

## 4. Firebase customer authentication

- **Read:** `app/api/id/{ticket,social}`, `lib/core/login/*`, `lib/cabs/identity.ts`, dealer sign-in (`lib/auth/index.ts`, `firebase-user.ts`, `firebase.ts`).
- **Verified:** customer login is central (app host) then a one-minute ticket bound to one tenant host and the state value; session cookie is `__Host-` prefixed, host-only, names the business and a `session_version`; customers are per business (same phone, separate rows); +91 numbers only; fail-closed rate limits per IP and per phone; origin check on the ticket route; link tokens bound to business, host and state; Firebase ID token verified (issuer, audience, signature, expiry; tested). Email+password Firebase accounts must be email-verified to get a session.
- **Finding:** the super-admin issue above lived in the dealer sign-in path (`users.email` treated as identity). No customer-side finding.

## 5. Jarvis worker

- **Read:** `workers/jarvis/index.mjs` plus Slack signature check. Separate internal Worker on a public `workers.dev` URL, protected by one shared passphrase (constant-time compare). Slack events require a valid HMAC and a ±5 min timestamp.
- **Finding P1 (fixed):** the passphrase was compared *before* any rate limit, so wrong guesses were unthrottled. Now 10 wrong attempts per minute per client IP locks that caller out (including for the correct passphrase) before comparison. Test in `tests/security-hardening.test.ts`. The counter is per isolate, so it slows guessing rather than stopping a distributed attacker.
- **Cost:** every authenticated request can call Gemini; bounded by the passphrase, 40 requests/minute/IP/isolate, a 3 MB audio cap, 20 Slack messages and a daily task-creation cap. **Open:** use a long random passphrase, and put the Worker behind Cloudflare Access or a Rate Limiting rule (needs dashboard/config change; not done). `JARVIS_TOKEN` is documented as a classic GitHub token with `repo`; a fine-grained read-only token would limit blast radius.
- **Data exposure:** the board (task titles, bodies) is returned to passphrase holders only; logs truncate errors; the CSP and `no-store` headers are set.

## 6. Video worker and video intake

- **Read:** `workers/video.ts`, `lib/jobs/boss.ts`, `lib/cars/media.ts`, `lib/video/ffmpeg.ts`, `app/api/cars/from-video/route.ts`.
- **Verified:** storage keys are built server-side under `dealers/<id>/cars/<carId>/`, a job carries `dealerId` and runs through `scopedDb`, so a forged job for another business finds nothing (already tested); ffmpeg is run with argument arrays, never a shell; per-car media cap; size checked after upload and oversize objects deleted; jobs are de-duplicated by media id; failed jobs mark the media `failed` and rethrow for bounded retry.
- **Finding P1 (fixed):** no duration limit and no process timeout. A 400 MB file of arbitrary length could occupy the worker host (CPU) for hours, three times. Now: videos over 15 minutes are marked failed without retry (`video_rejected` metric), and each ffmpeg/ffprobe call is killed after 10 minutes. **Behaviour change:** walkarounds longer than 15 minutes are refused. Test: `tests/cars.integration.test.ts`.
- **Finding P2 (fixed):** `/api/cars/from-video` parsed the whole multipart body before checking part sizes. The body is now capped (about 15 MB) while reading. Tests in `tests/security-hardening.test.ts`. Cost control there (15 requests/hour/business, 16 frames, 8 MB audio) was already present; at the cap one business can make 360 LLM-with-audio calls a day.
- **Open:** presigned video PUTs cannot enforce a byte limit at upload time; oversize objects are removed at confirmation. A bucket lifecycle rule for `pending` objects that are never confirmed is recommended (configuration change; not done). Video type is not sniffed; ffprobe rejects non-video and the job fails.
