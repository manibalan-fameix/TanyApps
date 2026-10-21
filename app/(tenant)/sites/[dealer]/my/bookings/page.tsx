import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { bookingText } from "@/lib/cabs/booking-copy"
import { customerPage, fmtIst } from "@/lib/cabs/customer-page"
import { formatPaise } from "@/lib/cabs/money"
import { loadCustomerTrips } from "@/lib/cabs/trip-data"
import { effectiveTotalPaise } from "@/lib/cabs/trips"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { requested: "secondary", confirmed: "default", rejected: "destructive", expired: "destructive", cancelled: "outline", no_show: "destructive" }

export default async function MyBookings({ params }: { params: Promise<{ dealer: string }> }) {
  const { db, lang, customer } = await customerPage(params, "/my/bookings")
  const t = bookingText(lang)
  const trips = await loadCustomerTrips(db, customer.id)
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.historyTitle}</h1>
      {trips.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">{t.historyEmpty}</p>
          <Link href="/" className={cn(buttonVariants())}>{t.bookACab}</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((tr) => (
            <li key={tr.id}>
              <Link href={`/my/bookings/${tr.id}`} data-testid={`trip-${tr.code}`}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold tracking-wider">{tr.code}</span>
                      <Badge variant={TONE[tr.status] ?? "default"}>{t[`st_${tr.status}` as const]}</Badge>
                    </div>
                    <p className="text-sm font-medium">{[tr.pickup, tr.drop].filter(Boolean).join(" → ")}</p>
                    <p className="text-xs text-muted-foreground">{fmtIst(tr.startAt, lang)} · {tr.className} · {formatPaise(effectiveTotalPaise(tr))}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
