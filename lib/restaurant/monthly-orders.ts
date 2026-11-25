import { and, asc, eq, inArray } from "drizzle-orm"

import { decrypt } from "../crypto"
import { unscopedDb } from "../db/client"
import { customers, dealers, deliveryZones, menuItems, monthlyPlanItems, monthlyPlans, orders } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { billingState } from "../billing/state"
import { ORDER_INDUSTRIES } from "../verticals"
import { isDue, istDate, monthlyBill } from "./monthly"
import { runStockBot } from "./auto-confirm"
import { coordsToStore, priceOrder } from "./orders"
import { matchingAddress } from "./saved-address"
import { savedAddressesFor } from "./saved-address-data"
import { readServiceArea } from "./service-area"
import { readOrderSettings } from "./settings"
import { placeOrderAtomically } from "./stock-server"

export type MonthlyRun = { shops: number; created: number; failed: number; skipped: number }

/**
 * Creates this month's order for every monthly plan that is due. "Make the world match the rules": a plan is due once its day has
 * come and its month has no order yet, so running this twice, or running it late after a missed day, never doubles an order. The
 * order carries the plan and the month, and that pair is unique in the database, so even two runs at once cannot both insert.
 * A plan that cannot be ordered (an item sold out, the shop closed) records why and is tried again on the next run.
 */
export async function createMonthlyOrders(now = new Date()): Promise<MonthlyRun> {
  const run: MonthlyRun = { shops: 0, created: 0, failed: 0, skipped: 0 }
  const shops = await unscopedDb.select().from(dealers).where(inArray(dealers.industry, [...ORDER_INDUSTRIES]))
  const cycle = istDate(now).cycle

  for (const shop of shops) {
    const settings = readOrderSettings(shop.orderSettings)
    if (!settings.monthly.enabled || !billingState(shop).hasAccess) continue
    const db = scopedDb(shop.id)
    const due = (await db.monthlyPlans.select(eq(monthlyPlans.status, "active"))).filter((p) => isDue(p, now))
    if (due.length === 0) continue
    run.shops += 1

    const zones = await db.deliveryZones.select(eq(deliveryZones.isActive, true), { orderBy: [asc(deliveryZones.createdAt)] })
    const radiusMode = readServiceArea(shop.serviceArea)?.radiusKm != null

    for (const plan of due) {
      const fail = async (why: string) => {
        run.failed += 1
        await db.monthlyPlans.update({ lastError: why.slice(0, 200), updatedAt: now }, eq(monthlyPlans.id, plan.id))
      }
      try {
        // Already ordered for this month (a retry after a crash between the insert and the bookkeeping).
        const existing = await db.orders.select(and(eq(orders.monthlyPlanId, plan.id), eq(orders.monthlyCycle, cycle))!, { limit: 1 })
        if (existing.length > 0) {
          run.skipped += 1
          await db.monthlyPlans.update({ lastCycle: cycle, lastError: null, updatedAt: now }, eq(monthlyPlans.id, plan.id))
          continue
        }
        const [customer] = await db.customers.select(eq(customers.id, plan.customerId), { limit: 1 })
        const rows = await db.monthlyPlanItems.select(eq(monthlyPlanItems.planId, plan.id))
        if (!customer || rows.length === 0) {
          await fail("The list has no items.")
          continue
        }
        const items = await db.menuItems.select(inArray(menuItems.id, [...new Set(rows.map((r) => r.itemId))]))
        const priced = priceOrder(
          { lines: rows.map((r) => ({ itemId: r.itemId, portion: r.portion, qty: r.qty })), fulfilment: "delivery", address: plan.address, pincode: plan.pincode },
          items.map((i) => ({ id: i.id, name: i.name, price: i.price, portions: i.portions, isAvailable: i.isAvailable, stock: i.stockQuantity })),
          settings,
          null,
          false,
          now,
          zones.map((z) => ({ id: z.id, name: z.name, pincodes: z.pincodes, fee: z.fee, minOrder: z.minOrder, etaMinutes: z.etaMinutes, isActive: z.isActive })),
          !radiusMode,
        )
        if (!priced.ok) {
          await fail(priced.error)
          continue
        }
        const bill = monthlyBill(priced.subtotal, priced.deliveryFee, settings.monthly)
        // When the plan delivers to a saved address, the order carries its map pin so the rider can navigate to the door.
        const pinned = matchingAddress(await savedAddressesFor(shop.id, plan.customerId), plan)
        const placed = await placeOrderAtomically(shop.id, {
          lines: priced.lines,
          order: {
            customerName: plan.name,
            customerPhone: decrypt(customer.phoneEnc, shop.id),
            fulfilment: "delivery",
            address: plan.address,
            note: `Monthly groceries${plan.note ? ` · ${plan.note}` : ""}`,
            lines: priced.lines,
            subtotal: bill.subtotal,
            discount: bill.discount,
            deliveryFee: bill.deliveryFee,
            total: bill.total,
            pincode: priced.pincode,
            ...coordsToStore("delivery", pinned?.lat ?? null, pinned?.lng ?? null),
            zoneName: priced.zoneName,
            paymentMethod: "cod",
            status: "new",
            monthlyPlanId: plan.id,
            monthlyCycle: cycle,
          },
        })
        if (!placed.ok) {
          await fail(placed.error)
          continue
        }
        await runStockBot(shop.id, placed.code)
        run.created += 1
        await db.monthlyPlans.update({ lastCycle: cycle, lastError: null, updatedAt: now }, eq(monthlyPlans.id, plan.id))
      } catch (error) {
        console.error(`monthly order failed: ${error instanceof Error ? error.message : "unknown"}`)
        await fail("Something went wrong. We will try again.").catch(() => {})
      }
    }
  }
  return run
}
