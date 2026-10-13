import Link from "next/link"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ActionButton } from "@/components/restaurant/action-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AssignPartner } from "@/components/restaurant/assign-partner"
import { deliveryPartners, orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { setOrderStatus, setPaymentStatus } from "@/lib/restaurant/admin-actions"
import { mapsUrl } from "@/lib/restaurant/location"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { STATUS_LABEL, type OrderStatus, nextStatuses } from "@/lib/restaurant/orders"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"

export const metadata = { title: "Order" }
export const dynamic = "force-dynamic"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { dealer } = await requireRestaurant()
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const db = scopedDb(dealer.id)
  const [o] = await db.orders.select(eq(orders.id, id), { limit: 1 })
  if (!o) notFound()
  const partners = o.fulfilment === "delivery" ? await db.deliveryPartners.select(eq(deliveryPartners.isActive, true)) : []
  const rider = o.partnerId ? (await db.deliveryPartners.select(eq(deliveryPartners.id, o.partnerId), { limit: 1 }))[0] : null
  const closed = o.status === "completed" || o.status === "cancelled"
  const next = nextStatuses(o.status as OrderStatus, o.fulfilment as Fulfilment)
  const waText = encodeURIComponent(`Hi ${o.customerName}, this is ${dealer.displayName} about your order ${o.code}.`)
  return (
    <div className="grid max-w-2xl gap-4">
      <Link href="/orders" className="text-sm text-muted-foreground underline">All orders</Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Order {o.code} <Badge>{STATUS_LABEL[o.status as OrderStatus]}</Badge></CardTitle>
          <CardDescription>{o.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {FULFILMENT_LABEL[o.fulfilment as Fulfilment]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {next.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <ActionButton
                  key={s}
                  action={setOrderStatus.bind(null, o.id, s)}
                  variant={s === "cancelled" ? "ghost" : "default"}
                  confirm={s === "cancelled" ? "Cancel this order?" : undefined}
                  success={`Order marked ${STATUS_LABEL[s].toLowerCase()}`}
                >
                  {s === "cancelled" ? "Cancel order" : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                </ActionButton>
              ))}
            </div>
          ) : null}
          {o.fulfilment === "delivery" ? (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">Delivery partner</p>
              {partners.length === 0 && !rider ? (
                <p className="text-muted-foreground">No active delivery partners. Add one under Delivery Partners.</p>
              ) : (
                <AssignPartner orderId={o.id} current={o.partnerId} disabled={closed} partners={[...partners, ...(rider && !partners.some((p) => p.id === rider.id) ? [rider] : [])].map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))} />
              )}
              {rider ? <p className="text-muted-foreground">{rider.name} · <a className="underline" href={`tel:${rider.phone}`}>{rider.phone}</a>{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ""}</p> : null}
            </div>
          ) : null}
          <div className="text-sm">
            <p className="font-medium">{o.customerName}</p>
            <p><a className="underline" href={`tel:${o.customerPhone}`}>{o.customerPhone}</a> · <a className="underline" target="_blank" rel="noreferrer" href={`https://wa.me/${o.customerPhone.replace(/\D/g, "")}?text=${waText}`}>WhatsApp</a></p>
            {o.address ? <p className="text-muted-foreground">{o.address}{o.pincode ? ` · ${o.pincode}` : ""}{o.zoneName ? ` (${o.zoneName})` : ""}</p> : null}
            {o.latitude !== null && o.longitude !== null ? (
              <p>
                <a className="underline" target="_blank" rel="noreferrer" href={mapsUrl(o.latitude, o.longitude)}>Open the guest&apos;s live location in Maps</a>
              </p>
            ) : null}
            {o.note ? <p className="mt-1 rounded-md bg-muted p-2">Note: {o.note}</p> : null}
          </div>
          <ul className="divide-y rounded-lg border text-sm">
            {o.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 p-3"><span>{l.qty} × {l.name}{l.portion ? ` (${l.portion})` : ""}</span><span>{rupees(l.price * l.qty)}</span></li>
            ))}
          </ul>
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between"><dt>Items</dt><dd>{rupees(o.subtotal)}</dd></div>
            {o.discount > 0 ? <div className="flex justify-between"><dt>Coupon {o.couponCode}</dt><dd>−{rupees(o.discount)}</dd></div> : null}
            {o.deliveryFee > 0 ? <div className="flex justify-between"><dt>Delivery</dt><dd>{rupees(o.deliveryFee)}</dd></div> : null}
            <div className="flex justify-between font-semibold"><dt>Total (pay on {o.fulfilment === "delivery" ? "delivery" : "pickup"})</dt><dd>{rupees(o.total)}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              Payment: <Badge variant={o.paymentStatus === "paid" ? "default" : "secondary"} className="ml-1 capitalize">{o.paymentStatus}</Badge>{" "}
              <span className="text-muted-foreground">{o.paymentMethod === "online" ? `Online (Razorpay)${o.razorpayPaymentId ? ` · ${o.razorpayPaymentId}` : ""}` : "Cash"}</span>
              {o.paymentStatus === "refunded" && o.refundedAt ? <span className="text-muted-foreground"> · refunded {o.refundedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> : null}
            </span>
            {o.paymentMethod === "cod" && o.status !== "cancelled" ? (
              <ActionButton action={setPaymentStatus.bind(null, o.id, o.paymentStatus === "paid" ? "pending" : "paid")} success={o.paymentStatus === "paid" ? "Marked unpaid" : "Marked paid"}>
                {o.paymentStatus === "paid" ? "Mark unpaid" : "Mark paid"}
              </ActionButton>
            ) : null}
          </div>
          {o.paymentMethod === "online" && o.paymentStatus === "paid" && o.status !== "completed" && o.status !== "cancelled" ? (
            <p className="text-xs text-muted-foreground">Cancelling this order refunds the guest in full and takes the amount back from your payouts.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
