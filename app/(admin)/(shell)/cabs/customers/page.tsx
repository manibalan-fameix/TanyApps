import Link from "next/link"

import { PageHeader, EmptyState } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Last pickup</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/cabs/customers/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.name || "—"}</Link>
                    {c.verified ? null : <Badge variant="outline" className="ml-2">Not verified</Badge>}
                  </TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell className="tabular-nums">{c.trips}</TableCell>
                  <TableCell>{day(c.lastTripAt)}</TableCell>
                  <TableCell>{day(c.joinedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
