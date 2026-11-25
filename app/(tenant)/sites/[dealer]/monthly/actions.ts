"use server"

import { asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { tenantContext } from "@/lib/core/guards"
import { currentCustomer } from "@/lib/core/login/customer"
import { rateLimit } from "@/lib/core/rate-limit"
import { deliveryZones, menuItems, monthlyPlanItems, monthlyPlans } from "@/lib/db/schema"
import { scopedDb, scopedTransaction } from "@/lib/db/scoped"
import { billingState } from "@/lib/billing/state"
import { MAX_DELIVERY_DAY, formatDate, monthlyBill, nextDelivery, startingCycle } from "@/lib/restaurant/monthly"
import { priceOrder } from "@/lib/restaurant/orders"
import { readServiceArea } from "@/lib/restaurant/service-area"
import { readOrderSettings } from "@/lib/restaurant/settings"
import { ORDER_INDUSTRIES } from "@/lib/verticals"

type Fail = { ok: false; error: string; field?: string }

const planSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(60),
  deliveryDay: z.number().int().min(1, "Pick a delivery day.").max(MAX_DELIVERY_DAY, "Pick a delivery day."),
  address: z.string().trim().min(6, "Enter your delivery address.").max(300),
  pincode: z.string().trim().max(6).default(""),
  note: z.string().trim().max(300).default(""),
  lines: z
    .array(z.object({ itemId: z.string().uuid(), portion: z.string().max(30).nullable().default(null), qty: z.number().int().min(1).max(20) }))
    .min(1, "Add at least one item to your list.")
    .max(80),
})

/** The signed-in customer of this shop, or why not. Every action starts here: the customer comes from the session cookie, never from the request. */
async function who() {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  if (!ctx || !billingState(ctx.dealer).hasAccess) return null
  const settings = readOrderSettings(ctx.dealer.orderSettings)
  if (!settings.monthly.enabled) return null
  const customer = await currentCustomer(ctx.dealer.id)
  return customer ? { dealer: ctx.dealer, ip: ctx.ip, customer, settings } : null
}

const signedOut: Fail = { ok: false, error: "Please sign in to continue." }

/** Saves the customer's list, day and address. Creates their plan the first time and edits it after. Nothing is ordered here: the shop's daily job orders on the chosen day. */
export async function saveMonthlyPlan(input: unknown): Promise<{ ok: true; next: string; bill: { subtotal: number; discount: number; deliveryFee: number; total: number } } | Fail> {
  const me = await who()
  if (!me) return signedOut
  const { dealer, customer, settings } = me
  if (!(await rateLimit(`monthly-save:${dealer.id}:${customer.id}`, 20, 10 * 60_000))) return { ok: false, error: "Too many changes. Please wait a few minutes." }

  const parsed = planSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") }
  }
  const data = parsed.data
  const db = scopedDb(dealer.id)

  // Price it exactly as the monthly job will, so a list that could never be ordered (unknown pincode, below the minimum) is refused now.
  const [items, zones] = await Promise.all([
    db.menuItems.select(inArray(menuItems.id, [...new Set(data.lines.map((l) => l.itemId))])),
    db.deliveryZones.select(eq(deliveryZones.isActive, true), { orderBy: [asc(deliveryZones.createdAt)] }),
  ])
  const priced = priceOrder(
    { lines: data.lines, fulfilment: "delivery", address: data.address, pincode: data.pincode },
    items.map((i) => ({ id: i.id, name: i.name, price: i.price, portions: i.portions, isAvailable: i.isAvailable, stock: null })),
    settings,
    null,
    false,
    new Date(),
    zones.map((z) => ({ id: z.id, name: z.name, pincodes: z.pincodes, fee: z.fee, minOrder: z.minOrder, etaMinutes: z.etaMinutes, isActive: z.isActive })),
    readServiceArea(dealer.serviceArea)?.radiusKm == null,
  )
  if (!priced.ok) return { ok: false, error: priced.error, field: priced.field }
  const bill = monthlyBill(priced.subtotal, priced.deliveryFee, settings.monthly)

  const now = new Date()
  const [existing] = await db.monthlyPlans.select(eq(monthlyPlans.customerId, customer.id), { limit: 1 })
  const dayChanged = !existing || existing.deliveryDay !== data.deliveryDay
  const fields = { name: data.name, deliveryDay: data.deliveryDay, address: data.address, pincode: data.pincode, note: data.note, updatedAt: now }

  const plan = await scopedTransaction(dealer.id, async (tx) => {
    let id: string
    let lastCycle: string | null
    if (existing) {
      id = existing.id
      // Changing the day re-decides whether this month's delivery still lies ahead. A cancelled plan that is saved again starts afresh.
      lastCycle = dayChanged || existing.status === "cancelled" ? startingCycle(data.deliveryDay, now) : existing.lastCycle
      await tx.monthlyPlans.update({ ...fields, lastCycle, lastError: null, status: existing.status === "cancelled" ? "active" : existing.status }, eq(monthlyPlans.id, id))
      await tx.monthlyPlanItems.delete(eq(monthlyPlanItems.planId, id))
    } else {
      lastCycle = startingCycle(data.deliveryDay, now)
      const [row] = await tx.monthlyPlans.insert({ ...fields, customerId: customer.id, status: "active", lastCycle }).returning({ id: monthlyPlans.id })
      id = row.id
    }
    for (const l of data.lines) await tx.monthlyPlanItems.insert({ planId: id, itemId: l.itemId, portion: l.portion, qty: l.qty })
    return { lastCycle }
  })

  revalidatePath("/monthly")
  return { ok: true, next: formatDate(nextDelivery({ deliveryDay: data.deliveryDay, lastCycle: plan.lastCycle }, now)), bill }
}

/** Pause, resume or cancel. The list is kept, so a paused or cancelled plan can be picked up again. */
export async function setMonthlyStatus(status: "active" | "paused" | "cancelled"): Promise<{ ok: true } | Fail> {
  const me = await who()
  if (!me) return signedOut
  if (!z.enum(["active", "paused", "cancelled"]).safeParse(status).success) return { ok: false, error: "Something went wrong." }
  const db = scopedDb(me.dealer.id)
  const [plan] = await db.monthlyPlans.select(eq(monthlyPlans.customerId, me.customer.id), { limit: 1 })
  if (!plan) return { ok: false, error: "You do not have a monthly list yet." }
  const now = new Date()
  // Resuming never orders for a day that has already passed: it starts from the next one.
  const lastCycle = status === "active" && plan.status !== "active" ? startingCycle(plan.deliveryDay, now) : plan.lastCycle
  await db.monthlyPlans.update({ status, lastCycle, lastError: null, updatedAt: now }, eq(monthlyPlans.id, plan.id))
  revalidatePath("/monthly")
  return { ok: true }
}
