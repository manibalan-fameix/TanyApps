# Phase 2, Step 1: central customer login (spike)

Phone → Firebase phone OTP (on the app host) → signed one-minute ticket → redirect to a tenant subdomain **or** verified custom domain → host-only session cookie. Stopped here for your OK before Step 2.

## What works (tested)

`e2e/cabs-login.spec.ts` (4 tests, real Chromium, real dev server, **Firebase Auth emulator**, no real SMS): login ends in a session on `sri-murugan.localhost` and on a simulated custom domain (`cabs.example.test`, a verified `dealer_domains` row on a Pro business); the session is invisible to the other business; a ticket works once (replay with the state cookie restored → `used`), only on its own host, only in the browser that started the login; the login page 404s for any host that is not a live cab business; logout from another site does nothing. Plus 12 unit tests (`tests/cabs/login.test.ts`). Gate: typecheck, lint 0 errors, 851 tests pass.

## Your five questions

**1. Does reCAPTCHA work?** *Not proven by me.* The emulator skips reCAPTCHA, so no test here exercised it. What I can say: the form uses the same invisible `RecaptchaVerifier` as the dealer login on `app.tany.in`, which an earlier audit note says was verified live once. The page lives on the app host, so **only `app.tany.in` needs to be an authorised Firebase domain**; tenant subdomains and customers' custom domains never run reCAPTCHA (the main benefit of a central login). To close this: one real SMS to your own number on staging. Prerequisites: Blaze plan, Phone enabled, India allowed under SMS regions (new projects allow none).

**2. Cookie and CSRF design.**
- Cookie `__Host-tany_cs` in production (`tany_cs` in dev): HttpOnly, Secure, SameSite=Lax, Path=/, **no Domain** (host-only, so the browser never sends it to another business), 30 days. HMAC-SHA256 token, key derived from `AUTH_SECRET` with a per-kind label, so a ticket can never pass as a session. It names the business (`did`) and is checked against the host's business.
- Login CSRF: the tenant sets a random `state` cookie (10 min) before leaving; the same value rides inside the signed ticket and must match at the callback. A planted link fails in any other browser (`wrong_state`, tested).
- Open redirect: the login page only accepts hosts that resolve to a live cab business; `next` is a same-site path only (`//`, schemes, backslashes rejected; tested).
- State-changing calls (`/api/id/ticket`, logout) require `Origin` equal to the Host.
- Session reads are GET-only and idempotent. Step 2 booking mutations will also check Origin.

**3. Token lifetime.** Ticket 60 s, single use (shared limiter key on its id for 120 s, fail closed), addressed to one host. Session 30 days (renewal in the last 7 days is written but **not wired yet**). Firebase's own ID token is thrown away right after the exchange.

**4. Rate limits.** Ticket endpoint: 30 / 10 min per IP and 10 / 10 min per phone, both `failClosed`. Ticket redemption: once. Firebase itself (docs): 150 verification requests per IP per hour; 3,000 SMS/day per project on plain Firebase Auth (Identity Platform removes the daily cap); 10 fictional test numbers. Firebase's per-number limit is not documented. Not yet limited by us: SMS *sends* (they happen in the browser, directly to Firebase), so Firebase's limits and reCAPTCHA are the only brake on SMS cost.

**5. Cost per OTP.** **Not verified.** I could not read Google's official India price. Third-party pages say roughly US$0.01 (about ₹0.8–1) per SMS, and a snippet said the first ten SMS a day are free. Treat as an estimate; confirm in the Firebase pricing page / console before launch. Blaze (pay as you go) is required.

## If Firebase proves unworkable: SMS adapter (MSG91 + DLT)

I would put `SmsOtpProvider` behind the same ticket flow (we generate and hash the code, 5-minute expiry, 5 tries, per-phone and per-IP limits, all in our own limiter) and only swap who sends the SMS. You would register, in India:
1. A **DLT entity** (principal entity) on an operator portal (Jio, Airtel, Vi or BSNL): business PAN/GST/incorporation papers, authorised-signatory letter.
2. A **header** (6-letter sender ID, e.g. `TANYCB`).
3. An **OTP content template** with a variable (`{#var#}`), approved; note its template ID.
4. An **MSG91 account with KYC**, entity ID and template ID linked, auth key supplied as a secret.
Approvals typically take days. Per-SMS price is MSG91's, not verified here. It adds a build (about a day) and puts abuse protection on us instead of Google.

## Gaps and known risks

- The ticket travels in a URL once (60 s, single use, host-bound). It can appear in access logs; the bounds above make a leaked one nearly useless.
- No customers table yet: the session's customer id is a hash of (business, phone). Step 2 replaces it with a real customer row and `session_version` for sign-out everywhere.
- Tamil copy on the login form needs a Tamil speaker's review.
- Emulator tokens are accepted only when `FIREBASE_AUTH_EMULATOR_HOST` is set **and** `NODE_ENV` is not production.
- Not tested against real Firebase, real custom domains (DNS/TLS) or the Worker runtime.

## Decisions I need before Step 2

1. **Go / no-go** on Firebase for customers (or switch to MSG91).
2. **Unaccepted bookings:** how many minutes before a `requested` booking that the operator has not accepted is expired (X)?
3. **Yearly price:** you wrote "10× monthly, as other verticals", but cars and restaurants use **11×**. I set cabs to 10×. Keep 10×, or match 11×? (One number.)
4. **Tamil review:** the tolls notice and the login strings are my translation.
5. **Cleaning build folders:** with `rm -rf` banned, `.next-e2e-login` and `.next-e2e-cabs` stay (gitignored). Tell me if you want a different approach.
