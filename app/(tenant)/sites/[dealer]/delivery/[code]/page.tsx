import { notFound } from "next/navigation"

import { currentRider, riderOrders } from "@/app/(tenant)/sites/[dealer]/delivery/actions"
import { RiderOrders, RiderSignIn } from "@/app/(tenant)/sites/[dealer]/delivery/[code]/rider-view"
import { StorePage } from "@/components/restaurant/store/ui"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Delivery", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function RiderPage({ params }: { params: Promise<{ dealer: string; code: string }> }) {
  const { code } = await params
  if (!/^[A-Za-z0-9]{3,10}$/.test(code)) notFound()
  const { dealer } = await restaurantPage(params)
  const rider = await currentRider()
  const orders = rider ? await riderOrders() : null
  return (
    <StorePage className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{dealer.displayName} deliveries</h1>
      {rider && orders ? <RiderOrders name={rider.partner.name} orders={orders} /> : <RiderSignIn code={code.toUpperCase()} restaurant={dealer.displayName} />}
    </StorePage>
  )
}
