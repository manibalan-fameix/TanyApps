import { NextResponse } from "next/server"

import { verifyWebhookSignature, type RazorpaySubscription } from "@/lib/billing/razorpay"
import { applySubscription } from "@/lib/billing/service"
import { applyAccountStatus, applyBookingPayment } from "@/lib/bookings/service"
import { dispatchCapturedPayment, type PaymentHandlers } from "@/lib/core/payments/webhook"
import { applyOrderPayment } from "@/lib/restaurant/payments"

const paymentHandlers: PaymentHandlers = {
  eats_order: async (orderId, paymentId) => applyOrderPayment(orderId, paymentId),
  // applyBookingPayment is idempotent and reports only whether it changed anything, so a miss is not an error here.
  motors_booking: async (orderId, paymentId) => {
    await applyBookingPayment(orderId, paymentId)
    return { found: true }
  },
}

// Razorpay sends events for every subscription, booking payment and Route account state change. Set the
// same secret in the Razorpay dashboard (Settings > Webhooks) and as RAZORPAY_WEBHOOK_SECRET.
// Active events: subscription.*, payment.captured, account.*.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 })

  const raw = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""
  if (!signature || !(await verifyWebhookSignature(raw, signature, secret))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 })
  }

  let event: {
    event?: string
    payload?: {
      subscription?: { entity?: RazorpaySubscription }
      payment?: { entity?: { id: string; order_id: string; notes?: Record<string, unknown> | [] } }
      account?: { entity?: { id: string; status: string } }
    }
  }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 })
  }

  try {
    const sub = event.payload?.subscription?.entity
    const payment = event.payload?.payment?.entity
    const account = event.payload?.account?.entity
    if (event.event?.startsWith("subscription.") && sub?.id) {
      await applySubscription(sub)
    } else if (event.event === "payment.captured" && payment?.order_id) {
      // Dispatch on notes.kind (set when the order was created). Orders from before kinds existed take the fallback path.
      const notes = Array.isArray(payment.notes) ? null : payment.notes // Razorpay sends [] when there are no notes
      await dispatchCapturedPayment({ orderId: payment.order_id, paymentId: payment.id, notes }, paymentHandlers)
    } else if (event.event?.startsWith("account.") && account?.id) {
      await applyAccountStatus(account.id, account.status)
    } else {
      return NextResponse.json({ ok: true, ignored: true })
    }
  } catch (error) {
    // A non-2xx makes Razorpay retry, which is what we want for a transient database error.
    console.error(`webhook ${event.event} failed: ${error instanceof Error ? error.message : "unknown"}`)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
