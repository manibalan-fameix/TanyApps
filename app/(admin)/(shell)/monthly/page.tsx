import { desc } from "drizzle-orm"

import { MonthlyOfferForm, type SubscriberRow, SubscribersTable } from "@/components/restaurant/monthly-admin"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { decrypt } from "@/lib/crypto"
import { monthlyPlans } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { formatDate, monthlyBill, nextDelivery } from "@/lib/restaurant/monthly"
import { readOrderSettings } from "@/lib/restaurant/settings"

export const metadata = { title: "Monthly groceries" }
export const dynamic = "force-dynamic"

export default async function MonthlyAdminPage() {
  const { dealer, owner } = await requireRestaurant()
  const settings = readOrderSettings(dealer.orderSettings)
  const db = scopedDb(dealer.id)
  const [plans, planItems, people, menu] = await Promise.all([
    db.monthlyPlans.select(undefined, { orderBy: [desc(monthlyPlans.createdAt)] }),
    db.monthlyPlanItems.select(),
    db.customers.select(),
    db.menuItems.select(),
  ])

  const priceOf = new Map(menu.map((m) => [m.id, m]))
  const phone = new Map(people.map((p) => [p.id, decrypt(p.phoneEnc, dealer.id).replace(/^\+91/, "+91 ")]))
  const now = new Date()
  const rows: SubscriberRow[] = plans.map((p) => {
    const mine = planItems.filter((i) => i.planId === p.id)
    const subtotal = mine.reduce((n, i) => {
      const m = priceOf.get(i.itemId)
      const price = m ? (i.portion ? (m.portions.find((x) => x.label === i.portion)?.price ?? m.price) : m.price) : 0
      return n + price * i.qty
    }, 0)
    return {
      id: p.id,
      name: p.name,
      phone: phone.get(p.customerId) ?? "",
      status: p.status as SubscriberRow["status"],
      deliveryDay: p.deliveryDay,
      next: p.status === "active" ? formatDate(nextDelivery(p, now)) : "Not scheduled",
      items: mine.reduce((n, i) => n + i.qty, 0),
      monthly: monthlyBill(subtotal, settings.deliveryFee, settings.monthly).total,
      pincode: p.pincode,
      problem: p.lastError,
    }
  })
  const active = rows.filter((r) => r.status === "active")

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Monthly groceries"
        description={settings.monthly.enabled ? `${active.length} active ${active.length === 1 ? "subscriber" : "subscribers"} · about ${`₹${active.reduce((n, r) => n + r.monthly, 0).toLocaleString("en-IN")}`} a month` : "Turn this on to let customers set up a list that you deliver every month."}
      />
      <section aria-labelledby="offer-title" className="rounded-2xl border bg-card p-5">
        <h2 id="offer-title" className="mb-4 text-base font-semibold">Subscriber offer</h2>
        <MonthlyOfferForm initial={settings.monthly} disabled={!owner} />
        {owner ? null : <p className="mt-3 text-sm text-muted-foreground">Only the owner can change the offer.</p>}
      </section>
      <section aria-labelledby="subs-title" className="flex flex-col gap-3">
        <h2 id="subs-title" className="text-base font-semibold">Subscribers</h2>
        {rows.length === 0 ? <EmptyState title="No subscribers yet" body="When a customer starts a monthly list it appears here, with the day it is delivered and what it comes to." /> : <SubscribersTable rows={rows} />}
      </section>
    </div>
  )
}
