import type { CSSProperties } from "react"
import { desc, eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { MonthlyBuilder, type MonthlyPlanView } from "@/components/restaurant/store/monthly-builder"
import { MonthlyPitch } from "@/components/restaurant/store/monthly-pitch"
import { currentCustomer } from "@/lib/core/login/customer"
import { monthlyPlanItems, monthlyPlans, orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { formatDate, nextDelivery } from "@/lib/restaurant/monthly"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { savedAddressesFor } from "@/lib/restaurant/saved-address-data"
import { themeToCssVars } from "@/lib/theme/tokens"

export const metadata = { title: "Monthly groceries" }
export const dynamic = "force-dynamic"

export default async function MonthlyPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const offer = store.settings.monthly
  if (!offer.enabled) notFound()

  const customer = await currentCustomer(dealer.id)
  if (!customer) return <MonthlyPitch offer={offer} shop={dealer.displayName} />

  const db = scopedDb(dealer.id)
  const [plan] = await db.monthlyPlans.select(eq(monthlyPlans.customerId, customer.id), { limit: 1 })
  let view: MonthlyPlanView | null = null
  if (plan) {
    const [items, history] = await Promise.all([
      db.monthlyPlanItems.select(eq(monthlyPlanItems.planId, plan.id)),
      db.orders.select(eq(orders.monthlyPlanId, plan.id), { orderBy: [desc(orders.createdAt)], limit: 6 }),
    ])
    view = {
      status: plan.status as MonthlyPlanView["status"],
      name: plan.name,
      deliveryDay: plan.deliveryDay,
      address: plan.address,
      pincode: plan.pincode,
      note: plan.note,
      lastError: plan.lastError,
      next: formatDate(nextDelivery(plan, new Date())),
      lines: items.map((i) => ({ itemId: i.itemId, portion: i.portion, qty: i.qty })),
      history: history.map((o) => ({ code: o.code, month: o.monthlyCycle ?? "", total: o.total, saved: o.discount, status: o.status })),
    }
  }

  const savedAddresses = await savedAddressesFor(dealer.id, customer.id)

  return (
    <MonthlyBuilder
      savedAddresses={savedAddresses}
      centre={store.serviceArea ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng } : null}
      themeVars={themeToCssVars(dealer.theme) as CSSProperties}
      dishes={store.dishes}
      categories={store.categories}
      offer={offer}
      deliveryFee={store.settings.deliveryFee}
      canOrder={store.canOrder}
      defaultName={customer.name ?? ""}
      plan={view}
    />
  )
}
