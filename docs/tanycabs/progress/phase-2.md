# Phase 2 report: customer booking

Branch `tanycabs/phase-2-booking`, stacked on `tanycabs/phase-1-fleet-pricing` (still **not merged to `main`**). Nothing is pushed or deployed. Step 1 (the phone login spike) is in [phase-2-otp-spike.md](phase-2-otp-spike.md); you approved Firebase for the pilot and your answers are built in. Decisions and assumptions are in [DECISIONS.md](../DECISIONS.md) ("Phase 2"). **Please read its "Assumptions I made" list.**

## Quality gate

| Gate | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | **0 errors**, 14 warnings (the same 14 as before; none in new code) |
| `pnpm test` (with live-DB tests on a scratch Postgres) | **1,048 passed, 1 failed** (the stale live-car-cap test, below) |
| `pnpm test` without a database | 911 passed, 138 live-DB tests skipped |
| `pnpm test:coverage` | **100%** statements, branches, functions and lines on `lib/cabs/fare.ts` and `lib/cabs/time.ts`, enforced per file |
| Browser, operator journey (`pnpm test:e2e:cabs`) | 2 passed |
| Browser, **customer books → operator accepts → customer sees confirmed**, plus reject/adjust/sign-out-everywhere, phone booking, and the login across a subdomain and a custom domain (7 tests, Firebase Auth **emulator**) | 7 passed |
| `pnpm build` | pass; all new routes present |

The one failing test in the full run is the stale "live-car cap" test from Phase 1, already fixed on `fix/motors-refund-route-reversal` (not merged yet).

## Do these before any real SMS (Firebase console, exact steps)

These follow Google's documentation; console labels move around a little, so go by the names. Do them in this order. Nothing here costs money until phone sign-in is switched on in step 2.

1. **Blaze plan.** Firebase console → your project → the gear next to *Project Overview* → *Usage and billing* → *Details & settings* → *Modify plan* → **Blaze (pay as you go)**, and attach a billing account. Phone sign-in does not work on the free Spark plan.
2. **Phone sign-in on.** *Build → Authentication → Sign-in method* → **Phone** → Enable → Save. (Optional while testing: add up to 10 fictional test numbers with fixed codes under *Phone numbers for testing*; they send no SMS and cost nothing.)
3. **SMS region policy = India only.** *Authentication → Settings → SMS region policy* → choose **Allow** → select **India (+91)** only → Save. New projects allow no region at all, so phone sign-in is refused until you do this. This also stops anyone burning money by requesting codes for far-away countries. (The app also refuses non-+91 numbers in the browser and on the server.)
4. **Authorised domain.** *Authentication → Settings → Authorized domains* → add **`app.tany.in`**. The customer login lives only on the app host, so business subdomains and customers' custom domains do **not** need to be listed. (`localhost` is not allowed for phone sign-in; use the emulator or test numbers locally.)
5. **App Check with reCAPTCHA Enterprise, enforced on Authentication.**
   1. Google Cloud console → the same project → *APIs & Services* → enable **reCAPTCHA Enterprise API**.
   2. *Security → reCAPTCHA Enterprise* → **Create key** → type *Website* → domain **`app.tany.in`** → score-based (no checkbox). Copy the **site key**.
   3. Firebase console → *Build → App Check* → *Apps* → select your web app → **reCAPTCHA Enterprise** → paste the site key → Save.
   4. Put the same site key in the app's settings as `FIREBASE_APPCHECK_SITE_KEY` (local `.env.local`, then `bash scripts/upload-secrets.sh`). The login page reads it at request time, so no rebuild is needed.
   5. Open the staging login once with a test number so App Check sees verified traffic. Then *App Check → APIs → Authentication* → **Enforce**. (If you enforce before the key is in the page, every login is refused; that is the failure to watch for.)
6. **Budget alert.** Google Cloud console → *Billing → Budgets & alerts* → **Create budget** → scope to this project → set a monthly amount you would be uncomfortable passing (suggest starting low, for example ₹2,000) → alert thresholds **50%, 90% and 100%** → add your email (and a second person's). A budget **warns; it does not stop spending**. For a hard stop you would need an automated action, which I have not built.
7. **Settings for the app:** `PHONE_OTP_PROVIDER=firebase` (the default) and `FIREBASE_APPCHECK_SITE_KEY`. The Firebase web keys you already use for the dealer login (`FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`) are shared.
8. **Check it once with your own number** on staging: send a code, enter it, land back on a business site signed in. In the console, *Authentication → Usage* should show one verification and *App Check → Metrics* should show verified requests.

**Not verified by me (needs the steps above):** real reCAPTCHA, real App Check enforcement, real SMS delivery and its price per message (about US$0.01 per SMS by third-party reports; confirm on Google's pricing page). The browser tests use the Auth emulator, which skips reCAPTCHA and App Check.

## What was built

| Area | What | Where |
|---|---|---|
| Central login (Step 1, hardened) | Phone → Firebase OTP → one-minute single-use ticket → host-only cookie. **+91 only** (client and server). **App Check** wired into the login page. Sender behind `PhoneOtpClient`/`PhoneOtpServer` (Firebase now; **MSG91 stub refuses everything** until built). Real `customers` rows replace the spike's hash ids. **Sliding 30-day session, renewed at most once a day.** **Sign out everywhere** (bumps `session_version`). | `lib/core/login/*`, `components/cabs/login/*`, `app/api/t/auth/*`, `app/api/id/ticket` |
| Schema (migration `0028`) | `customers`, `customer_addresses`, `customer_contacts`, `trips`, `trip_events`, enum `trip_status` (+ `trip_source`, `trip_actor_type`), `cab_settings.respond_window_minutes` / `unpaid_hold_minutes`. All in the table registry and the leak test. Phones, addresses, notes encrypted with blind indexes; checks on money, party size, code format. | `lib/db/schema/cabs.ts` |
| Status graph | `trip_status` transitions through `lib/core/status-graph`, checked on every move. | `lib/cabs/trip-status.ts` |
| Booking code and token | 6-character, look-alike-free display code (unique per business, not a secret); 128-bit share token, only the SHA-256 stored. | `lib/cabs/booking-code.ts` |
| Quote | One function prices a request for the website, the vehicle list and the operator's phone booking. The stored snapshot is immutable and holds distance and duration (never a shared cache). Places are **sealed** by the server so the browser cannot edit state, coordinates or place. | `lib/cabs/trip-quote.ts`, `place-token.ts` |
| Customer site (English + Tamil, mobile-first) | Home with trip-type tabs (Airport, Outstation, Round trip, Local, Tour packages), place search, airport/station quick picks, date and time with the lead time as `min`, return date, passengers and bags, vehicle classes with live fares, a breakdown sheet, **OTP login before any booking is created**, review, request. Booking page with a status timeline, auto-refresh, cancel, call-the-operator and book-again. History. Account: profile and language, saved addresses, SOS contacts, sign out (everywhere). Installable on a phone's home screen (a per-business manifest; no offline mode). | `components/cabs/book/*`, `app/(tenant)/sites/[dealer]/my/*`, `lib/cabs/public-actions.ts` |
| Operator | Booking inbox (New / Pending / Today / Upcoming / All, with counts), booking page with **accept / reject / adjust fare / cancel, each needing a reason where it matters and written to `audit_log`**, **manual phone/walk-in booking using the same fare engine**, customers list and detail with search by exact phone or name. Navigation updated. | `app/(admin)/(shell)/cabs/{bookings,customers}`, `lib/cabs/booking-admin-*.ts` |
| Booking allowance | The monthly count is now real (the Phase 1 pipeline reads it): banners at 80% and 100% and the super-admin events. Bookings are never refused. | `lib/cabs/usage.ts` |
| Holds (cron) | Every 5 minutes: nudge the operator at half the window; release an unanswered request at `min(30 min, pickup − 60)` (floor 10); release an accepted booking whose advance is unpaid after 20 minutes. Customer told through the outbox, a `trip_events` row written, safe to repeat. | `lib/core/jobs/expire-trip-holds.ts`, `lib/cabs/holds.ts` |
| Cleaning | `scripts/clean-e2e.sh` removes only `.next-e2e-login` and `.next-e2e-cabs` (fixed paths, refuses arguments and symlinks). | `scripts/clean-e2e.sh` |
| Pricing | Cab yearly is now 11 months for 12, as the other products. | `lib/verticals/cabs.ts` |

## Things the tests caught

- Operator booking by phone failed for a returning customer with an unverified number (an update with nothing to set). Found by the live test; fixed.
- Two of my own tests expected the wrong fare; the code was right.
- The booking browser test clicked "Send code" before the page had loaded.
- The operator test configuration matched the new specs too (it ran them against the wrong database); narrowed. Two older operator-journey steps typed into a page before it had loaded (a cold-compile race that the extra pages exposed); they now wait.

## Manual test steps

1. Gate: `pnpm typecheck && pnpm lint && pnpm test`.
2. Live-database tests: scratch Postgres, `pnpm db:migrate`, then `TEST_DATABASE_URL=… pnpm test`.
3. Browsers (no real SMS): start the emulator (`npx firebase-tools emulators:start --only auth --project demo-tany`), make a database, `pnpm db:migrate`, `psql -f e2e/cabs-seed.sql -f e2e/cabs-booking-seed.sql`, then `DATABASE_URL=… ENCRYPTION_KEY=… BLIND_INDEX_KEY=… pnpm exec playwright test -c playwright.cabs-login.config.ts`.
4. By hand with a real number, after the console steps: open a business site on its subdomain, book an airport trip, sign in with your phone, request. In the operator app, open *Bookings*, accept. Refresh the customer's booking page: **Confirmed**. Try *Reject* with no reason (refused), *Adjust fare*, then wait 15 minutes on another request to see the reminder, and the release at 30.
5. Language: tap "தமிழ்" in the header at any point.

## Decisions and checks for you

1. **Tamil review** (the full list is below).
2. Quick picks are looked up by name when tapped; check with a real Google key that the first match is the right terminal.
3. Cron granularity is 5 minutes; do you want 1-minute for the hold job? (Needs a new Worker cron trigger.)
4. **Inbox "Pending"** means accepted-but-unassigned; it will mean "needs a vehicle and driver" once Phase 3 adds assignment. OK?
5. No advance is collected yet (payments for cabs are a later phase), so the 20-minute payment hold is built and tested but dormant until `advance_bps` is set and payments exist.

## Known gaps

- Customer messages are in the outbox but **nothing sends them** (Phase 4); the operator gets a prefilled WhatsApp link on the booking page, and the customer sees status on the booking page itself.
- No driver assignment, tracking, payments, invoices or cancellation fees yet (Phases 3 onward). The share token is created and hashed but there is no tracking page to show it on.
- The customer site installs to a home screen but has no offline mode or push notifications.
- Operator screens are English only (as agreed); the customer site and the login are English and Tamil.
- Not tested against real Google, Firebase (reCAPTCHA, App Check, SMS), Razorpay, or the Cloudflare Worker runtime.
- Customer messages and the booking page show times in India time regardless of where the browser is.

## Every new Tamil string (for review)

The tolls notice and the earlier Phase 2 pre-work strings:

| Where | English | Tamil |
|---|---|---|
| Every quote (`lib/copy-ta.ts`) | Tolls & parking extra, as actual | சுங்கக் கட்டணம் (டோல்) மற்றும் பார்க்கிங் கட்டணம் தனி, உண்மையான தொகைப்படி |

Everything below is in one file, `lib/cabs/booking-copy.ts`, English and Tamil side by side; a test fails if a key is missing in Tamil or its `{placeholders}` differ. It covers the login page, the booking flow, error messages, the booking page and the messages sent through the outbox.

### Messages that go out through the outbox

| Key | English | Tamil |
|---|---|---|
| `operatorReminder` | Booking {code} is still waiting for your answer. Please accept or reject it. | முன்பதிவு {code} இன்னும் உங்கள் பதிலுக்காகக் காத்திருக்கிறது. தயவுசெய்து ஏற்கவும் அல்லது நிராகரிக்கவும். |
| `expiredNoResponse` | Sorry, {operator} could not confirm booking {code} in time, so it was released. Please call {operator} or try another time. | மன்னிக்கவும், {operator} முன்பதிவு {code}-ஐ உரிய நேரத்தில் உறுதிப்படுத்த முடியவில்லை, எனவே அது விடுவிக்கப்பட்டது. {operator}-ஐ அழைக்கவும் அல்லது வேறு நேரத்தில் முயற்சிக்கவும். |
| `expiredUnpaid` | Booking {code} was released because the advance was not paid in time. Please call {operator} to book again. | முன்பணம் உரிய நேரத்தில் செலுத்தப்படாததால் முன்பதிவு {code} விடுவிக்கப்பட்டது. மீண்டும் முன்பதிவு செய்ய {operator}-ஐ அழைக்கவும். |
| `requestedToCustomer` | We got your request {code}. {operator} will confirm shortly. | உங்கள் கோரிக்கை {code} கிடைத்தது. {operator} விரைவில் உறுதிப்படுத்துவார். |
| `acceptedToCustomer` | Good news: {operator} confirmed booking {code}. | நல்ல செய்தி: {operator} முன்பதிவு {code}-ஐ உறுதிப்படுத்தினார். |
| `rejectedToCustomer` | Sorry, {operator} could not take booking {code}. Please call {operator} or try another time. | மன்னிக்கவும், {operator}-ஆல் முன்பதிவு {code}-ஐ ஏற்க முடியவில்லை. {operator}-ஐ அழைக்கவும் அல்லது வேறு நேரத்தில் முயற்சிக்கவும். |

### Header and common

| Key | English | Tamil |
|---|---|---|
| `signIn` | Sign in | உள்நுழைக |
| `myBookings` | My bookings | என் முன்பதிவுகள் |
| `myAccount` | My account | என் கணக்கு |
| `callOperator` | Call {operator} | {operator}-ஐ அழைக்கவும் |
| `otherLanguage` | தமிழ் | English |
| `back` | Back | பின்செல் |
| `close` | Close | மூடு |
| `yes` | Yes | ஆம் |
| `no` | No | இல்லை |

### Home and search

| Key | English | Tamil |
|---|---|---|
| `ourVehicles` | Our vehicles | எங்கள் வாகனங்கள் |
| `servesCities` | Cabs and tours in {cities}. | {cities} பகுதிகளில் வாடகைக் கார் மற்றும் சுற்றுலா சேவை. |
| `servesFrom` | Cabs and tours from {city}. | {city} நகரிலிருந்து வாடகைக் கார் மற்றும் சுற்றுலா சேவை. |
| `whatsapp` | WhatsApp | வாட்ஸ்அப் |
| `homeTitle` | Book your cab | உங்கள் வாடகைக் காரை முன்பதிவு செய்யுங்கள் |
| `homeSub` | Tell us where and when. See the fare before you book. | எங்கிருந்து, எப்போது என்று சொல்லுங்கள். முன்பதிவுக்கு முன் கட்டணத்தைப் பாருங்கள். |
| `tabAirport` | Airport | விமான நிலையம் |
| `tabOneWay` | Outstation | வெளியூர் |
| `tabRound` | Round trip | சுற்றுப் பயணம் |
| `tabLocal` | Local | உள்ளூர் |
| `tabTour` | Tour packages | சுற்றுலாத் தொகுப்புகள் |
| `pickup` | Pickup | ஏறும் இடம் |
| `drop` | Drop | இறங்கும் இடம் |
| `pickupPlaceholder` | Search a pickup place | ஏறும் இடத்தைத் தேடுங்கள் |
| `dropPlaceholder` | Search a drop place | இறங்கும் இடத்தைத் தேடுங்கள் |
| `quickPicks` | Airports and stations | விமான நிலையங்கள் மற்றும் ரயில் நிலையங்கள் |
| `searchHint` | Type at least 3 letters | குறைந்தது 3 எழுத்துகளை உள்ளிடவும் |
| `noPlaces` | No places found. | இடங்கள் எதுவும் கிடைக்கவில்லை. |
| `when` | Pickup date and time | ஏறும் தேதி மற்றும் நேரம் |
| `returnWhen` | Return date and time | திரும்பும் தேதி மற்றும் நேரம் |
| `passengers` | Passengers | பயணிகள் |
| `bags` | Bags | பைகள் |
| `localPackage` | Package | தொகுப்பு |
| `localPackageOption` | {hours} hours, {km} km | {hours} மணி நேரம், {km} கி.மீ |
| `tourPackage` | Tour | சுற்றுலா |
| `tourDays` | {n} days | {n} நாட்கள் |
| `choose` | Choose | தேர்ந்தெடுக்கவும் |
| `seeFares` | See vehicles and fares | வாகனங்கள் மற்றும் கட்டணங்களைப் பார்க்கவும் |
| `searching` | Finding fares... | கட்டணங்களைத் தேடுகிறது... |
| `noLocal` | No local packages are set up yet. Please call us. | உள்ளூர் தொகுப்புகள் இன்னும் அமைக்கப்படவில்லை. எங்களை அழைக்கவும். |
| `noTours` | No tour packages are set up yet. Please call us. | சுற்றுலாத் தொகுப்புகள் இன்னும் அமைக்கப்படவில்லை. எங்களை அழைக்கவும். |
| `needPickup` | Choose a pickup place. | ஏறும் இடத்தைத் தேர்ந்தெடுக்கவும். |
| `needDrop` | Choose a drop place. | இறங்கும் இடத்தைத் தேர்ந்தெடுக்கவும். |
| `needWhen` | Choose the pickup date and time. | ஏறும் தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுக்கவும். |
| `needReturn` | Choose the return date and time. | திரும்பும் தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுக்கவும். |
| `needPackage` | Choose a package. | ஒரு தொகுப்பைத் தேர்ந்தெடுக்கவும். |

### Why a fare could not be shown

| Key | English | Tamil |
|---|---|---|
| `err_too_soon` | That pickup time is too soon. Please choose a later time, or call us. | அந்த ஏறும் நேரம் மிக அருகில் உள்ளது. பிந்தைய நேரத்தைத் தேர்ந்தெடுக்கவும் அல்லது எங்களை அழைக்கவும். |
| `err_too_far_ahead` | That date is too far ahead. Please choose an earlier date. | அந்தத் தேதி மிகவும் தொலைவில் உள்ளது. முந்தைய தேதியைத் தேர்ந்தெடுக்கவும். |
| `err_return_before_start` | The return must be after the pickup. | திரும்பும் நேரம் ஏறும் நேரத்திற்குப் பிறகு இருக்க வேண்டும். |
| `err_need_drop` | Choose a drop place. | இறங்கும் இடத்தைத் தேர்ந்தெடுக்கவும். |
| `err_need_return` | Choose the return date and time. | திரும்பும் தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுக்கவும். |
| `err_need_package` | Choose a package. | ஒரு தொகுப்பைத் தேர்ந்தெடுக்கவும். |
| `err_no_map_service` | We cannot work out the distance right now. Please call us to book. | தூரத்தை இப்போது கணக்கிட முடியவில்லை. முன்பதிவு செய்ய எங்களை அழைக்கவும். |
| `err_no_route` | We could not find a road route between these places. | இந்த இடங்களுக்கு இடையே சாலை வழியைக் கண்டுபிடிக்க முடியவில்லை. |
| `err_no_fit` | No vehicle fits this many passengers and bags. | இத்தனை பயணிகளுக்கும் பைகளுக்கும் ஏற்ற வாகனம் இல்லை. |
| `err_not_configured` | {operator} has not finished setting up fares yet. Please call to book. | {operator} இன்னும் கட்டணங்களை அமைத்து முடிக்கவில்லை. முன்பதிவு செய்ய அழைக்கவும். |
| `err_no_price` | We do not have a fare for this trip yet. Please call us. | இந்தப் பயணத்திற்கான கட்டணம் இன்னும் இல்லை. எங்களை அழைக்கவும். |
| `err_none_available` | No vehicles are available for this trip. Please call us. | இந்தப் பயணத்திற்கு வாகனங்கள் இல்லை. எங்களை அழைக்கவும். |
| `err_busy` | Too many requests. Please wait a minute and try again. | அதிகமான கோரிக்கைகள். ஒரு நிமிடம் காத்திருந்து மீண்டும் முயற்சிக்கவும். |
| `err_unavailable` | Online booking is not available right now. Please call us. | ஆன்லைன் முன்பதிவு இப்போது கிடைக்கவில்லை. எங்களை அழைக்கவும். |
| `err_bad_request` | Something is not right with the trip details. Please check and try again. | பயண விவரங்களில் ஏதோ சரியில்லை. சரிபார்த்து மீண்டும் முயற்சிக்கவும். |
| `err_signed_out` | Please verify your phone number to book. | முன்பதிவு செய்ய உங்கள் தொலைபேசி எண்ணைச் சரிபார்க்கவும். |
| `err_fare_changed` | The fare is now {amount}. Please check it and book again. | கட்டணம் இப்போது {amount}. சரிபார்த்து மீண்டும் முன்பதிவு செய்யவும். |
| `err_class_gone` | That vehicle is no longer available. Please choose another. | அந்த வாகனம் இப்போது கிடைக்கவில்லை. வேறொன்றைத் தேர்ந்தெடுக்கவும். |
| `err_generic` | Something went wrong. Please try again. | ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சிக்கவும். |

### Vehicles and fare

| Key | English | Tamil |
|---|---|---|
| `vehiclesTitle` | Choose your vehicle | உங்கள் வாகனத்தைத் தேர்ந்தெடுக்கவும் |
| `seatsN` | {n} seats | {n} இருக்கைகள் |
| `bagsN` | {n} bags | {n} பைகள் |
| `acLabel` | AC | குளிர்சாதனம் |
| `totalFare` | Total fare | மொத்தக் கட்டணம் |
| `fareDetails` | Fare details | கட்டண விவரம் |
| `fareBreakdown` | Fare breakdown | கட்டணப் பிரிப்பு |
| `selectVehicle` | Select | தேர்ந்தெடு |
| `advanceDue` | Advance: {amount} | முன்பணம்: {amount} |
| `tripSummary` | About {km} km, {min} minutes | சுமார் {km} கி.மீ, {min} நிமிடங்கள் |
| `tripSummaryKm` | About {km} km | சுமார் {km} கி.மீ |
| `changeSearch` | Change trip | பயணத்தை மாற்று |

### Review and request

| Key | English | Tamil |
|---|---|---|
| `reviewTitle` | Review your booking | உங்கள் முன்பதிவைச் சரிபார்க்கவும் |
| `route` | Route | வழித்தடம் |
| `vehicle` | Vehicle | வாகனம் |
| `fare` | Fare | கட்டணம் |
| `notesLabel` | Notes for the driver (optional) | ஓட்டுநருக்கான குறிப்புகள் (விருப்பம்) |
| `verifyToBook` | Verify your phone to book | முன்பதிவு செய்ய தொலைபேசியைச் சரிபார்க்கவும் |
| `verifyHelp` | We send a code to your mobile number. You are not charged yet. | உங்கள் மொபைல் எண்ணுக்கு ஒரு குறியீடு அனுப்புவோம். இப்போது கட்டணம் எதுவும் வசூலிக்கப்படாது. |
| `requestBooking` | Request booking | முன்பதிவைக் கோருக |
| `requesting` | Sending... | அனுப்புகிறது... |
| `requestHelp` | This is a request. {operator} will confirm it. You pay nothing now. | இது ஒரு கோரிக்கை. {operator} இதை உறுதிப்படுத்துவார். இப்போது நீங்கள் எதுவும் செலுத்த வேண்டாம். |

### Booking page

| Key | English | Tamil |
|---|---|---|
| `bookingCode` | Booking code | முன்பதிவுக் குறியீடு |
| `statusTitle` | Status | நிலை |
| `st_requested` | Waiting for confirmation | உறுதிப்படுத்தலுக்காகக் காத்திருக்கிறது |
| `st_confirmed` | Confirmed | உறுதிப்படுத்தப்பட்டது |
| `st_assigned` | Driver assigned | ஓட்டுநர் நியமிக்கப்பட்டார் |
| `st_driver_en_route` | Driver on the way | ஓட்டுநர் வந்துகொண்டிருக்கிறார் |
| `st_arrived` | Driver has arrived | ஓட்டுநர் வந்துவிட்டார் |
| `st_in_trip` | On the trip | பயணத்தில் உள்ளது |
| `st_completed` | Completed | முடிந்தது |
| `st_closed` | Completed | முடிந்தது |
| `st_rejected` | Not accepted | ஏற்கப்படவில்லை |
| `st_cancelled` | Cancelled | ரத்து செய்யப்பட்டது |
| `st_expired` | Not confirmed in time | உரிய நேரத்தில் உறுதிப்படுத்தப்படவில்லை |
| `st_no_show` | Missed pickup | ஏறும் நேரத்தில் வரவில்லை |
| `ev_created` | Request sent | கோரிக்கை அனுப்பப்பட்டது |
| `ev_accepted` | Confirmed by {operator} | {operator} உறுதிப்படுத்தினார் |
| `ev_rejected` | Not accepted by {operator} | {operator} ஏற்கவில்லை |
| `ev_cancelled` | Cancelled | ரத்து செய்யப்பட்டது |
| `ev_expired` | Released: not confirmed in time | விடுவிக்கப்பட்டது: உரிய நேரத்தில் உறுதிப்படுத்தப்படவில்லை |
| `ev_quote_adjusted` | Fare updated by {operator} | {operator} கட்டணத்தை மாற்றினார் |
| `ev_hold_alert` | Reminder sent to {operator} | {operator}-க்கு நினைவூட்டல் அனுப்பப்பட்டது |
| `help_requested` | {operator} has until {time} to confirm. We will show the answer here. | {operator} {time} வரை உறுதிப்படுத்தலாம். பதில் இங்கே காட்டப்படும். |
| `help_confirmed` | Your booking is confirmed. We will assign a driver and show the details here. | உங்கள் முன்பதிவு உறுதிப்படுத்தப்பட்டது. ஓட்டுநரை நியமித்து விவரங்களை இங்கே காட்டுவோம். |
| `help_rejected` | {operator} could not take this booking. Please call to try another time. | {operator}-ஆல் இந்த முன்பதிவை ஏற்க முடியவில்லை. வேறு நேரத்தில் முயற்சிக்க அழைக்கவும். |
| `help_expired` | This booking was not confirmed in time. Please call {operator} to book again. | இந்த முன்பதிவு உரிய நேரத்தில் உறுதிப்படுத்தப்படவில்லை. மீண்டும் முன்பதிவு செய்ய {operator}-ஐ அழைக்கவும். |
| `help_cancelled` | This booking was cancelled. | இந்த முன்பதிவு ரத்து செய்யப்பட்டது. |
| `fareAgreed` | {operator} agreed a fare of {amount}. Reason: {reason} | {operator} {amount} கட்டணத்திற்கு ஒப்புக்கொண்டார். காரணம்: {reason} |
| `cancelBooking` | Cancel booking | முன்பதிவை ரத்து செய் |
| `cancelTitle` | Cancel this booking? | இந்த முன்பதிவை ரத்து செய்யவா? |
| `cancelReason` | Reason (optional) | காரணம் (விருப்பம்) |
| `keepBooking` | Keep booking | முன்பதிவை வைத்திரு |
| `confirmCancel` | Yes, cancel | ஆம், ரத்து செய் |
| `cancelled` | Your booking was cancelled. | உங்கள் முன்பதிவு ரத்து செய்யப்பட்டது. |
| `cancelFailed` | This booking cannot be cancelled now. Please call {operator}. | இந்த முன்பதிவை இப்போது ரத்து செய்ய முடியாது. {operator}-ஐ அழைக்கவும். |
| `bookAgain` | Book again | மீண்டும் முன்பதிவு செய் |
| `bookingNotFound` | We could not find that booking. | அந்த முன்பதிவைக் கண்டுபிடிக்க முடியவில்லை. |
| `newBooking` | Your request was sent. Booking code {code}. | உங்கள் கோரிக்கை அனுப்பப்பட்டது. முன்பதிவுக் குறியீடு {code}. |
| `passengersLine` | {pax} passengers, {bags} bags | {pax} பயணிகள், {bags} பைகள் |
| `returnLine` | Return: {when} | திரும்புதல்: {when} |
| `tripWhen` | Pickup: {when} | ஏறும் நேரம்: {when} |

### History

| Key | English | Tamil |
|---|---|---|
| `historyTitle` | My bookings | என் முன்பதிவுகள் |
| `historyEmpty` | You have no bookings yet. | உங்களுக்கு இன்னும் முன்பதிவுகள் இல்லை. |
| `bookACab` | Book a cab | வாடகைக் காரை முன்பதிவு செய் |

### Account

| Key | English | Tamil |
|---|---|---|
| `accountTitle` | My account | என் கணக்கு |
| `yourName` | Your name | உங்கள் பெயர் |
| `language` | Language | மொழி |
| `save` | Save | சேமி |
| `saved` | Saved. | சேமிக்கப்பட்டது. |
| `savedAddresses` | Saved addresses | சேமித்த முகவரிகள் |
| `addAddress` | Add address | முகவரியைச் சேர் |
| `addressLabel` | Label (Home, Office) | பெயர் (வீடு, அலுவலகம்) |
| `noAddresses` | No saved addresses yet. | சேமித்த முகவரிகள் இன்னும் இல்லை. |
| `emergencyContacts` | Emergency contacts | அவசரத் தொடர்புகள் |
| `emergencyHelp` | People we can alert in an emergency. | அவசரத்தில் நாங்கள் தகவல் தெரிவிக்கக்கூடியவர்கள். |
| `contactName` | Name | பெயர் |
| `contactPhone` | Mobile number | மொபைல் எண் |
| `addContact` | Add contact | தொடர்பைச் சேர் |
| `contactLimit` | You can add up to 5 contacts. | அதிகபட்சம் 5 தொடர்புகளைச் சேர்க்கலாம். |
| `contactPhoneBad` | Enter a valid 10-digit mobile number that is not already added. | ஏற்கனவே சேர்க்கப்படாத சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும். |
| `remove` | Remove | நீக்கு |
| `signOut` | Sign out | வெளியேறு |
| `signOutEverywhere` | Sign out of all devices | எல்லா சாதனங்களிலிருந்தும் வெளியேறு |
| `signOutEverywhereHelp` | Ends your sign-in on every phone and computer. | எல்லா தொலைபேசிகள் மற்றும் கணினிகளிலும் உங்கள் உள்நுழைவை முடிக்கும். |
| `signedOutEverywhere` | Signed out everywhere. | எல்லா இடங்களிலிருந்தும் வெளியேறிவிட்டீர்கள். |
| `yourPhone` | Mobile number | மொபைல் எண் |

### Login page

| Key | English | Tamil |
|---|---|---|
| `loginTitle` | Sign in to book | முன்பதிவு செய்ய உள்நுழைக |
| `loginPhone` | Mobile number | மொபைல் எண் |
| `loginSend` | Send code | குறியீட்டை அனுப்புக |
| `loginSent` | We sent a 6-digit code to | 6 இலக்கக் குறியீடு அனுப்பப்பட்டது: |
| `loginVerify` | Verify | சரிபார்க்க |
| `loginChecking` | Checking... | சரிபார்க்கிறது... |
| `loginResend` | Resend code | மீண்டும் அனுப்புக |
| `loginResendIn` | Resend in | மீண்டும் அனுப்ப |
| `loginChange` | Change number | எண்ணை மாற்றுக |
| `loginBad` | Enter a valid 10-digit mobile number. Only Indian (+91) numbers can sign in. | சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும். இந்திய (+91) எண்கள் மட்டுமே உள்நுழையலாம். |
| `loginFail` | Could not sign you in. Please try again. | உள்நுழைய முடியவில்லை. மீண்டும் முயற்சிக்கவும். |
| `loginOff` | Sign-in is not available right now. | உள்நுழைவு தற்போது கிடைக்கவில்லை. |

### Fare lines (the fare engine writes English; these replace its words)

| Key | English | Tamil |
|---|---|---|
| `total` | Total | மொத்தம் |
| `line_base` | Base fare | அடிப்படைக் கட்டணம் |
| `line_distance` | Distance | தூரம் |
| `line_bata` | Driver allowance | ஓட்டுநர் படி |
| `line_package_hours` | {hours} hr / {km} km package | {hours} மணி / {km} கி.மீ தொகுப்பு |
| `line_tour` | Tour package | சுற்றுலாத் தொகுப்பு |
| `line_extra_km` | Extra distance (estimate) | கூடுதல் தூரம் (மதிப்பீடு) |
| `line_extra_hours` | Extra time (estimate) | கூடுதல் நேரம் (மதிப்பீடு) |
| `line_coupon` | Coupon {code} | கூப்பன் {code} |
| `line_rounding` | Rounding | முழு ரூபாய்க்குச் சரிசெய்தல் |
| `line_toll_estimate` | Tolls (estimate, billed at actuals) | சுங்கக் கட்டணம் (மதிப்பீடு, உண்மையான தொகைப்படி வசூலிக்கப்படும்) |
| `detail_km_at` | {km} km at {rate}/km | {km} கி.மீ × {rate}/கி.மீ |
| `detail_days` | {rate} × {n} {unit} | {rate} × {n} {unit} |
| `unit_day` | day | நாள் |
| `unit_days` | days | நாட்கள் |
| `detail_hr_at` | {n} hr at {rate}/hr | {n} மணி × {rate}/மணி |
| `detail_pct_of_fare` | {pct} of the fare | கட்டணத்தில் {pct} |
| `extraEstimate` | ≈ {amount} extra | கூடுதலாக ≈ {amount} |

### Airport and station quick picks

| English | Tamil |
|---|---|
| Chennai Airport | சென்னை விமான நிலையம் |
| Coimbatore Airport | கோயம்புத்தூர் விமான நிலையம் |
| Madurai Airport | மதுரை விமான நிலையம் |
| Tiruchirappalli Airport | திருச்சிராப்பள்ளி விமான நிலையம் |
| Thoothukudi Airport | தூத்துக்குடி விமான நிலையம் |
| Bengaluru Airport | பெங்களூரு விமான நிலையம் |
| Thiruvananthapuram Airport | திருவனந்தபுரம் விமான நிலையம் |
| Chennai Central | சென்னை சென்ட்ரல் |
| Chennai Egmore | சென்னை எழும்பூர் |
| Coimbatore Junction | கோயம்புத்தூர் சந்திப்பு |
| Madurai Junction | மதுரை சந்திப்பு |
| Tiruchirappalli Junction | திருச்சிராப்பள்ளி சந்திப்பு |
| Tirunelveli Junction | திருநெல்வேலி சந்திப்பு |
| Salem Junction | சேலம் சந்திப்பு |
| Thanjavur Junction | தஞ்சாவூர் சந்திப்பு |
