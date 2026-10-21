import Link from "next/link"

import { PageHeader, EmptyState } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { INBOX_LABEL, INBOX_TABS, isInboxTab, loadInbox } from "@/lib/cabs/booking-admin-data"
import { formatPaise } from "@/lib/cabs/money"
import { OPERATOR_STATUS, STATUS_TONE } from "@/lib/cabs/trip-labels"
import { effectiveTotalPaise } from "@/lib/cabs/trips"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"
import { cn } from "@/lib/utils"

export const metadata = { title: "Bookings" }
export const dynamic = "force-dynamic"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { dealer } = await requireIndustry("cabs")
  const q = (await searchParams).tab
  const tab = isInboxTab(q) ? q : "new"
  const { rows, counts } = await loadInbox(scopedDb(dealer.id), tab, new Date())
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Bookings" description="Requests from your website and bookings you take yourself.">
        <Link href="/cabs/bookings/new" className={cn(buttonVariants())} data-testid="new-manual-booking">New booking</Link>
      </PageHeader>
      <nav className="flex flex-wrap gap-2" aria-label="Booking views">
        {INBOX_TABS.map((t) => (
          <Link key={t} href={`/cabs/bookings?tab=${t}`} data-testid={`inbox-${t}`} className={cn(buttonVariants({ variant: t === tab ? "default" : "outline", size: "sm" }), "gap-2")}>
            {INBOX_LABEL[t]}
            <span className="tabular-nums opacity-80">{counts[t]}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" body={tab === "new" ? "New requests from customers appear here the moment they are made." : "No bookings in this view."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid={`booking-row-${r.code}`}>
                  <TableCell>
                    <Link href={`/cabs/bookings/${r.id}`} className="font-mono font-semibold underline-offset-4 hover:underline">{r.code}</Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{when(r.startAt)}</TableCell>
                  <TableCell>
                    <span className="font-medium">{[r.pickup, r.drop].filter(Boolean).join(" → ")}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">{r.className} · {r.pax} pax</span>
                  </TableCell>
                  <TableCell>
                    {r.customerName || "—"}
                    <br />
                    <span className="text-xs text-muted-foreground">{r.customerPhone}</span>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatPaise(effectiveTotalPaise(r))}</TableCell>
                  <TableCell><Badge variant={STATUS_TONE[r.status]}>{OPERATOR_STATUS[r.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
