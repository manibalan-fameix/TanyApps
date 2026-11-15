# Cost guardrails

## What exists

| Cost driver | Control | Where |
|---|---|---|
| LLM chat (public, anonymous) | 20 req/10 min per IP (now un-spoofable), 300/10 min per business, 1024 max tokens, history sanitised, 503 when no key | `app/api/t/chat/route.ts` |
| Vision OCR / RC lookup (paid providers) | OCR 40/h per business; RC: 30-day cache per car, 40/h per business, 25/h per IP | `cars/actions.ts`, `lib/rc/lookup.ts` |
| Uploads | photo 15 MB, doc 8 MB, video 400 MB; body capped while reading (new) | `lib/media/keys.ts`, `read-body.ts` |
| Cab bookings per plan | monthly allowance with 80%/100% audit events and metric | `lib/cabs/{limits,usage}.ts` |
| Route distances | cached in `route_distances` | `lib/core/geo/route-cache.ts` |
| Eats road routes | one route per delivery stored in the Durable Object and shared | `workers/tracker` |
| Tracker traffic | hibernating sockets, 1 s gap, 6 h self-delete, ping answered without waking | `workers/tracker` |
| Rate limiting itself | Durable Object per key, alarm clears it after the window | `RateLimiter` |

## Added: per-tenant usage attribution

`recordUsage(unit, dealerId, qty)` (`lib/core/usage.ts`) emits `{"metric":"usage","unit":…,"dealer":…,"count":qty}` and, with the `METRICS` Analytics Engine binding, a data point (`indexes=[usage]`, blobs `unit=…`,`dealer=…`, double = qty). Wired to `llm_chat_request`, `vision_ocr_request`, `rc_lookup_request`. No personal data. Units are counts, **not rupees**: keep unit prices out of code and apply them in reporting.

Suggested unit prices to fill in from the actual invoices (do not trust these placeholders): LLM per request (model × tokens), Surepass per RC lookup, vision per image, Google Maps per request, R2 per GB-month + operations, Durable Object requests/duration, Neon compute-hours + storage. Estimated and billed costs must be tracked in separate columns.

## Not covered / recommended

- Google Places/Routes calls are not attributed (the provider API has no tenant argument). Thread `dealerId` through `PlacesProvider` calls, then add `maps_request` to `USAGE_UNITS`.
- An Analytics Engine SQL query per tenant/unit/day plus an alert at, say, 3× the trailing 7-day mean is the cheapest "abnormal growth" detector; not built.
- Plan-level quotas for chat/OCR/RC are not introduced: no baseline exists and an arbitrary cap could block legitimate businesses. Measure two to four weeks of `usage`, then set per-plan limits in `lib/plans.ts`.
- Image optimisation: photos are resized client-side to JPEG; no server-side variant generation was added.

---

# Pass 5: durable usage accounting and cost protection

Replaces the "recommended" items above for LLM chat, OCR, RC lookup, media and Maps. Read `lib/core/usage.ts`.

## What is measured, and where

| Feature (`FEATURES`) | Product | Provider | Unit | Counted at | Idempotent by |
|---|---|---|---|---|---|
| `llm_chat_request` | the business's product | Gemini | request | storefront chat, after rate limits | one per answered question |
| `llm_video_listing` | motors | Gemini | request | video listing intake | one per call |
| `vision_ocr_request` | motors | Gemini | request | plate OCR | one per call |
| `rc_lookup_request` | motors | Surepass | request | only when the paid provider is really called (a cache hit is not counted) | one per call |
| `media_upload_bytes` | platform | R2 | byte | upload confirmation | key `media:<id>` (confirming twice counts once) |
| `video_processing_seconds` | motors | ffmpeg host | second | after the duration check | key `video:<id>` (retries count once) |
| `maps_places_request` | cabs | Google | request | place search and details | one per call |
| `maps_route_request` | cabs | Google | request | one per fare quote; **over-counts** when the route cache answers, an upper bound by design |

**Not metered:** real-time tracking (Durable Object requests are billed by Cloudflare on the account and are not attributed per business; the tracker is a fixed small footprint), Razorpay fees (percentage of money, tracked by Razorpay), outbound notifications. Recommended: attribute DO requests per order when volume justifies it.

## Data model (migration 0035, additive)

`usage_events` (ledger: business, product, feature, provider, unit, quantity, `est_cost_micros`, `billed_cost_micros`, period, idempotency key), `usage_counters` (running totals per business, feature and bucket `d:YYYY-MM-DD` / `m:YYYY-MM`, updated by one atomic upsert), `usage_limits` (policy rows). Money is micro-rupees. **Estimated cost is quantity x a unit cost an operator configures; `billed_cost_micros` is reserved for real invoice amounts and is never filled by estimation.** No unit costs are invented in code: until one is set, the dashboard shows "no unit cost" instead of a made-up rupee figure.

## Policy and enforcement

- **Commercial allowance** (`included_monthly`, soft warning at `soft_pct`, default 80%): starts in `observe` mode. It measures and warns (metrics `usage_soft_limit`, `usage_over_allowance`) and never blocks. Switching a feature to `enforce` is a deliberate act by the Tany team, recorded in the security trail, and adds the business's `topup_quantity` to its allowance.
- **Anti-abuse ceiling** (`abuse_daily`, UTC day): enforced whenever set, independent of mode. **No ceiling is set out of the box** (no guessed numbers); the existing per-IP and per-business rate limits remain the first line. Recommended starting point once a few weeks of data exist: roughly 3x the 99th-percentile daily use of a healthy business.
- **Overrides:** a business row overrides the platform default per field; `exempt` means measured but never blocked; top-ups raise a month's allowance without changing the plan.
- **Atomicity:** limits are enforced inside the counter's single conditional upsert (`WHERE quantity + new <= limit`), so 40 simultaneous callers racing a limit of 10 get exactly 10 (tested; mutation-checked). A refused call is rolled back whole (no ledger row, no partial count).
- **Retries:** a repeated operation with the same key is counted once, even when the retries are simultaneous.
- **Failure behaviour:** if the accounting database is unreachable the work is **allowed** and `usage_metering_failed` is counted. Metering never blocks a purchase, an order or an emergency operation because a counter is down. A *denied* result only ever comes from a counter that answered.
- **Recovery:** a day ceiling lifts at UTC midnight; a monthly allowance at the month boundary; raising a limit or adding a top-up applies at once in the changing process and within one minute elsewhere (policy cache TTL 60 s).

## Visibility

`/super/usage` (Tany team): estimated cost so far and a straight-line month projection, cost by product and feature, top businesses, **unusual today** (at least 3x the previous 7-day daily average, days with no use counting as zero, and above a per-unit floor: 20 requests, one hour of processing, 100 MB; at most 5 per feature so one feature cannot hide another's anomalies), allowance utilisation, and a form to set limits. Alerts today are metrics in the Workers logs / Analytics Engine; an external alert on `usage_over_allowance`, `usage_limit_denied` and `usage_metering_failed` is recommended.

## Still requires real usage data

Unit costs (take them from the provider invoices), per-plan allowances, abuse ceilings, and which features, if any, to switch to `enforce`. None of these have been guessed or enabled.
