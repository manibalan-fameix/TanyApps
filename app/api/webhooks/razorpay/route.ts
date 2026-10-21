import { NextResponse } from "next/server"

import { verifyWebhookSignature, type RazorpaySubscription } from "@/lib/billing/razorpay"
import { applySubscription } from "@/lib/billing/service"
import { applyAccountStatus, applyBookingPayment } from "@/lib/bookings/service"
import { dispatchPaymentEvent, type PaymentHandlers } from "@/lib/core/payments/webhook"
import { applyOrderPayment } from "@/lib/restaurant/payments"

const paymentHandlers: PaymentHandlers = {
  eats_order: async (orderId, paymentId) => applyOrderPayment(orderId, paymentId),
  // applyBookingPayment is idempotent and reports only whether it changed anything, so a miss is not an error here.
  motors_booking: async (orderId, paymentId) => {
    const { applied } = await applyBookingPayment(orderId, paymentId)
    return { found: true, applied }
  },
}

// Razorpay sends events for every subscription, booking payment and Route account state change. Set the
// same secret in the Razorpay dashboard (Settings > Webhooks) and as RAZORPAY_WEBHOOK_SECRET.
// Active events: subscription.*, order.paid (primary, carries notes.kind), payment.captured (fallback), account.*.
// Enable order.paid in BOTH the test and the live dashboard; without it every payment is handled by the payment.captured fallback.
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
      payment?: { entity?: { id: string; order_id: string } }
      order?: { entity?: { id: string; notes?: Record<string, unknown> | [] } }
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
    } else if (event.event === "order.paid" && payment?.order_id) {
      const notes = event.payload?.order?.entity?.notes
      await dispatchPaymentEvent({ source: "order.paid", orderId: payment.order_id, paymentId: payment.id, orderNotes: Array.isArray(notes) ? null : notes }, paymentHandlers) // Razorpay sends [] for no notes
    } else if (event.event === "payment.captured" && payment?.order_id) {
      await dispatchPaymentEvent({ source: "payment.captured", orderId: payment.order_id, paymentId: payment.id }, paymentHandlers)
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
