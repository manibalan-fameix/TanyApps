import { asc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { NewZoneButton, type ZoneRow, ZonesGrid } from "@/components/restaurant/ops-grids"
import { deliveryZones } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { readServiceArea } from "@/lib/restaurant/service-area"

export const metadata = { title: "Delivery zones" }
export const dynamic = "force-dynamic"

export default async function DeliveryZonesPage() {
  const { dealer, owner } = await requireRestaurant()
  const radiusKm = readServiceArea(dealer.serviceArea)?.radiusKm ?? null
  const all = await scopedDb(dealer.id).deliveryZones.select(undefined, { orderBy: [asc(deliveryZones.createdAt)] })
  const rows: ZoneRow[] = all.map((z) => ({
    id: z.id,
    name: z.name,
    pincodeText: z.pincodes.join(", "),
    pincodeCount: z.pincodes.length,
    fee: z.fee,
    minOrder: z.minOrder,
    etaMinutes: z.etaMinutes,
    status: z.isActive ? "active" : "paused",
  }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Delivery zones"
        description={
          radiusKm !== null
            ? `You deliver within ${radiusKm} km of your restaurant (Settings → Location & range), so zones only set the charge, minimum and time for the pincodes you list. An address outside every zone pays your default delivery charge.`
            : rows.some((r) => r.status === "active")
              ? "Guests can order delivery only to pincodes in an active zone. Each zone sets its own charge, minimum and time."
              : "No zones yet, so delivery is offered everywhere at the default charge from Settings → Ordering. Add a zone to limit delivery to the areas you serve."
        }
      >
        {owner ? <NewZoneButton /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No delivery zones" body="Add the pincodes you deliver to, with a charge for each area." /> : <ZonesGrid rows={rows} owner={owner} />}
    </div>
  )
}
