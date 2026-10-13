import { asc, inArray } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { NewPartnerButton, type PartnerRow, PartnersGrid } from "@/components/restaurant/ops-grids"
import { deliveryPartners, orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { tenantUrl } from "@/lib/env"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Delivery partners" }
export const dynamic = "force-dynamic"

export default async function DeliveryPartnersPage() {
  const { dealer, owner } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [partners, active] = await Promise.all([
    db.deliveryPartners.select(undefined, { orderBy: [asc(deliveryPartners.code)] }),
    db.orders.select(inArray(orders.status, ["confirmed", "preparing", "ready", "out_for_delivery"])),
  ])
  const current = new Map<string, string>()
  for (const o of active) if (o.partnerId) current.set(o.partnerId, o.code)
  const base = tenantUrl(dealer.slug).replace(/\/$/, "")
  const rows: PartnerRow[] = partners.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    vehicle: p.vehicleNumber,
    status: p.isActive ? "active" : "paused",
    current: current.get(p.id) ?? null,
    hasPin: p.pinHash !== null,
    link: `${base}/delivery/${p.code}`,
  }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Delivery partners" description="Your riders. Give delivery orders to them from the order page. Each rider signs in with their PIN on their own link.">
        {owner ? <NewPartnerButton /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No delivery partners yet" body="Add a rider so you can assign delivery orders to them." /> : <PartnersGrid rows={rows} owner={owner} />}
    </div>
  )
}
