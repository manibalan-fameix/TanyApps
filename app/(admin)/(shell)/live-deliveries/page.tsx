import Link from "next/link"
import { asc, inArray } from "drizzle-orm"

import { LiveBoard } from "@/components/restaurant/live-board"
import { fetchLiveDeliveries } from "@/lib/restaurant/admin-actions"
import { AutoRefresh } from "@/components/restaurant/auto-refresh"
import { PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { STATUS_LABEL, type OrderStatus } from "@/lib/restaurant/orders"
import { cn } from "@/lib/utils"

export const metadata = { title: "Live deliveries" }
export const dynamic = "force-dynamic"

const minutesAgo = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000))
const since = (d: Date) => {
  const m = minutesAgo(d)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export default async function LiveDeliveriesPage() {
  const { dealer } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const board = await fetchLiveDeliveries()
  const [rows, partners] = await Promise.all([
    db.orders.select(inArray(orders.status, ["new", "confirmed", "preparing", "ready", "out_for_delivery"]), { orderBy: [asc(orders.createdAt)] }),
    db.deliveryPartners.select(),
  ])
  const rider = new Map(partners.map((p) => [p.id, p]))
  const delivery = rows.filter((o) => o.fulfilment === "delivery")
  const out = delivery.filter((o) => o.status === "out_for_delivery")
  const waiting = delivery.filter((o) => o.status !== "out_for_delivery" && !o.partnerId)
  const ready = delivery.filter((o) => o.status !== "out_for_delivery" && o.partnerId)

  const card = (o: (typeof delivery)[number]) => {
    const p = o.partnerId ? rider.get(o.partnerId) : null
    return (
      <Link key={o.id} href={`/orders/${o.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{o.code} · {o.customerName}</p>
            <p className="truncate text-sm text-muted-foreground">{o.address}{o.pincode ? ` · ${o.pincode}` : ""}</p>
          </div>
          <Badge variant={o.status === "out_for_delivery" ? "default" : "secondary"}>{STATUS_LABEL[o.status as OrderStatus]}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{p ? `${p.name} · ${p.phone}` : "No rider yet"}</span>
          <span>{o.status === "out_for_delivery" ? `Out for ${since(o.updatedAt)}` : `Placed ${since(o.createdAt)} ago`}</span>
        </div>
      </Link>
    )
  }

  const section = (title: string, hint: string, list: typeof delivery, empty: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title} <span className="text-sm font-normal text-muted-foreground">({list.length})</span></CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>{list.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map(card)}</div>}</CardContent>
    </Card>
  )

  return (
    <div className="flex w-full flex-col gap-4">
      <AutoRefresh seconds={30} />
      <PageHeader title="Live deliveries" description="Delivery orders in progress. This page refreshes every 30 seconds.">
        <Link href="/delivery-partners" className={cn(buttonVariants({ variant: "outline" }))}>Delivery partners</Link>
      </PageHeader>
      {board.ok ? <LiveBoard initial={board} /> : null}
      {section("Out for delivery", "On the road right now.", out, "No orders are out for delivery.")}
      {section("Waiting for a rider", "Open the order and assign a delivery partner.", waiting, "Every delivery order has a rider.")}
      {section("Rider assigned", "Being prepared. Mark out for delivery when the rider leaves.", ready, "Nothing waiting to leave.")}
    </div>
  )
}
