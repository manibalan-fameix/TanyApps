"use client"

import { confirmOrderPayment, type PaymentCheckout } from "@/app/(tenant)/sites/[dealer]/actions"

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
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

export type PayResult =
  | { status: "done"; code: string }
  | { status: "dismissed" } // the guest closed the popup
  | { status: "error"; message: string } // paid but could not be confirmed, was refunded, or Razorpay could not load

/** Opens Razorpay Checkout for a food order and confirms the payment on our server when it succeeds. */
export async function payWithRazorpay(checkout: PaymentCheckout, opts: { color: string; name: string; phone: string }): Promise<PayResult> {
  if (!(await loadRazorpay()) || !window.Razorpay) return { status: "error", message: "The payment window could not load. Check your connection and try again." }
  return new Promise((resolve) => {
    const rz = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount * 100,
      currency: "INR",
      name: checkout.name,
      description: checkout.description,
      prefill: { name: opts.name, contact: opts.phone },
      theme: { color: opts.color },
      handler: async (r: RazorpayResponse) => {
        const res = await confirmOrderPayment({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature })
        resolve(res.ok ? { status: "done", code: res.code } : { status: "error", message: res.error })
      },
      // A failed attempt keeps the popup open so the guest can retry; only closing it ends the flow.
      modal: { ondismiss: () => resolve({ status: "dismissed" }) },
    })
    rz.open()
  })
}
