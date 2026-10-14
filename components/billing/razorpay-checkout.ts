"use client"

import {
  confirmSubscription,
  type Checkout,
} from "@/app/(admin)/(shell)/settings/billing/actions"

type RazorpayResponse = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
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

export type PaymentResult =
  | "done" // authorised and confirmed
  | "dismissed" // the owner closed the popup, or every attempt failed and they gave up
  | "unconfirmed" // paid, but our server could not confirm yet: the webhook will catch up
  | "unavailable" // Razorpay could not be loaded

/** Opens Razorpay Checkout to authorise the payment method. */
export async function authorisePayment(
  checkout: Checkout,
  options: {
    description: string
    color: string
    prefill?: { name?: string; contact?: string }
  }
): Promise<PaymentResult> {
  if (!(await loadRazorpay()) || !window.Razorpay) return "unavailable"
  return new Promise((resolve) => {
    const rz = new window.Razorpay!({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: "TanyApps",
      description: options.description,
      prefill: options.prefill,
      theme: { color: options.color },
      handler: async (r: RazorpayResponse) => {
        const res = await confirmSubscription({
          paymentId: r.razorpay_payment_id,
          subscriptionId: r.razorpay_subscription_id,
          signature: r.razorpay_signature,
        })
        resolve(res.ok ? "done" : "unconfirmed")
      },
      modal: { ondismiss: () => resolve("dismissed") },
    })
    // A failed attempt keeps the popup open so the owner can retry; only closing it ends the flow.
    rz.open()
  })
}
