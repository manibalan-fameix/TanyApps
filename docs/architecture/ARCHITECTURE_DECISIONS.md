# Architecture decisions (pass 5)

Short records of the choices that carry a trade-off. Each says what was decided, why, and what would change the decision.

## ADR-1: Row-Level Security is not enabled now
Decided: keep application-layer isolation, ratcheted by tests (`tenant-access.test.ts`), and defer PostgreSQL RLS. Why: the HTTP Neon driver has no per-request session to carry a tenant setting, so RLS would turn every read into a transaction (a round trip on every request); system, webhook, platform and migration paths would each need a bypass role, widening the audited surface; and a half-applied RLS is worse than none. Revisit when the app runs per-request transactions anyway, or for a read-only reporting role (the safest first use). Full reasoning in `SECURITY_AND_TENANCY.md`.

## ADR-2: Commercial quotas start in observe mode; abuse ceilings are separate
Decided: `usage_limits.mode` defaults to `observe`; the monthly allowance only warns until an operator chooses `enforce`. `abuse_daily` is enforced whenever set but has **no default value**. Why: pricing and real usage are not known, and blocking a paying business on a guessed number is a worse failure than overspending a little for a few weeks. Why separate: an allowance is a commercial promise (needs a UI message and a top-up path); an abuse ceiling is a safety valve. Enforcement is one atomic conditional upsert, never read-then-write. Metering failure never blocks work. Revisit after 2-4 weeks of `/super/usage` data.

## ADR-3: Background work stays in the database and the existing cron
Decided: no queue service. Scheduled work is jobs behind the guarded cron route with a run-once slot lock, bounded batches and time budgets; durable state (a refund owed, a subscription due) lives in the row itself, so a crashed run is simply picked up by the next. The video queue keeps pg-boss on its worker host. Why: the volumes are small, every money operation is already idempotent and conditional, and a second system (Queues, Workflows) would add cost, deployment surface and another place for state to diverge. A new daily job (`reconcile-subscriptions`) reuses the existing trigger. Revisit if a job regularly exceeds its time budget or needs fan-out.

## ADR-4: The security trail is an append-only database table, not an external log
Decided: `security_audit_events` with triggers blocking UPDATE/DELETE/TRUNCATE, written in the same transaction as the action it records (fail-closed) for privileged and membership changes. Why: atomicity with the action is the property that matters most, and only the database gives it; an external log can lose or reorder events relative to the change. Honest limit: a database owner can drop the triggers, so this resists tampering by application code and ordinary roles but is not tamper-proof. Next step if needed: a database role without those rights for the application, and a nightly export to R2 with object lock. Retention: at least 24 months.

## ADR-5: Staff join by invitation; owners never hold anyone's credentials
Decided: invitations bound to a verified Firebase email or OTP phone, single use, expiring, staff-only, atomic acceptance; remove owner-created accounts and password setting. Legacy owner-provisioned accounts keep working until the person verifies their identity, then the owner's password is cleared. Why: the old model let an owner reserve or hold the credentials of an identity that belongs to someone else. Cost: the invitee needs a Google/phone/email sign-in of their own (they already needed one for every other Tany feature).

## ADR-6: CSP ships as Report-Only
Decided: send `Content-Security-Policy-Report-Only` built from the origins in the code, collect reports at `/api/t/csp-report`, enforce later. Why: the pages depend on Razorpay, Firebase, Maps and inline hydration scripts; an enforced policy derived from reading code could silently break payments or sign-in. Enforcement criteria: staging and production reports empty for the real journeys for a week.

## ADR-7: Cab booking de-duplication uses a client operation key
Decided: a UUID per review-screen visit, a unique index per (business, customer, key), 24-hour validity. Why: it merges exactly accidental repeats (double tap, retry, second tab) and never intentional ones, with no change to pricing or dispatch. Time- or content-based de-duplication was rejected because two real bookings for the same trip are legitimate.
