# Tany feature audit

Audited 2026-10-08 from the working tree on `main` (HEAD `2372866`). Read-only; no code changed.

**Baseline warning.** The working tree has 246 changed or untracked paths (93 tracked files modified, about +5.4k / -1.2k lines) on top of the last commit. That includes migrations `drizzle/0005`-`0022`, the whole restaurant module, billing, bookings, analytics, settings, voice entry and the buyer storefront. None of it is in git history. Everything below describes the working tree, not a released build.

State rule: **Built** = UI, logic and data layer all present and connected. Anything less is Partly built, Stubbed or Not started. "Built" means code exists and is connected. It does not mean verified. Mala verifies.

## Feature inventory

### E1 Dealer onboarding and auth
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Sign-in: Google, phone OTP, email+password via Firebase, token checked server-side with jose | Auth | Built | `lib/auth/{actions,firebase,firebase-user,context,index}.ts`, `components/auth/dealer-login-form.tsx`, `app/(admin)/login/page.tsx`, `tests/firebase-auth.test.ts` | Live phone OTP verified once (memory note). No test of the full UI flow. Old `firebase-login.tsx` and `email-password-form.tsx` deleted in the tree. |
| Guided 3-step onboarding wizard (industry, name/slug, phone verify) and dealer creation | Onboarding | Built | `app/(admin)/onboarding/*`, `components/onboarding/*`, `lib/dealers/onboard.ts`, `lib/tenant/create-dealer.ts`, `tests/onboard.test.ts` | Slug availability and phone verify are server actions with no e2e test. |
| Subdomain provisioning (`<slug>.tany.in` attached to the Worker) | Onboarding | Partly built | `lib/cloudflare/domains.ts` | Skipped unless `CLOUDFLARE_API_TOKEN` is set. Never confirmed in production. Failure handling is a returned reason only. |
| Teammate accounts (add, remove, reset password) | Auth | Built | `app/(admin)/(shell)/settings/team/*`, `lib/auth/teammate-login.ts`, `lib/auth/password.ts` | No role or permission model. All teammates have the same access. |
| Dev-only sign-in bypass | Auth | Built | `lib/auth/dev-bypass.ts`, `openDevDemo` | Must be proven inactive in production. |

### E2 Inventory and add-a-car
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Add-car wizard: start, plate OCR, RC autofill, variant match, details, photos, price, publish | Inventory | Built | `components/cars/add-car-wizard.tsx` and step files, `app/(admin)/(shell)/cars/actions.ts`, `lib/cars/*`, `lib/rc/*`, `lib/ai/*`, `e2e/add-car.spec.ts`, `tests/cars.integration.test.ts` | `RC_PROVIDER` is `mock` in `wrangler.jsonc`, so no real RC data and no "Verified" badge. Surepass adapter never called with a real key. |
| Guided photo capture, 12 angles, offline upload queue | Inventory | Built | `components/capture/*`, `lib/upload/*`, `lib/angles.ts`, `tests/upload-queue.test.ts`, `e2e/camera.spec.ts` | Service worker/PWA absent, so uploads pause when the app is closed. |
| Variants master data (45 models, 446 rows) | Inventory | Partly built | `data/variants/chennai-top40.csv`, `scripts/import-variants.ts` | Written from model knowledge, not manufacturer data (DECISIONS.md). Needs human review. A car not in the catalogue cannot be published. |
| Marketplace details (condition, features, pricing, booking amount) | Inventory | Built | `components/cars/marketplace-details-step.tsx`, `lib/cars/marketplace.ts`, `tests/marketplace-save.test.ts` | None found. |
| Manage a car: edit, hold, mark sold, archive, delete | Inventory | Built | `app/(admin)/(shell)/cars/[id]/page.tsx`, `cars/actions.ts` (`updateCarAction`, `deleteCarAction`, `archiveCarAction`), `components/cars/car-edit-sheet.tsx` | No e2e. |
| Cars list | Inventory | Built | `app/(admin)/(shell)/cars/page.tsx`, `components/cars/cars-grid.tsx` | None found. |
| Sold cars list (`/cars/sold`) | Inventory | Stubbed | Nav link in `components/admin/nav-config.ts`, falls to `ComingSoon` | No page. |
| Voice entry (EN/Tamil/Tanglish), Growth plan and above | Inventory | Built | `components/cars/voice-step.tsx`, `cars/voice-actions.ts`, `lib/voice/*`, `tests/voice-template.test.ts` | Model accuracy on real speech unproven. |
| Video-to-listing and video upload step | Inventory | Partly built | `app/api/cars/from-video/route.ts`, `lib/cars/from-video.ts`, `lib/ai/video-listing.ts`, `components/cars/video-step.tsx` | Depends on a Gemini key and client extraction. No real-device test. |
| Walkaround video: HLS 360p/720p, poster, missing-angle check | Inventory | Partly built | `workers/index.ts`, `workers/video.ts`, `lib/video/*`, `lib/jobs/boss.ts` | Never run with real ffmpeg. No production host for the worker (memory note). Reads whole file into memory (400 MB cap). |
| Duplicate plate detection | Inventory | Not started | DECISIONS.md | Plates are encrypted with random IV; needs a blind index. |
| Tany score and savings cards | Inventory | Built | `lib/cars/score.ts`, `lib/cars/savings.ts`, `components/cars/tany-score-card.tsx`, tests | Scoring weights are a product call, unreviewed. |

### E3 Public showroom and car pages
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Dealer showroom home with filters and sort | Public | Built | `app/(tenant)/sites/[dealer]/page.tsx`, `components/tenant/*`, `lib/cars/filters.ts` | No e2e. |
| Buyer car page: gallery, header card, EMI calculator, purchase panel, sticky bar | Public | Built | `app/(tenant)/sites/[dealer]/[carSlug]/page.tsx`, `components/cars/buyer-*.tsx`, `emi-calculator.tsx` | Only contact action is a `tel:` link. |
| Buyer enquiry or test-drive request form | Public | Not started | No server action creates a lead from the car page. `grep` shows `db.leads.insert` only in `lib/bookings/service.ts`. | **A buyer cannot leave their details unless they pay a booking token.** `leads` table, `business_hours` and consent column exist. |
| WhatsApp CTA on car page | Public | Not started | `lib/whatsapp.ts` exists; used only in chat panel and restaurant tracking | Indian used-car buyers expect it. |
| Buyer AI chat widget (general and per-car) | Public | Built | `components/chat/*`, `app/api/t/chat/route.ts`, `lib/ai/chat.ts`, `tests/chat.test.ts` | Rate limit is in-memory per instance. Needs `VISION_API_KEY` in production. |
| Short links `/{code}` and share kit (caption, 4:5 carousel) | Public | Built | `proxy.ts`, `lib/short-code.ts`, `lib/share/caption.ts`, `components/cars/share-kit-panel.tsx`, `tests/share.test.ts` | Not tested on iOS Safari share-with-files. |
| Tenant isolation (scoped DB, proxy host rules) | Platform | Built | `lib/db/scoped.ts`, `proxy.ts`, `tests/tenant-leak*.test.ts`, `tests/host.test.ts` | Integration leak test needs `TEST_DATABASE_URL`. Not run in CI (there is no CI). |
| Buyer account page | Public | Partly built | `app/(tenant)/sites/[dealer]/account/page.tsx`, `components/tenant/account-menu.tsx` | Purpose and data not defined for motors. |
| Marketing home on root domain | Public | Stubbed | `app/page.tsx` ("Marketing placeholder") | Heading, body, one button. No pricing, demo, or proof. |
| Privacy policy and terms pages | Public | Built | `app/privacy/page.tsx`, `app/terms/page.tsx` | Legal review not evidenced. |

### E4 Leads and enquiries
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Leads inbox `/leads` | Leads | Stubbed | `leads` table, dashboard "Recent leads" card, nav items; page falls to `ComingSoon` | No list, no status change, no call/WhatsApp action. |
| Lead pipeline `/leads/pipeline` | Leads | Stubbed | Nav only; `leadStatus` enum | No page. |
| New-lead alert to dealer (WhatsApp, push, email) | Leads | Not started | `.env.example` lists FCM and Resend as "later phases (not used yet)" | A dealer would not know a lead arrived unless they open the app. |
| Customer list | Leads | Built (restaurants only) | `customers/page.tsx`, `lib/restaurant/customers.ts` | Motors has none. |

### E5 Booking and payments (Razorpay Route)
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Dealer connects Razorpay linked account | Payments | Partly built | `settings/payments/*`, `lib/route/razorpay.ts` | Route not enabled on the Razorpay account (memory note). Cannot be verified live. |
| Buyer pays booking token on car page, split to dealer | Payments | Partly built | `[carSlug]/actions.ts`, `components/cars/booking-checkout.ts`, `lib/bookings/service.ts`, webhook `payment.captured` | Blocked on Route. Test-mode direct flag exists. A paid booking creates a lead and is the only lead source. |
| Refund booking | Payments | Built | `cars/[id]/actions.ts` `refundBooking`, `booking-refund-button.tsx` | Untested. |
| Razorpay webhook | Payments | Built | `app/api/webhooks/razorpay/route.ts`, `tests/razorpay-webhook.test.ts` (2 tests) | Thin coverage. |

### E6 Billing, plans and trial
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Plans (free 5 cars, starter 25, growth 50, pro 100, scale) and live-car cap on publish | Billing | Built | `lib/plans.ts`, `lib/cars/publish.ts` | Prices (2999 / 4999 / 8999 per month) and the 30-day trial are unconfirmed product decisions. |
| Subscription checkout, confirm, cancel | Billing | Built | `settings/billing/*`, `components/billing/*`, `lib/billing/*` | Test-mode only evidence. No live keys. |
| Trial, grace, suspended states and access gating | Billing | Built | `lib/billing/state.ts`, `tests/billing-state.test.ts` (14), used in `lib/tenant/lookup.ts` | Dunning emails not present. |
| Invoices / GST receipts for subscriptions | Billing | Not started | None found | Paying Indian businesses will ask. |
| Plan page `/settings/plan` | Billing | Built | Redirects to billing | n/a |

### E7 Branding and white-label
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Theme settings (colours, radius, logo) with WCAG checks | Branding | Built | `settings/theme/*`, `components/settings/theme-form.tsx`, `lib/theme/*`, `tests/theme.test.ts` | None found. |
| Business hours | Branding | Built | `settings/hours/*`, `lib/hours.ts` | Hours feed nothing buyer-facing for motors (no test-drive slots yet). |
| "Powered by" removal on Pro | Branding | Built | `components/tenant/powered-by.tsx`, `lib/plans.ts` `whiteLabel` | Needs QA per plan. |
| Custom domain | Branding | Stubbed | `lib/tenant/lookup.ts` TODO, `dealerDomains` table | No dealer UI to add a domain. No Cloudflare for SaaS provisioning. `verified_at` must be set by hand. |

### E8 Dashboard, reports, settings
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Dealer dashboard (stats, trend charts, recent cars/leads) | Admin | Built | `dashboard/page.tsx`, `lib/dashboard/stats.ts`, `components/dashboard/*` | Lead cards will be empty until E4 is built. |
| Listing performance reports | Admin | Partly built | `reports/page.tsx`, `lib/analytics/*`, `tests/analytics.test.ts` | Needs Cloudflare token with Analytics Read; shows "not connected" otherwise. |
| Help, Account, Notifications settings, Transfers | Admin | Stubbed | `/help`, `/settings/account`, `/settings/notifications`, `/transfers` in nav, fall to `ComingSoon` | No pages. |
| RC transfer tracker | Admin | Stubbed | `rcTransfers` table, `lib/cars/delete.ts` only | No UI or buyer tracking page. |

### E9 Platform and quality
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Cloudflare Workers deploy (OpenNext) | Platform | Partly built | `wrangler.jsonc`, `open-next.config.ts`, `pnpm deploy` | Production deploy not evidenced in repo. Video worker has no host. |
| Rate limiting | Platform | Partly built | `lib/rate-limit.ts` ("TODO phase 6") | In-memory per isolate. OTP, chat, RC, booking limits are weak on Workers. |
| Error monitoring | Platform | Not started | `SENTRY_DSN` in `.env.example`, no code | Blind to production errors. |
| CI | Platform | Not started | No `.github/` | Typecheck, lint, tests, leak test never run automatically. |
| Tests | Platform | Partly built | 28 files in `tests/`, 2 e2e specs | No tests for leads, onboarding UI, buyer flows, billing UI, bookings, teammates. |
| Encryption of phones, plates, RC data | Platform | Built | `lib/crypto`, `tests/crypto.test.ts` | Key backup process undocumented. |

### E10 Restaurants module (second vertical, in the same codebase)
| Feature | Area | State | Evidence | Gaps |
|---|---|---|---|---|
| Menu, categories, inventory, coupons, banners, offers | Restaurants | Built | `app/(admin)/(shell)/{menu,categories,inventory,coupons,banners}`, `lib/restaurant/*`, `lib/db/schema/{menu,restaurant}.ts` | Untracked in git. Beyond the stated Tany scope. |
| Storefront ordering, cart, checkout, online payment | Restaurants | Built | `app/(tenant)/sites/[dealer]/{menu,cart,checkout,dish,o,track-order}`, `components/restaurant/store/*`, `tests/restaurant-orders.test.ts` (58) | Online payment needs Route. |
| Delivery partners, zones, live rider tracking | Restaurants | Built | `delivery-*`, `live-deliveries`, `workers/tracker`, `lib/restaurant/live-*` | Tracker worker is separate Cloudflare deploy. |
| Orders, customers, reviews, enquiries, payments, analytics admin | Restaurants | Built | matching admin routes | Not verified. |

## Cross-cutting lists

**Missing tests:** leads (none, feature absent), onboarding/slug/phone-verify actions, booking create/confirm/refund, billing actions, teammate actions, theme save action, publish cap, buyer car page and showroom, `proxy.ts` short-link redirect, restaurant admin.

**Missing error handling:** `mapDealerSubdomain` failure leaves a dealer with no working URL and no retry or alert. Worker video failures are not surfaced to the dealer. Analytics "not connected" is shown to dealers, who cannot fix it.

**Security and data risks**
1. 246 uncommitted paths: one lost laptop or bad checkout loses the product.
2. In-memory rate limits per Workers isolate (OTP, RC lookups, booking, chat).
3. No role model for teammates. Any teammate can reset another's password and change billing.
4. `ENCRYPTION_KEY` loss makes phones, plates and RC data unreadable. No documented backup.
5. Dev bypass and dev storage routes depend on `NODE_ENV` checks. Needs a production proof.
6. Mock RC provider is the production setting; copy must not imply verified data.
7. `wrangler.jsonc` holds Firebase web keys and IDs. These are public values, but secrets must stay out of it.
8. Lead and booking phones are encrypted. Confirm the leads inbox, when built, does not log them.

**What a real dealer cannot complete end to end today**
- Receive a buyer enquiry (no form, no inbox, no alert).
- See sold-car history, transfers, help or account pages.
- Use a custom domain.
- Get verified RC data.
- Play processed walkaround video (no worker host).
- Pay for a subscription with live money (test keys only), or get an invoice.
- Take an online booking token (Route not enabled).

## Epics suggested by the code
E1 Dealer onboarding and auth. E2 Inventory and add-a-car. E3 Public showroom and car pages. E4 Leads and enquiries. E5 Booking and payments. E6 Billing, plans and trial. E7 Branding and white-label. E8 Dashboard, reports and settings. E9 Platform and quality. E10 Restaurants module (needs a decision, see decisions.md D3).
