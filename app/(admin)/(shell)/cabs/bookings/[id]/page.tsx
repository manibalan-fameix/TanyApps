import Link from "next/link"
import { notFound } from "next/navigation"

import { BookingOps } from "@/components/cabs/booking-ops"
import { FareLines } from "@/components/cabs/book/fare-lines"
import { PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { bookingMessage } from "@/lib/cabs/booking-copy"
import { formatPaise, paiseToRupeesText } from "@/lib/cabs/money"
import { loadTripDetail } from "@/lib/cabs/trip-data"
import { OPERATOR_EVENT, OPERATOR_STATUS, STATUS_TONE, tripTypeLabel } from "@/lib/cabs/trip-labels"
import { effectiveTotalPaise } from "@/lib/cabs/trips"
import { requireIndustry } from "@/lib/core/guards"
import { decrypt } from "@/lib/crypto"
import { customers } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { whatsappLink } from "@/lib/whatsapp"
import { eq } from "drizzle-orm"

export const metadata = { title: "Booking" }
export const dynamic = "force-dynamic"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { dealer } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const detail = await loadTripDetail(db, id)
  if (!detail) notFound()
  const { trip, events, fare } = detail
  const [customer] = await db.customers.select(eq(customers.id, trip.customerId), { limit: 1 })
  const phone = customer ? decrypt(customer.phoneEnc) : ""
  const total = effectiveTotalPaise(trip)

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PageHeader title={`Booking ${trip.code}`} description={`${tripTypeLabel(trip.tripType)} · ${trip.source.replace("_", " ")} booking`}>
        <Badge variant={STATUS_TONE[trip.status]} data-testid="op-booking-status">{OPERATOR_STATUS[trip.status]}</Badge>
      </PageHeader>

      <BookingOps id={trip.id} status={trip.status} currentRupees={paiseToRupeesText(total)} />

      <Card>
        <CardHeader><CardTitle>Trip</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{[trip.pickup, trip.drop].filter(Boolean).join(" → ")}</p>
          <p>Pickup: {when(trip.startAt)}</p>
          {trip.returnAt ? <p>Return: {when(trip.returnAt)}</p> : null}
          <p>{trip.pax} passengers, {trip.bags} bags · {trip.className}</p>
          {trip.notes ? <p className="text-muted-foreground">Notes: {trip.notes}</p> : null}
          {trip.holdExpiresAt && ["requested", "confirmed"].includes(trip.status) ? <p className="text-amber-700 dark:text-amber-300">Answer by {when(trip.holdExpiresAt)} or it is released.</p> : null}
          {trip.rejectReason ? <p className="text-muted-foreground">Rejected: {trip.rejectReason}</p> : null}
          {trip.cancelledReason ? <p className="text-muted-foreground">Cancelled: {trip.cancelledReason}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <Link href={`/cabs/customers/${trip.customerId}`} className="font-medium underline-offset-4 hover:underline">{customer?.name || "Customer"}</Link>
          </p>
          <p><a href={`tel:${phone}`} className="underline-offset-4 hover:underline">{phone}</a></p>
          {phone ? (
            <p>
              <a href={whatsappLink(phone, bookingMessage(customer?.language === "ta" ? "ta" : "en", trip.status === "rejected" ? "rejectedToCustomer" : "acceptedToCustomer", { code: trip.code, operator: dealer.displayName }))} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                Message on WhatsApp
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fare</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FareLines lines={fare.lines} totalPaise={trip.quoteTotalPaise} advanceDuePaise={trip.advanceDuePaise} notices={fare.notices} lang="en" />
          {trip.adjustedTotalPaise !== null ? <p className="text-sm" data-testid="adjusted-note">Agreed fare: <span className="font-semibold">{formatPaise(trip.adjustedTotalPaise)}</span>. Reason: {trip.adjustmentReason}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm" data-testid="op-timeline">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-4">
                <span>{OPERATOR_EVENT[e.type] ?? e.type}<span className="text-muted-foreground"> · {e.actorType}</span>{typeof e.data.reason === "string" ? <span className="text-muted-foreground"> · {e.data.reason}</span> : null}</span>
                <span className="whitespace-nowrap text-muted-foreground">{when(e.at)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
