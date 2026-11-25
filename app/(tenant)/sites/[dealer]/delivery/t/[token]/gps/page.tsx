import { RiderGps } from "@/app/(tenant)/sites/[dealer]/delivery/t/[token]/gps/rider-gps"
import { StorePage } from "@/components/restaurant/store/ui"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { readServiceArea } from "@/lib/restaurant/service-area"
import { orderByRiderToken } from "@/lib/restaurant/trip"

// Private, like the trip page: the secret is in the address, so never index it.
export const metadata = { title: "Delivery GPS", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function GpsPage({ params }: { params: Promise<{ dealer: string; token: string }> }) {
  const { token } = await params
  const { dealer } = await restaurantPage(params)
  const order = await orderByRiderToken(dealer.id, token)
  if (!order) {
    return (
      <StorePage className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">This delivery link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">The delivery may be finished or cancelled, or it was given to another rider. Please ask {dealer.displayName} for a new link.</p>
      </StorePage>
    )
  }
  const area = readServiceArea(dealer.serviceArea)
  return (
    <RiderGps
      token={token}
      restaurant={{ name: dealer.displayName, lat: area?.lat ?? null, lng: area?.lng ?? null }}
      order={{
        code: order.code,
        customerName: order.customerName,
        address: order.address ?? "",
        pincode: order.pincode ?? "",
        status: order.status,
        lat: order.latitude,
        lng: order.longitude,
      }}
    />
  )
}
