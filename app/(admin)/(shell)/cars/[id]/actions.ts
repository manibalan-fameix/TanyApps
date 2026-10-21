"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { getDealerContext } from "@/lib/auth/context"
import { bookings } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { rateLimit } from "@/lib/core/rate-limit"
import { refundBookingPayment } from "@/lib/route/razorpay"

type Result = { ok: true } | { ok: false; error: string }

/** Refunds a paid booking token. Labelled "refundable booking token" to the buyer, so this must work. */
export async function refundBooking(bookingId: string): Promise<Result> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return { ok: false, error: "Please sign in again." }
  if (!(await rateLimit(`refund-booking:${ctx.user.id}`, 10, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }

  const db = scopedDb(ctx.dealer.id)
  const [booking] = await db.bookings.select(eq(bookings.id, bookingId), { limit: 1 })
  if (!booking) return { ok: false, error: "Booking not found." }
  if (booking.status !== "paid") return { ok: false, error: "Only a paid booking can be refunded." }
  if (!booking.razorpayPaymentId) return { ok: false, error: "No payment recorded for this booking." }

  try {
    await refundBookingPayment(booking.razorpayPaymentId, booking.amount)
  } catch (error) {
    console.error(`refund booking failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "Could not refund right now. Please try again." }
  }
  await db.bookings.update({ status: "refunded", refundedAt: new Date() }, eq(bookings.id, bookingId))
  revalidatePath(`/cars/${booking.carId}`)
  return { ok: true }
}
