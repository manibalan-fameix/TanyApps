import Link from "next/link"
import { desc, eq, gte } from "drizzle-orm"
import {
  Restaurant01Icon,
  ShoppingBag01Icon,
  StarIcon,
  UserMultiple02Icon,
  Wallet01Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"

import { RestaurantCharts } from "@/components/restaurant/restaurant-charts"
import { StatCard, type StatCardProps } from "@/components/dashboard/stat-card"
import { WelcomeDialog } from "@/components/dashboard/welcome-dialog"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { enquiries, orders, reviews, type dealers } from "@/lib/db/schema"
import { expireUnpaidOrders } from "@/lib/restaurant/payments"
import { scopedDb } from "@/lib/db/scoped"
import { tenantUrl } from "@/lib/env"
import { type PlanKey, PLANS } from "@/lib/plans"
import { menuItemLimit } from "@/lib/restaurant/menu"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"
import { STATUS_LABEL, type OrderStatus } from "@/lib/restaurant/orders"
import { countBy, dailyOrders, startOfDayIst, summariseOrders, topDishes } from "@/lib/restaurant/stats"
import { summariseCustomers } from "@/lib/restaurant/customers"
import { cn } from "@/lib/utils"

const DAYS = 30
const n = (v: number) => v.toLocaleString("en-IN")
const money = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${n(v)}`)
const isRecent = (created: Date) => Date.now() - created.getTime() < 7 * 86_400_000

/** Same layout as the motors dashboard: welcome row, stat cards, charts, list cards, plan and page cards. */
export async function RestaurantDashboard({ dealer, role }: { dealer: typeof dealers.$inferSelect; role: string }) {
  const db = scopedDb(dealer.id)
  const since = new Date(startOfDayIst(new Date()).getTime() - (DAYS - 1) * 86_400_000)
  await expireUnpaidOrders(dealer.id)
  const [dishes, allRecent, newEnquiries, pendingReviews] = await Promise.all([
    db.menuItems.count(),
    db.orders.select(gte(orders.createdAt, since), { orderBy: [desc(orders.createdAt)], limit: 2000 }),
    db.enquiries.count(eq(enquiries.status, "new")),
    db.reviews.count(eq(reviews.status, "pending")),
  ])
  // An online order nobody has paid for yet is not on the list.
  const recent = allRecent.filter((o) => o.status !== "pending_payment")
  const plan = effectivePlanKey(dealer) as PlanKey
  const limit = menuItemLimit(plan)
  const billing = billingState(dealer)
  const stats = summariseOrders(recent)
  const customers = summariseCustomers(recent)
  const publicUrl = tenantUrl(dealer.slug)
  const billingNote =
    billing.phase === "trial"
      ? `Free trial · ${billing.daysLeft} ${billing.daysLeft === 1 ? "day" : "days"} left`
      : billing.phase === "suspended"
        ? "Offline · add payment"
        : billing.cancelling
          ? "Cancelled"
          : billing.phase === "grace"
            ? "Payment pending"
            : null

  const kpis: StatCardProps[] = [
    { icon: ShoppingBag01Icon, label: "New orders", value: String(stats.fresh), pill: `${stats.open} open`, href: "/orders" },
    { icon: Wallet01Icon, label: "Today's sales", value: money(stats.todayRevenue), pill: `${stats.todayOrders} ${stats.todayOrders === 1 ? "order" : "orders"}`, href: "/orders" },
    { icon: Wallet01Icon, label: "Last 7 days", value: money(stats.weekRevenue) },
    {
      icon: Restaurant01Icon,
      label: "Dishes on menu",
      value: limit === null ? String(dishes) : `${dishes} / ${limit}`,
      pill: limit === null ? "Unlimited" : undefined,
      progress: limit === null ? undefined : (dishes / limit) * 100,
      href: "/menu",
    },
    { icon: UserMultiple02Icon, label: `Guests · ${DAYS} days`, value: String(customers.length), pill: `${customers.filter((c) => c.orders > 1).length} returning`, href: "/customers" },
    { icon: StarIcon, label: "Reviews to approve", value: String(pendingReviews), pill: newEnquiries ? `${newEnquiries} new ${newEnquiries === 1 ? "message" : "messages"}` : undefined, href: "/reviews" },
  ]

  const top = topDishes(recent, 6)

  return (
    <div className="flex w-full flex-col gap-4">
      <WelcomeDialog
        dealerId={dealer.id}
        isNew={isRecent(dealer.createdAt)}
        name={dealer.displayName}
        planLabel={PLANS[plan].label}
        maxLiveCars={PLANS[plan].maxLiveCars}
        free={billing.phase === "free"}
        industry="restaurants"
        menuLimit={limit}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {dealer.displayName}</h1>
          <p className="text-sm text-muted-foreground">Here is how your restaurant is doing.</p>
        </div>
        <div className="flex gap-2">
          <a href={publicUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
            Open my menu page
          </a>
          <Link href="/menu/new" className={cn(buttonVariants())}>
            Add a dish
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <RestaurantCharts
        days={DAYS}
        daily={dailyOrders(recent, DAYS)}
        statuses={countBy(recent, (o) => o.status)}
        dishes={top.map((d) => ({ name: d.name, qty: d.qty }))}
        types={countBy(recent, (o) => FULFILMENT_LABEL[o.fulfilment as Fulfilment] ?? o.fulfilment).map((c) => ({ key: c.key, count: c.count }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Latest activity</CardDescription>
            <CardTitle className="text-base">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {recent.length === 0 ? (
              <p className="text-muted-foreground">No orders yet. Share your menu link to get started.</p>
            ) : (
              recent.slice(0, 5).map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:underline">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.customerName}</p>
                    <p className="truncate text-muted-foreground">
                      {o.code} · {o.lines.reduce((s, l) => s + l.qty, 0)} items · {money(o.total)}
                    </p>
                  </div>
                  <Badge variant={o.status === "new" ? "default" : "secondary"}>{STATUS_LABEL[o.status as OrderStatus]}</Badge>
                </Link>
              ))
            )}
            <Link href="/orders" className="pt-3 font-medium underline">
              See all orders
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Needs attention</CardDescription>
            <CardTitle className="text-base">Open inbox</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {[
              { icon: ShoppingBag01Icon, label: "Orders waiting for you", value: stats.fresh, href: "/orders" },
              { icon: StarIcon, label: "Reviews waiting for approval", value: pendingReviews, href: "/reviews" },
              { icon: Mail01Icon, label: "New messages", value: newEnquiries, href: "/enquiries" },
            ].map((r) => (
              <Link key={r.label} href={r.href} className="flex items-center justify-between gap-3 py-2 hover:underline">
                <span className="font-medium">{r.label}</span>
                <Badge variant={r.value > 0 ? "default" : "secondary"}>{r.value}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Plan</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {PLANS[plan].label}
              <Badge variant="secondary">{role}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {billingNote ? <p className="text-muted-foreground">{billingNote}</p> : null}
            <Link href="/settings/billing" className="font-medium underline">
              Manage billing
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Your public page</CardDescription>
            <CardTitle className="text-base font-medium break-all">{publicUrl}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
