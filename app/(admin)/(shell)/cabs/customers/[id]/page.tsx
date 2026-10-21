import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadCustomerDetail } from "@/lib/cabs/booking-admin-data"
import { formatPaise } from "@/lib/cabs/money"
import { OPERATOR_STATUS, STATUS_TONE } from "@/lib/cabs/trip-labels"
import { effectiveTotalPaise } from "@/lib/cabs/trips"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Customer" }
export const dynamic = "force-dynamic"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { dealer } = await requireIndustry("cabs")
  const d = await loadCustomerDetail(scopedDb(dealer.id), id)
  if (!d) notFound()
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PageHeader title={d.customer.name || d.customer.phone} description={`${d.customer.phone} · ${d.customer.language === "ta" ? "Tamil" : "English"} · joined ${when(d.customer.joinedAt)}`}>
        {d.customer.verified ? <Badge>Phone verified</Badge> : <Badge variant="outline">Not verified</Badge>}
      </PageHeader>
      <Card>
        <CardHeader><CardTitle>Bookings ({d.trips.length})</CardTitle></CardHeader>
        <CardContent>
          {d.trips.length === 0 ? <p className="text-sm text-muted-foreground">No bookings yet.</p> : null}
          <ul className="flex flex-col divide-y">
            {d.trips.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <Link href={`/cabs/bookings/${t.id}`} className="font-mono font-semibold underline-offset-4 hover:underline">{t.code}</Link>
                  <span className="ml-2">{[t.pickup, t.drop].filter(Boolean).join(" → ")}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">{when(t.startAt)} · {formatPaise(effectiveTotalPaise(t))}</span>
                </span>
                <Badge variant={STATUS_TONE[t.status]}>{OPERATOR_STATUS[t.status]}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
