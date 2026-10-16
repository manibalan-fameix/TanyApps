import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { LinkTabs } from "@/components/super/link-tabs"
import { PartnersGrid, ZonesGrid } from "@/components/super/super-grids"
import { loadPartners, loadZones } from "@/lib/super/queries"

export const metadata = { title: "Delivery" }

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const tab = (await searchParams).tab === "zones" ? "zones" : "riders"
  const [partners, zones] = await Promise.all([loadPartners(), loadZones()])
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Delivery"
        description="Riders and delivery zones across every restaurant."
      />
      <LinkTabs
        base="/super/delivery"
        active={tab}
        tabs={[
          { key: "riders", label: "Riders", count: partners.length },
          { key: "zones", label: "Zones", count: zones.length },
        ]}
      />
      {tab === "riders" ? (
        partners.length ? (
          <PartnersGrid rows={partners} />
        ) : (
          <EmptyState
            title="No riders yet"
            body="Riders appear when a restaurant adds one."
          />
        )
      ) : zones.length ? (
        <ZonesGrid rows={zones} />
      ) : (
        <EmptyState
          title="No zones yet"
          body="Zones appear when a restaurant sets up delivery areas."
        />
      )}
    </div>
  )
}
