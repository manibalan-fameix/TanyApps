import { reconcileOrderRefunds } from "../../restaurant/payments"
import type { Job } from "../scheduler"

/**
 * Finishes TanyEats refunds the webhook path left behind (a crashed claim, a refund that failed and was released) and asks Razorpay
 * how pending ones ended. Independent of the Motors job, so a problem in one cannot stop the other. Safe to repeat and safe to run
 * while a webhook handles the same order: see reconcileOrderRefunds.
 */
export const retryOrderRefundsJob: Job = {
  name: "retry-order-refunds",
  async run() {
    const r = await reconcileOrderRefunds()
    return `${r.retried} refund(s) retried (${r.completed} completed), ${r.processed} processed, ${r.failed} failed, ${r.stillPending} still pending, ${r.leftForPerson} left for a person`
  },
}
