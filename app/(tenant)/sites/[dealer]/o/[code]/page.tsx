import Link from "next/link"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { StorePage } from "@/components/restaurant/store/ui"
import { ReviewForm } from "@/components/restaurant/forms"
import { TrackLive } from "@/components/restaurant/store/track-live"
import { OrderSheet, StepLine } from "@/components/restaurant/store/order-sheet"
import { PayNow } from "@/components/restaurant/store/pay-now"
import { buttonVariants } from "@/components/ui/button"
import { deliveryPartners, orders, reviews } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { STATUS_MESSAGE, type OrderStatus, timelineFor } from "@/lib/restaurant/orders"
import { type Fulfilment, FULFILMENT_LABEL } from "@/lib/restaurant/settings"
import { expireUnpaidOrders } from "@/lib/restaurant/payments"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { cn } from "@/lib/utils"
import { isOrderIndustry } from "@/lib/verticals"

export const metadata = { title: "Your order" }
export const dynamic = "force-dynamic"

const STATUS_HEADLINE: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "Order placed",
  confirmed: "Order confirmed",
  preparing: "Preparing your food",
  ready: "Ready for you",
  out_for_delivery: "Heading to you",
  completed: "Delivered. Enjoy!",
  cancelled: "Order cancelled",
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

export default async function OrderPage({ params }: { params: Promise<{ dealer: string; code: string }> }) {
  const { dealer: slug, code } = await params
  const dealer = await getDealerBySlug(slug)
  if (!dealer || !isOrderIndustry(dealer.industry) || !/^[A-Za-z0-9]{6}$/.test(code)) notFound()
  await expireUnpaidOrders(dealer.id)
  const db = scopedDb(dealer.id)
  const [order] = await db.orders.select(eq(orders.code, code.toUpperCase()), { limit: 1 })
  if (!order) notFound()
  const status = order.status as OrderStatus
  const fulfilment = order.fulfilment as Fulfilment
  const steps = timelineFor(fulfilment)
  const at = steps.indexOf(status)
  const rider = order.partnerId && status === "out_for_delivery" ? (await db.deliveryPartners.select(eq(deliveryPartners.id, order.partnerId), { limit: 1 }))[0] : null
  const reviewed = status === "completed" ? (await db.reviews.count(eq(reviews.orderId, order.id))) > 0 : true

  const progress = (
    <>
      <div>
        <h1 role="status" className="text-2xl font-semibold tracking-tight">{status === "completed" && fulfilment !== "delivery" ? "Order completed" : STATUS_HEADLINE[status]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{STATUS_MESSAGE[status]}</p>
      </div>
      {status !== "cancelled" ? <StepLine steps={steps} at={at} /> : null}
    </>
  )

  return (
    <StorePage className="flex max-w-xl flex-col gap-0 sm:gap-6">
      <p className="pb-4 text-sm text-muted-foreground sm:pb-0">{dealer.displayName} · Order {order.code}</p>

      {status === "pending_payment" ? <PayNow code={order.code} total={order.total} name={order.customerName} phone={order.customerPhone} color={dealer.theme.primary} /> : null}
      {order.paymentStatus === "refunded" ? (
        <p className="rounded-xl border p-4 text-sm">
          {order.refundStatus === "failed"
            ? `We could not complete the refund of your payment of ₹${order.total.toLocaleString("en-IN")} automatically. The restaurant and Tany have been told and will sort it out; you do not need to pay again.`
            : order.refundStatus === "processed"
              ? `Your payment of ₹${order.total.toLocaleString("en-IN")} has been refunded. It can take 5 to 7 working days to show in your account.`
              : `Your payment of ₹${order.total.toLocaleString("en-IN")} is being refunded. It reaches your account in 5 to 7 working days.`}
        </p>
      ) : null}

      {order.fulfilment === "delivery" && status === "out_for_delivery" ? (
        <TrackLive code={order.code} status={status} initialRider={rider ? { name: rider.name, phone: rider.phone } : null}>
          {progress}
        </TrackLive>
      ) : (
        <OrderSheet className="-mx-4 rounded-none border-x-0 border-b px-4 shadow-none sm:mx-0 sm:rounded-3xl sm:border sm:p-5 sm:shadow-sm">{progress}</OrderSheet>
      )}

      <section className="-mx-4 border-b bg-card sm:mx-0 sm:rounded-3xl sm:border">
        <ul className="divide-y">
          {order.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 p-3 text-sm">
              <span>{l.qty} × {l.name}{l.portion ? ` (${l.portion})` : ""}</span>
              <span>{rupees(l.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-1 border-t p-3 text-sm">
          {order.discount > 0 ? <div className="flex justify-between"><dt>Discount</dt><dd>−{rupees(order.discount)}</dd></div> : null}
          {order.gst > 0 ? <div className="flex justify-between"><dt>GST</dt><dd>{rupees(order.gst)}</dd></div> : null}
          {order.deliveryFee > 0 ? <div className="flex justify-between"><dt>Delivery</dt><dd>{rupees(order.deliveryFee)}</dd></div> : null}
          {order.tip > 0 ? <div className="flex justify-between"><dt>Delivery partner tip</dt><dd>{rupees(order.tip)}</dd></div> : null}
          <div className="flex justify-between font-semibold"><dt>Total{order.paymentMethod === "online" ? (order.paymentStatus === "paid" ? " (paid online)" : order.paymentStatus === "refunded" ? " (refunded)" : " (to pay online)") : `, pay on ${fulfilment === "delivery" ? "delivery" : "pickup"}`}</dt><dd>{rupees(order.total)}</dd></div>
        </dl>
        <p className="border-t p-3 text-xs text-muted-foreground">
          {FULFILMENT_LABEL[fulfilment]}{order.address ? ` · ${order.address}` : ""}{order.pincode ? ` · ${order.pincode}` : ""}
        </p>
      </section>

      {status === "completed" && !reviewed ? <ReviewForm code={order.code} /> : null}

      <div className="flex gap-2 pt-5 sm:pt-0">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>Back to menu</Link>
        {dealer.phone ? <a href={`tel:${dealer.phone}`} className={cn(buttonVariants({ variant: "outline" }))}>Call us</a> : null}
      </div>
    </StorePage>
  )
}
