import { createMonthlyOrders } from "../../restaurant/monthly-orders"
import type { Job } from "../scheduler"

/** Daily: creates this month's order for every monthly-groceries plan whose delivery day has come. Safe to repeat (see createMonthlyOrders). */
export const createMonthlyOrdersJob: Job = {
  name: "create-monthly-orders",
  async run() {
    const r = await createMonthlyOrders()
    return `${r.created} order(s) created, ${r.failed} could not be placed, ${r.skipped} already done, across ${r.shops} shop(s)`
  },
}
