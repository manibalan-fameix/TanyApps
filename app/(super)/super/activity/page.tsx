import { PageHeader } from "@/components/restaurant/page-header"
import { ListCard } from "@/components/super/metrics"
import { loadActivity } from "@/lib/super/queries"
import { fmtDateTime, label } from "@/lib/super/format"

export const metadata = { title: "Activity" }

export default async function ActivityPage() {
  const items = await loadActivity(80)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Activity"
        description="Sign-ups, leads, orders, paid bookings, reviews and enquiries as they happen."
      />
      <ListCard
        title="Latest events"
        hint="Newest first"
        empty="Nothing has happened yet."
        rows={items.map((x, i) => ({
          key: `${x.kind}${i}`,
          href: `/super/businesses/${x.businessId}`,
          primary: x.title,
          secondary: `${x.business}${x.detail ? ` · ${x.detail}` : ""}`,
          right: `${label(x.kind)} · ${fmtDateTime(x.at)}`,
        }))}
      />
    </div>
  )
}
