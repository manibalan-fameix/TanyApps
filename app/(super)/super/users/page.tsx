import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { UsersGrid } from "@/components/super/super-grids"
import { loadUsers } from "@/lib/super/data"

export const metadata = { title: "Users" }

export default async function Page() {
  const rows = await loadUsers()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Users"
        description="Everyone with a Tany login, and the business they belong to."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No users yet"
          body="People appear here when they sign up."
        />
      ) : (
        <UsersGrid rows={rows} />
      )}
    </div>
  )
}
