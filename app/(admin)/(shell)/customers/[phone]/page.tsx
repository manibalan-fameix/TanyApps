import Link from "next/link"
import { desc, eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { summariseCustomers } from "@/lib/restaurant/customers"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { STATUS_LABEL, type OrderStatus } from "@/lib/restaurant/orders"

export const metadata = { title: "Customer" }
export const dynamic = "force-dynamic"

export default async function CustomerPage({ params }: { params: Promise<{ phone: string }> }) {
  const { dealer } = await requireRestaurant()
  const phone = decodeURIComponent((await params).phone)
  if (!/^\+91[6-9]\d{9}$/.test(phone)) notFound()
  const rows = await scopedDb(dealer.id).orders.select(eq(orders.customerPhone, phone), { orderBy: [desc(orders.createdAt)], limit: 100 })
  const [c] = summariseCustomers(rows)
  if (!c) notFound()
  return (
    <div className="grid max-w-2xl gap-4">
      <Link href="/customers" className="text-sm text-muted-foreground underline">All customers</Link>
      <Card>
        <CardHeader>
          <CardTitle>{c.name}</CardTitle>
          <CardDescription><a href={`tel:${c.phone}`} className="underline">{c.phone}</a> · {c.orders} {c.orders === 1 ? "order" : "orders"} · ₹{c.spent.toLocaleString("en-IN")} spent</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={`/orders/${o.id}`} className="font-medium underline">{o.code}</Link>
                <span className="text-muted-foreground">{o.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                <Badge variant="secondary">{STATUS_LABEL[o.status as OrderStatus]}</Badge>
                <span>₹{o.total.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
