import { listDealerIdsByIndustry } from "../../tenant/lists"
import { expireUnpaidOrders } from "../../restaurant/payments"
import type { Job } from "../scheduler"

/**
 * Cancels online food orders nobody paid for within the window and gives their stock back. This used to happen only when
 * someone happened to open an orders page; now it also runs every few minutes. Safe to repeat: it only touches orders that
 * are still `pending_payment` and past the cutoff.
 */
export const expireUnpaidOrdersJob: Job = {
  name: "expire-unpaid-orders",
  async run() {
    let released = 0
    const dealerIds = await listDealerIdsByIndustry("restaurants")
    for (const id of dealerIds) released += await expireUnpaidOrders(id, new Date(), { verifyWithProvider: true })
    return `${released} order(s) released across ${dealerIds.length} restaurant(s)`
  },
}
