import Link from "next/link"

import { OrderDetail, loadOrder, orderSubtitle } from "@/components/restaurant/order-detail"
import { OrderStatusBadge } from "@/components/restaurant/order-status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Order" }
export const dynamic = "force-dynamic"

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await loadOrder(params)
  const o = data.order
  return (
    <div className="grid max-w-2xl gap-4">
      <Link href="/orders" className="text-sm text-muted-foreground underline">All orders</Link>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Order {o.code} <OrderStatusBadge status={o.status} /></CardTitle>
          <CardDescription>{orderSubtitle(o)}</CardDescription>
        </CardHeader>
        <CardContent>
          <OrderDetail {...data} />
        </CardContent>
      </Card>
    </div>
  )
}
