import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { LeadsGrid } from "@/components/super/super-grids"
import { loadLeads } from "@/lib/super/data"

export const metadata = { title: "Leads" }

export default async function Page() {
  const rows = await loadLeads()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Every buyer enquiry across all dealers. Phone numbers show the last four digits only."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No leads yet"
          body="Leads appear when a buyer enquires on a car."
        />
      ) : (
        <LeadsGrid rows={rows} />
      )}
    </div>
  )
}
