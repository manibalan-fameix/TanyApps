import Link from "next/link"

import { PageHeader, EmptyState } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { SimpleTable } from "@/components/data-table/simple-table"
import { loadCustomers } from "@/lib/cabs/booking-admin-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Customers" }
export const dynamic = "force-dynamic"

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—")

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { dealer } = await requireIndustry("cabs")
  const q = ((await searchParams).q ?? "").slice(0, 60)
  const rows = await loadCustomers(scopedDb(dealer.id), q)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Customers" description="People who have booked with you, or whom you have booked for." />
      <form className="flex max-w-sm gap-2" action="/cabs/customers">
        <input name="q" defaultValue={q} placeholder="Search by name or full mobile number" aria-label="Search customers" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No match" : "No customers yet"} body={q ? "Try the full 10-digit mobile number, or part of the name." : "Customers appear here after their first booking."} />
      ) : (
        <div>
          <SimpleTable
          columns={[{ title: "Name" }, { title: "Mobile" }, { title: "Bookings" }, { title: "Last pickup" }, { title: "Joined" }]}
          rows={rows.map((c) => ({
            id: c.id,
            cells: [
              <span key="name">
                <Link href={`/cabs/customers/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.name || "—"}</Link>
                {c.verified ? null : <Badge variant="outline" className="ml-2">Not verified</Badge>}
              </span>,
              c.phone,
              <span key="trips" className="tabular-nums">{c.trips}</span>,
              day(c.lastTripAt),
              day(c.joinedAt),
            ],
          }))}
        />
        </div>
      )}
    </div>
  )
}
