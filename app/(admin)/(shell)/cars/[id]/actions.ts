"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { bookings } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { canRefund, REFUND_DENIED } from "@/lib/core/permissions"
import { rateLimit } from "@/lib/core/rate-limit"
import { startDealerRefund } from "@/lib/bookings/service"

type Result = { ok: true; refund: "pending" | "processed" } | { ok: false; error: string }

/**
 * Refunds a paid booking token. Labelled "refundable booking token" to the buyer, so this must work. The refund is saved as owed
 * before Razorpay is called, so a crash or a Razorpay outage never loses it; clicking again, or the cron job, finishes it.
 */
export async function refundBooking(bookingId: string): Promise<Result> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return { ok: false, error: "Please sign in again." }
  // Authorization first, on the server, before anything is read or changed.
  if (!canRefund(ctx.role)) return { ok: false, error: REFUND_DENIED }
  if (!z.string().uuid().safeParse(bookingId).success) return { ok: false, error: "Booking not found." }
  if (!(await rateLimit(`refund-booking:${ctx.user.id}`, 10, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }

  const res = await startDealerRefund(ctx.dealer.id, bookingId, ctx.user.id)
  if (res.ok) {
    const [booking] = await scopedDb(ctx.dealer.id).bookings.select(eq(bookings.id, bookingId), { limit: 1 })
    if (booking) revalidatePath(`/cars/${booking.carId}`)
  }
  return res
}
