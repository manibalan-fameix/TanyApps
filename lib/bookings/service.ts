import { eq } from "drizzle-orm"

import { unscopedDb, type Db } from "../db/client"
import { bookings, cars } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { getDealerRouteAccountByAccountId, updateDealerRouteAccount } from "../tenant/route"

/**
 * Marks a booking paid and moves the car on hold for it. Called by both the checkout confirm
 * action and the webhook, so either can arrive first — safe to run more than once for the same
 * payment (a booking already `paid` is left untouched).
 */
export async function applyBookingPayment(orderId: string, paymentId: string): Promise<{ applied: boolean }> {
  const [booking] = await unscopedDb.select().from(bookings).where(eq(bookings.razorpayOrderId, orderId)).limit(1)
  if (!booking || booking.status === "paid") return { applied: false }

  await unscopedDb.transaction(async (tx) => {
    const db = scopedDb(booking.dealerId, tx as unknown as Db)
    const [lead] = await db.leads.insert({
      carId: booking.carId,
      name: booking.buyerName,
      phone: booking.buyerPhone,
      source: "hold",
      status: "won",
      consentAt: new Date(),
    }).returning()
    await db.bookings.update({ status: "paid", paidAt: new Date(), razorpayPaymentId: paymentId, ...(lead ? { leadId: lead.id } : {}) }, eq(bookings.id, booking.id))
    await db.cars.update({ status: "on_hold" }, eq(cars.id, booking.carId))
  })
  return { applied: true }
}

/** Reconciles a Route linked account's activation status onto its dealer. */
export async function applyAccountStatus(accountId: string, status: string): Promise<{ applied: boolean }> {
  const dealer = await getDealerRouteAccountByAccountId(accountId)
  if (!dealer) return { applied: false }
  await updateDealerRouteAccount(dealer.id, { razorpayAccountStatus: status })
  return { applied: true }
}
