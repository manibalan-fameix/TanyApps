import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ActionButton } from "@/components/restaurant/action-button"
import { AssignPartner } from "@/components/restaurant/assign-partner"
import { BillDetails, BillRow, BillTotal } from "@/components/restaurant/bill-details"
import { PopupFooter } from "@/components/restaurant/popup"
import { STEP_ICON, StepLine } from "@/components/restaurant/store/order-sheet"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { deliveryPartners, orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { setOrderStatus, setPaymentStatus } from "@/lib/restaurant/admin-actions"
import { heldReasons } from "@/lib/restaurant/auto-confirm"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { mapsUrl } from "@/lib/restaurant/location"
import { STATUS_LABEL, type OrderStatus, nextStatuses, timelineFor } from "@/lib/restaurant/orders"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`
import { OrderReturnsBox } from "@/components/returns/order-returns-box"
import { returnsConfigured } from "@/lib/returns/rules"

/** One of the signed-in business's orders, or a 404. */
export async function loadOrder(params: Promise<{ id: string }>) {
  const { dealer } = await requireRestaurant()
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const [order] = await scopedDb(dealer.id).orders.select(eq(orders.id, id), { limit: 1 })
  if (!order) notFound()
  return { dealer, order }
}

/** When it was placed and how it is fulfilled, shown under the order's title. */
export const orderSubtitle = (o: { createdAt: Date; fulfilment: string }) =>
  `${o.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${FULFILMENT_LABEL[o.fulfilment as Fulfilment]}`

/**
 * Everything staff see and do on one order. The popup over the orders table and the full order page both render this.
 * Progress uses the same icons as the guest's tracking page.
 */
export async function OrderDetail({ dealer, order: o }: Awaited<ReturnType<typeof loadOrder>>) {
  const db = scopedDb(dealer.id)
  const partners = o.fulfilment === "delivery" ? await db.deliveryPartners.select(eq(deliveryPartners.isActive, true)) : []
  const rider = o.partnerId ? (await db.deliveryPartners.select(eq(deliveryPartners.id, o.partnerId), { limit: 1 }))[0] : null
  const status = o.status as OrderStatus
  const fulfilment = o.fulfilment as Fulfilment
  const closed = status === "completed" || status === "cancelled"
  const next = nextStatuses(status, fulfilment)
  const held = await heldReasons(dealer.id, o)
  const waText = encodeURIComponent(`Hi ${o.customerName}, this is ${dealer.displayName} about your order ${o.code}.`)
  return (
    <div className="grid gap-4">
      {status !== "cancelled" ? <StepLine steps={timelineFor(fulfilment)} at={timelineFor(fulfilment).indexOf(status)} /> : null}
      {status === "completed" && returnsConfigured(dealer.profile) ? <OrderReturnsBox dealerId={dealer.id} orderId={o.id} total={o.total} /> : null}
      {held.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Not confirmed automatically: check inventory</AlertTitle>
          <AlertDescription>
            {held.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </AlertDescription>
        </Alert>
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
            <a className="underline" target="_blank" rel="noreferrer" href={mapsUrl(o.latitude, o.longitude)}>Open the guest&apos;s delivery pin in Maps</a>
          </p>
        ) : null}
        {o.note ? <p className="mt-1 rounded-md bg-muted p-2">Note: {o.note}</p> : null}
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {o.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 p-3"><span>{l.qty} × {l.name}{l.portion ? ` (${l.portion})` : ""}</span><span>{rupees(l.price * l.qty)}</span></li>
        ))}
      </ul>
      <BillDetails id={`bill-${o.id}`} className="rounded-lg border p-3">
        <BillRow label="Item total" value={rupees(o.subtotal)} />
        {o.discount > 0 ? <BillRow label={`Coupon ${o.couponCode ?? ""}`} value={`−${rupees(o.discount)}`} tone="success" /> : null}
        {o.gst > 0 ? <BillRow label="GST" value={rupees(o.gst)} /> : null}
        {fulfilment === "delivery" ? <BillRow label="Delivery partner tip" value={rupees(o.tip)} /> : null}
        {fulfilment === "delivery" ? <BillRow label="Delivery fee" value={o.deliveryFee === 0 ? <span className="font-semibold text-success">FREE</span> : rupees(o.deliveryFee)} /> : null}
        <BillTotal label={o.paymentStatus === "paid" ? "Paid" : o.paymentStatus === "refunded" ? "Refunded" : "To pay"}>{rupees(o.total)}</BillTotal>
      </BillDetails>
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
      {next.length > 0 ? (
        <PopupFooter>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {next.map((s) => (
              <ActionButton
                key={s}
                action={setOrderStatus.bind(null, o.id, s)}
                variant={s === "cancelled" ? "destructive" : "default"}
                size="lg"
                className="min-w-44"
                confirm={s === "cancelled" ? "Cancel this order?" : undefined}
                success={`Order marked ${STATUS_LABEL[s].toLowerCase()}`}
              >
                <HugeiconsIcon icon={s === "cancelled" ? Cancel01Icon : STEP_ICON[s]} data-icon="inline-start" />
                {s === "cancelled" ? "Cancel order" : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
              </ActionButton>
            ))}
          </div>
        </PopupFooter>
      ) : null}
    </div>
  )
}
