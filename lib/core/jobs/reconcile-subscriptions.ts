import { and, asc, inArray, isNotNull, lt, or, isNull } from "drizzle-orm"

import { applySubscription } from "../../billing/service"
import { getSubscription } from "../../billing/razorpay"
import type { RazorpaySubscription } from "../../billing/razorpay"
import { unscopedDb } from "../../db/client"
import { dealers } from "../../db/schema"
import { countMetric } from "../metrics"
import { safeErrorMessage } from "../safe-error"
import type { Job } from "../scheduler"

/** At most this many subscriptions are asked about per run; the rest are first in line the next day. */
export const MAX_PER_RUN = 50
export const TIME_BUDGET_MS = 15_000
/** A subscription whose paid period ends within this window (or has already ended) is checked against Razorpay. */
export const LOOK_AHEAD_MS = 2 * 86_400_000

export type Reconciled = { checked: number; updated: number; unknown: number; failed: number; deferred: number; skipped?: "no_provider" }

/**
 * Webhooks can be lost or delayed, and a missed renewal leaves a paying business's `paid_through` in the past until it slides into grace
 * and then suspension. This job asks Razorpay about every subscription that is due (paid period ending within two days, or already over,
 * or never charged) and feeds the answer through `applySubscription`, the same function the webhook uses. That function is idempotent
 * and never moves the paid-through date backwards or revives a cancelled subscription, so the job is safe to repeat, to run
 * alongside a webhook, and to run twice. It only READS from Razorpay.
 */
export async function reconcileSubscriptions(deps: { fetchSubscription?: (id: string) => Promise<RazorpaySubscription | null>; now?: () => Date; maxPerRun?: number; budgetMs?: number } = {}): Promise<Reconciled> {
  const fetchSubscription = deps.fetchSubscription ?? getSubscription
  const clock = deps.now ?? (() => new Date())
  const started = Date.now()
  const out: Reconciled = { checked: 0, updated: 0, unknown: 0, failed: 0, deferred: 0 }
  const horizon = new Date(clock().getTime() + LOOK_AHEAD_MS)

  const due = await unscopedDb
    .select({ id: dealers.id, subscriptionId: dealers.subscriptionId })
    .from(dealers)
    .where(
      and(
        isNotNull(dealers.subscriptionId),
        // Terminal states are final: nothing to learn from asking about them.
        or(isNull(dealers.subscriptionStatus), inArray(dealers.subscriptionStatus, ["created", "authenticated", "active", "pending", "halted"])),
        or(isNull(dealers.paidThrough), lt(dealers.paidThrough, horizon)),
      ),
    )
    .orderBy(asc(dealers.paidThrough))
    .limit((deps.maxPerRun ?? MAX_PER_RUN) + 1)

  const batch = due.slice(0, deps.maxPerRun ?? MAX_PER_RUN)
  out.deferred = due.length - batch.length
  for (const d of batch) {
    if (out.checked > 0 && Date.now() - started > (deps.budgetMs ?? TIME_BUDGET_MS)) {
      out.deferred += batch.length - out.checked - out.failed - out.unknown
      break
    }
    try {
      const sub = await fetchSubscription(d.subscriptionId!)
      if (!sub) {
        out.unknown++
        continue
      }
      out.checked++
      // dealerIdCheck: the subscription's own notes must name THIS business, so a mismatched record can never touch another one.
      if ((await applySubscription(sub, d.id)).applied) out.updated++
    } catch (error) {
      out.failed++
      console.error(`subscription reconcile failed for one business: ${safeErrorMessage(error)}`)
    }
  }
  if (out.failed) countMetric("subscription_reconcile_failed", { n: String(out.failed) })
  return out
}

export const reconcileSubscriptionsJob: Job = {
  name: "reconcile-subscriptions",
  async run() {
    const r = await reconcileSubscriptions()
    if (r.checked + r.failed + r.unknown > 0 && r.failed === r.checked + r.failed + r.unknown) throw new Error(`every subscription lookup failed (${r.failed})`)
    return `${r.checked} subscription(s) checked, ${r.updated} refreshed, ${r.unknown} not found, ${r.failed} failed${r.deferred ? `, ${r.deferred} deferred` : ""}`
  },
}
