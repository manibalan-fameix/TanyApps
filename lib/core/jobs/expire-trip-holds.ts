import { sweepHolds } from "../../cabs/trips"
import { scopedDb } from "../../db/scoped"
import { listDealerContactsByIndustry } from "../../tenant/lists"
import type { Job } from "../scheduler"

/**
 * Keeps cab bookings honest about time. For every cab business: nudges the operator when a request is half-way through its answer
 * window, and releases (expires) a request nobody answered in time or an accepted booking whose advance was not paid in time. The
 * customer is told and a trip event is written. Safe to repeat: every step is a conditional update on the booking's status.
 */
export const expireTripHoldsJob: Job = {
  name: "expire-trip-holds",
  async run() {
    const businesses = await listDealerContactsByIndustry("cabs")
    let alerted = 0
    let expired = 0
    let failed = 0
    for (const b of businesses) {
      try {
        const r = await sweepHolds(scopedDb(b.id), new Date(), { operatorPhone: b.phone, operatorName: b.displayName })
        alerted += r.alerted
        expired += r.expired
      } catch (error) {
        // One business's problem must not stop the others from being swept.
        failed++
        console.error(`expire-trip-holds failed for one business: ${error instanceof Error ? error.message : "unknown"}`)
      }
    }
    if (failed > 0 && failed === businesses.length) throw new Error(`every business failed (${failed})`)
    return `${alerted} reminder(s), ${expired} released across ${businesses.length} cab business(es)${failed ? `, ${failed} failed` : ""}`
  },
}
