"use client"

import {
  confirmBooking,
  type BookingCheckout,
} from "@/app/(tenant)/sites/[dealer]/[carSlug]/actions"

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
type RazorpayCheckout = { open(): void }
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const s = document.createElement("script")
    s.src = "https://checkout.razorpay.com/v1/checkout.js"
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

export type BookingPaymentResult =
  | "done" // paid and confirmed
  | "dismissed" // the buyer closed the popup, or every attempt failed and they gave up
  | "unconfirmed" // paid, but our server could not confirm yet: the webhook will catch up
  | "unavailable" // Razorpay could not be loaded

/** Opens Razorpay Checkout to pay a car's booking amount. */
export async function authoriseBookingPayment(
  checkout: BookingCheckout,
  options: {
    carSlug: string
    description: string
    color: string
    prefill?: { name?: string; contact?: string }
  }
): Promise<BookingPaymentResult> {
  if (!(await loadRazorpay()) || !window.Razorpay) return "unavailable"
  return new Promise((resolve) => {
    const rz = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount * 100,
      currency: "INR",
      name: "TanyApps",
      description: options.description,
      prefill: options.prefill,
      theme: { color: options.color },
      handler: async (r: RazorpayResponse) => {
        const res = await confirmBooking({
          orderId: r.razorpay_order_id,
          paymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
          carSlug: options.carSlug,
        })
        resolve(res.ok ? "done" : "unconfirmed")
      },
      modal: { ondismiss: () => resolve("dismissed") },
    })
    rz.open()
  })
}
