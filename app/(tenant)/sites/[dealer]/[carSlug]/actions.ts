"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { razorpayCredentials } from "@/lib/billing/razorpay"
import { applyBookingPayment } from "@/lib/bookings/service"
import { emptyMarketplaceDetails, marketplaceDetailsSchema } from "@/lib/cars/marketplace"
import { encrypt } from "@/lib/crypto"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { rateLimit } from "@/lib/core/rate-limit"
import { createBookingOrder, verifyBookingPaymentSignature } from "@/lib/route/razorpay"
import { getDealerBySlug } from "@/lib/tenant/dealer"

export type BookingCheckout = { orderId: string; keyId: string; amount: number }

const bookingInput = z.object({
  dealerSlug: z.string().trim().min(1),
  carSlug: z.string().trim().min(1),
  buyerName: z.string().trim().min(2, "Enter your name.").max(80),
  buyerPhone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
    .transform((v) => `+91${v.slice(-10)}`),
})

/** Creates a Razorpay order for a car's booking amount, transferring the full amount to the dealer. */
export async function createBooking(input: unknown): Promise<{ ok: true; checkout: BookingCheckout } | { ok: false; error: string }> {
  const parsed = bookingInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  const { dealerSlug, carSlug, buyerName, buyerPhone } = parsed.data

  if (!(await rateLimit(`booking:${buyerPhone}`, 5, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }

  const dealer = await getDealerBySlug(dealerSlug)
  if (!dealer) return { ok: false, error: "Dealer not found." }
  if (!dealer.razorpayAccountId || dealer.razorpayAccountStatus !== "activated") {
    return { ok: false, error: "Online booking is not set up for this dealer yet." }
  }

  const db = scopedDb(dealer.id)
  const [car] = await db.cars.select(eq(cars.slug, carSlug), { limit: 1 })
  if (!car || car.status !== "live") return { ok: false, error: "This car is no longer available." }

  const details = marketplaceDetailsSchema.safeParse(car.marketplaceDetails ?? emptyMarketplaceDetails())
  const bookingAmount = details.success ? details.data.pricing.bookingAmount : null
  if (!bookingAmount) return { ok: false, error: "This car has no booking amount set." }

  const creds = razorpayCredentials()
  if (!creds) return { ok: false, error: "Payments are not set up yet." }

  try {
    const order = await createBookingOrder({
      amount: bookingAmount,
      linkedAccountId: dealer.razorpayAccountId,
      notes: { dealer_id: dealer.id, car_id: car.id },
    })
    if (!order) return { ok: false, error: "Payments are not set up yet." }
    await db.bookings.insert({
      carId: car.id,
      buyerName,
      buyerPhone: encrypt(buyerPhone),
      amount: bookingAmount,
      razorpayOrderId: order.orderId,
      status: "created",
    })
    return { ok: true, checkout: { orderId: order.orderId, keyId: creds.keyId, amount: bookingAmount } }
  } catch (error) {
    console.error(`create booking failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "Could not start payment. Please try again." }
  }
}

/** Called after Checkout succeeds. The signature proves this order was actually paid. */
export async function confirmBooking(input: { orderId: string; paymentId: string; signature: string; carSlug: string }): Promise<{ ok: boolean }> {
  if (!(await verifyBookingPaymentSignature(input))) return { ok: false }
  try {
    const { applied } = await applyBookingPayment(input.orderId, input.paymentId)
    revalidatePath(`/${input.carSlug}`)
    return { ok: applied }
  } catch (error) {
    console.error(`confirm booking failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false }
  }
}
