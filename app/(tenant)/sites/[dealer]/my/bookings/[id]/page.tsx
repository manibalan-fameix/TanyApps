import Link from "next/link"
import { notFound } from "next/navigation"

import { AutoRefresh } from "@/components/cabs/book/auto-refresh"
import { CancelBooking } from "@/components/cabs/book/booking-actions"
import { FareLines } from "@/components/cabs/book/fare-lines"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type MessageKey, bookingMessage, bookingText } from "@/lib/cabs/booking-copy"
import { customerPage, fmtIst } from "@/lib/cabs/customer-page"
import { formatPaise } from "@/lib/cabs/money"
import { loadTripDetail } from "@/lib/cabs/trip-data"
import { effectiveTotalPaise } from "@/lib/cabs/trips"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { requested: "secondary", confirmed: "default", rejected: "destructive", expired: "destructive", cancelled: "outline", no_show: "destructive" }

export default async function BookingPage({ params, searchParams }: { params: Promise<{ dealer: string; id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { dealer, db, lang, customer } = await customerPage(params, `/my/bookings/${id}`)
  const t = bookingText(lang)
  const detail = await loadTripDetail(db, id, customer.id)
  if (!detail) notFound()
  const { trip, events, fare } = detail
  const op = dealer.displayName
  const waiting = trip.status === "requested" || trip.status === "confirmed"
  const m = (k: MessageKey, p: Record<string, string> = {}) => bookingMessage(lang, k, { operator: op, ...p })
  const helpKey = `help_${trip.status}` as MessageKey
  const help = ["requested", "confirmed", "rejected", "expired", "cancelled"].includes(trip.status)
    ? m(helpKey, { time: trip.holdExpiresAt ? new Date(trip.holdExpiresAt).toLocaleTimeString(lang === "ta" ? "ta-IN" : "en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "" })
    : ""
  const total = effectiveTotalPaise(trip)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {waiting ? <AutoRefresh /> : null}
      {(await searchParams).new === "1" ? <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm" data-testid="new-booking">{m("newBooking", { code: trip.code })}</p> : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{t.bookingCode}</p>
          <p className="font-mono text-2xl font-semibold tracking-widest" data-testid="booking-code">{trip.code}</p>
        </div>
        <Badge variant={TONE[trip.status] ?? "default"} data-testid="booking-status">{t[`st_${trip.status}` as const]}</Badge>
      </div>

      {help ? <p className="text-sm text-muted-foreground" data-testid="booking-help">{help}</p> : null}

      <Card>
        <CardContent className="flex flex-col gap-1 p-4 text-sm">
          <p className="font-medium">{[trip.pickup, trip.drop].filter(Boolean).join(" → ")}</p>
          <p className="text-muted-foreground">{t.tripWhen.replace("{when}", fmtIst(trip.startAt, lang))}</p>
          {trip.returnAt ? <p className="text-muted-foreground">{t.returnLine.replace("{when}", fmtIst(trip.returnAt, lang))}</p> : null}
          <p className="text-muted-foreground">{t.passengersLine.replace("{pax}", String(trip.pax)).replace("{bags}", String(trip.bags))}</p>
          <p>{t.vehicle}: <span className="font-medium">{trip.className}</span></p>
          <p>{t.fare}: <span className="font-semibold tabular-nums">{formatPaise(total)}</span></p>
          {trip.adjustedTotalPaise !== null ? <p className="text-xs text-muted-foreground">{m("fareAgreed", { amount: formatPaise(trip.adjustedTotalPaise), reason: trip.adjustmentReason ?? "" })}</p> : null}
        </CardContent>
      </Card>

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t.fareBreakdown}</summary>
        <div className="pt-3">
          <FareLines lines={fare.lines} totalPaise={trip.quoteTotalPaise} advanceDuePaise={0} notices={fare.notices} lang={lang} />
        </div>
      </details>

      <section aria-label={t.statusTitle} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t.statusTitle}</h2>
        <ol className="flex flex-col gap-2 border-l pl-4" data-testid="timeline">
          {events.filter((e) => `ev_${e.type}` in t).map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
              <p>{m(`ev_${e.type}` as MessageKey)}</p>
              <p className="text-xs text-muted-foreground">{fmtIst(e.at, lang)}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-2">
        {dealer.phone ? (
          <a href={`tel:${dealer.phone}`} className={cn(buttonVariants({ variant: ["expired", "rejected"].includes(trip.status) ? "default" : "outline" }), "h-11")} data-testid="call-operator">
            {t.callOperator.replace("{operator}", op)}
          </a>
        ) : null}
        {waiting ? <CancelBooking id={trip.id} lang={lang} operator={op} /> : null}
        <Link href={`/?repeat=${trip.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-11")} data-testid="repeat-booking">{t.bookAgain}</Link>
      </div>
    </div>
  )
}
