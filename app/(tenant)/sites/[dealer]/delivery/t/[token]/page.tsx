import { eq } from "drizzle-orm"

import { RiderTrip } from "@/app/(tenant)/sites/[dealer]/delivery/t/[token]/rider-trip"
import { StorePage } from "@/components/restaurant/store/ui"
import { deliveryPartners } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { readServiceArea } from "@/lib/restaurant/service-area"
import { orderByRiderToken } from "@/lib/restaurant/trip"

// A private page: it carries a secret in its address, so it is never indexed. The default referrer policy sends other sites only the origin, never this path (and OpenStreetMap needs a Referer to serve tiles).
export const metadata = { title: "Delivery", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function TripPage({ params }: { params: Promise<{ dealer: string; token: string }> }) {
  const { token } = await params
  const { dealer } = await restaurantPage(params)
  const order = await orderByRiderToken(dealer.id, token)
  if (!order) {
    return (
      <StorePage className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">This delivery link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">The delivery may be finished or cancelled, or it was given to another rider. Please ask {dealer.displayName} for a new link.</p>
        {dealer.phone ? <a href={`tel:${dealer.phone}`} className="mt-4 inline-block font-medium underline">Call {dealer.displayName}</a> : null}
      </StorePage>
    )
  }
  const [rider] = order.partnerId ? await scopedDb(dealer.id).deliveryPartners.select(eq(deliveryPartners.id, order.partnerId), { limit: 1 }) : []
  const area = readServiceArea(dealer.serviceArea)
  return (
    <StorePage className="max-w-xl">
      <RiderTrip
        token={token}
        restaurant={{ name: dealer.displayName, phone: dealer.phone, lat: area?.lat ?? null, lng: area?.lng ?? null }}
        riderName={rider?.name ?? "Rider"}
        order={{
          code: order.code,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          address: order.address ?? "",
          pincode: order.pincode ?? "",
          note: order.note,
          items: order.lines.map((l) => `${l.qty}× ${l.name}${l.portion ? ` (${l.portion})` : ""}`).join(", "),
          total: order.total,
          cash: order.paymentMethod === "cod" && order.paymentStatus !== "paid",
          status: order.status,
          lat: order.latitude,
          lng: order.longitude,
        }}
      />
    </StorePage>
  )
}
