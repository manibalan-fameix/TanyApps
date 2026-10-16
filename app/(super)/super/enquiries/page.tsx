import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { EnquiriesGrid } from "@/components/super/super-grids"
import { loadEnquiries } from "@/lib/super/queries"

export const metadata = { title: "Enquiries" }

export default async function Page() {
  const rows = await loadEnquiries()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Enquiries"
        description="Messages guests sent to restaurants through their page."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          body="Enquiries appear when a guest sends a message."
        />
      ) : (
        <EnquiriesGrid rows={rows} />
      )}
    </div>
  )
}
