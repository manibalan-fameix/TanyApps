import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { MenuGrid } from "@/components/super/super-grids"
import { loadMenu } from "@/lib/super/queries"

export const metadata = { title: "Menu items" }

export default async function Page() {
  const rows = await loadMenu()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Menu items"
        description="Every dish on every restaurant's menu."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No dishes yet"
          body="Dishes appear when a restaurant adds them."
        />
      ) : (
        <MenuGrid rows={rows} />
      )}
    </div>
  )
}
