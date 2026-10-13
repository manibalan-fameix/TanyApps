# ClickUp plan (awaiting approval)

Nothing here exists in ClickUp yet. Assumptions are in `decisions.md`.

## 1. Structure
Space **Tany**, no folders, six lists: Product Backlog, Current Sprint, Bugs, Test Cases, Marketing, Sales Pipeline.
- Epics are tasks in Product Backlog with the tag `epic`. Stories link to their epic by tag `E1`..`E10` (cheaper than subtasks or relationships).
- Sprint 1 stories are created directly in Current Sprint so they are not created twice.
- Second product later: add a new Space (e.g. Showfood). Same list template. Nothing in Tany needs rework.
- Free-plan risk: ClickUp Sprints, custom fields and custom statuses per list may be limited. See manual steps. Fallback: Current Sprint is a plain list, and points go in the task title as `[3]`.

## 2. Statuses
Dev lists: Backlog, Ready, In Progress, In Review, QA, Done. Sales Pipeline: Lead, Contacted, Demo, Trial, Won, Lost. The connector probably cannot set statuses, so this is a manual step.

## 3. Epics and stories
Format: `ID | title | state | pts | owner | priority | files`. Every story gets "As a... I want... so that..." and 3-6 Given/When/Then lines when created. `QA` means a built feature, owned by Mala for verification, not Done until she confirms.

### E1 Dealer onboarding and auth
- S1 | Verify sign-in (Google, phone OTP, email) and 3-step onboarding end to end | QA | 3 | Mala | High | `lib/auth/*`, `app/(admin)/onboarding/*`
- S2 | Dealer subdomain goes live on creation (Cloudflare mapping with token) | Partly | 3 | Gokul | Urgent | `lib/cloudflare/domains.ts`
- S3 | Verify teammate add, remove, password reset | QA | 2 | Mala | Normal | `settings/team/*`
- S4 | Teammate roles: owner vs staff (staff cannot change billing or reset passwords) | Not started | 5 | Gokul | Normal | `settings/team/actions.ts`

### E2 Inventory and add-a-car
- S5 | Verify add-a-car wizard from plate to published link | QA | 5 | Mala | High | `components/cars/*`, `cars/actions.ts`
- S6 | Verify edit, hold, sold, archive, delete | QA | 3 | Mala | Normal | `cars/[id]/*`
- S7 | Switch RC lookup to live Surepass and check field mapping | Partly | 3 | Gokul | High | `lib/rc/surepass.ts`
- S8 | Host the video worker and run it with real ffmpeg | Partly | 5 | Gokul | Normal | `workers/*`
- S9 | Review the variants CSV with Chennai resale knowledge | Partly | 2 | Mala | Normal | `data/variants/*.csv`
- S10 | Sold cars page `/cars/sold` | Stubbed | 2 | Pavi | Normal | nav-config, `cars/page.tsx`
- S11 | Verify voice entry (English, Tamil) on Growth plan | QA | 3 | Mala | Low | `lib/voice/*`
- S12 | Duplicate plate warning via blind index | Not started | 3 | Gokul | Low | `lib/reg.ts`, schema
- S13 | Verify video-to-listing and walkaround upload | QA | 3 | Mala | Low | `lib/cars/from-video.ts`

### E3 Public showroom and car pages
- S14 | Buyer can request a test drive or leave details on a car page | Not started | 5 | Gokul | Urgent | `[carSlug]/actions.ts`, `lib/db/schema/cars.ts` leads
- S15 | WhatsApp button on car page and showroom | Not started | 2 | Pavi | High | `lib/whatsapp.ts`, `components/cars/buyer-*.tsx`
- S16 | Verify buyer car page, gallery, EMI, chat | QA | 3 | Mala | High | `app/(tenant)/sites/[dealer]/[carSlug]/*`
- S17 | Verify showroom home, filters, sort, short links | QA | 2 | Mala | Normal | `app/(tenant)/sites/[dealer]/page.tsx`, `proxy.ts`
- S18 | Landing page on tany.in: pitch, pricing, demo, sign-up | Stubbed | 5 | Bala (design 2) + Pavi (build 3) | High | `app/page.tsx`
- S19 | Privacy policy and terms legal review | Built | 2 | Bala | Normal | `app/privacy`, `app/terms`
- S20 | Define the buyer account page for motors (or remove it) | Partly | 2 | Bala | Low | `[dealer]/account/page.tsx`

### E4 Leads and enquiries
- S21 | Dealer sees every lead in an inbox and updates its status | Stubbed | 5 | Gokul | Urgent | `/leads` (new), `leads` table
- S22 | Lead pipeline board `/leads/pipeline` | Stubbed | 3 | Pavi | Normal | new
- S23 | Dealer is alerted within a minute of a new lead (WhatsApp or push) | Not started | 5 | Gokul | High | new, FCM/Resend env
- S24 | Dashboard lead cards show real data after S21 | Built | 1 | Mala | Normal | `dashboard/page.tsx`

### E5 Booking and payments
- S25 | Enable Razorpay Route and finish KYC for the platform account | Blocked, external | 2 | Bala | Normal | n/a
- S26 | Verify dealer account connect and booking token with refund | QA | 3 | Mala | Normal | `settings/payments/*`, `lib/bookings/*`
- S27 | Expand webhook tests (captured, failed, duplicate) | Partly | 2 | Pavi | Normal | `tests/razorpay-webhook.test.ts`

### E6 Billing, plans and trial
- S28 | Verify subscription checkout, trial, confirm, cancel in test mode | QA | 5 | Mala | Urgent | `settings/billing/*`
- S29 | Verify trial end, grace and suspended showroom behaviour | QA | 3 | Mala | High | `lib/billing/state.ts`
- S30 | Go-live billing checklist: confirm prices and trial, live keys, webhook | Partly | 2 | Bala + Gokul | Urgent | `lib/plans.ts`
- S31 | GST-ready subscription invoices emailed to dealers | Not started | 5 | Gokul | Normal | new

### E7 Branding and white-label
- S32 | Verify theme, hours and Powered-by removal per plan | QA | 3 | Mala | Normal | `settings/{theme,hours}`, `powered-by.tsx`
- S33 | Provision custom domains (Cloudflare for SaaS) | Stubbed | 5 | Gokul | Low | `lib/tenant/lookup.ts`
- S34 | Domain settings page for Pro dealers | Not started | 3 | Pavi | Low | new

### E8 Dashboard, reports, settings
- S35 | Verify dashboard stats and listing-performance report | QA | 3 | Mala | Normal | `dashboard/*`, `reports/*`
- S36 | Help, Account and Notifications settings pages | Stubbed | 3 | Pavi | Low | nav-config
- S37 | RC transfer tracker for dealers | Stubbed | 5 | Gokul | Low | `rcTransfers`
- S38 | Buyer transfer-tracking page by token | Not started | 3 | Pavi | Low | `buyerTrackingToken`

### E9 Platform and quality
- S39 | Commit and review the 246 uncommitted paths; tag a baseline | Partly | 2 | Gokul | Urgent | whole repo
- S40 | Shared rate limiter (Workers-safe) for OTP, RC, booking, chat | Partly | 3 | Gokul | High | `lib/rate-limit.ts`
- S41 | Error monitoring (Sentry) on app and worker | Not started | 2 | Pavi | High | env, `workers/*`
- S42 | CI on every PR: typecheck, lint, unit tests, tenant-leak test | Not started | 3 | Pavi | High | new `.github`
- S43 | E2E tests for onboarding, enquiry, billing | Partly | 5 | Mala + Pavi | Normal | `e2e/*`
- S44 | Security review: secrets, key backup, dev bypass off in prod | Partly | 3 | Gokul | High | `lib/auth/dev-bypass.ts`, `lib/crypto`
- S45 | Production runbook: deploy, migrate, rollback, backup | Not started | 2 | Gokul | Normal | `docs/`

### E10 Restaurants module (decision pending)
- S46 | Decide: keep, park or remove restaurants from this product | Decision | 1 | Bala | High | n/a
- S47 | Verify storefront ordering and payment | QA | 5 | Mala | Low
- S48 | Verify admin orders, delivery partners and live tracking | QA | 5 | Mala | Low

48 stories, 10 epics = 58 tasks. Nothing is above 5 points.

## 4. Priority summary
Urgent: S2, S14, S21, S28, S30, S39. These stop a dealer from going live, getting a lead, or paying.
High: S1, S5, S7, S15, S16, S18, S23, S29, S40, S41, S42, S44, S46.

## 5. First sprint (Mon 2026-10-12 to Fri 2026-10-23)
Goal: a dealer can sign up, add a car, receive a lead, and pay the trial-end subscription, on a committed baseline.

| Person | Stories | Points | Capacity |
|---|---|---|---|
| Gokul | S39, S14, S21, S2, S40, S7 | 2+5+5+3+3+3 = 21 | 20 (S7 goes first to slip if needed) |
| Pavi (dev) | S15, S41, S42 | 2+2+3 = 7 | 8 |
| Mala | S1, S5, S16, S28, S29 | 3+5+3+5+3 = 19 | 20 |
| Bala | S46, S30 (with Gokul), S25, S18 design half | 1+2+2+2 = 7 | 8 |

Order inside the sprint: S39 first (everyone tests the same baseline), then S14 and S21 together, then S2. Mala starts QA on S1, S28 in week 1 and S5, S16, S29 in week 2 as builds land. The sprint holds 18 of the 48 stories, about 57 points. The other 30 wait in Product Backlog. Gokul is 1 point over; S7 is the one to slip.

## 6. Call budget (nothing deleted, so counts are estimates)
- Session 1 (about 62 calls): check tools 1, space 1, six lists 6, ten epics 10, then sprint 1 stories 18 and the remaining Urgent/High stories 26. Total about 62.
- Session 2 (about 22 calls), after a 24h window: the rest of the backlog stories (around 18 Normal/Low) plus status checks.
- If the connector supports bulk create, both sessions shrink a lot. I will check in the first call.
- Reserve 20 calls for the team each day. I will not exceed 80 in a session.

## 7. Manual steps for Bala in the ClickUp app
1. Attach the ClickUp connector to Claude Code and sign in.
2. Invite Bala, Mala, Gokul, Pavi, Vishnu and send me each person's ClickUp name or email.
3. Create the Space, or confirm I may.
4. Set the statuses on each list (section 2).
5. Turn on Sprints and story points if the plan allows. Otherwise tell me and I use the title fallback.
6. Create the Priority and tag names `epic`, `E1`..`E10`.
7. Give Vishnu access to Sales Pipeline only, to avoid him seeing dev tasks.
8. Confirm the sprint start date.
