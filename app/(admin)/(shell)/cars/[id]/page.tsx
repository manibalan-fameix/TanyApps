import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { desc, eq } from "drizzle-orm"

import { ComingSoon } from "@/components/admin/coming-soon"
import { isPlaceholderPath } from "@/components/admin/nav-config"
import { BookingRefundButton } from "@/components/cars/booking-refund-button"
import { ShareKitPanel } from "@/components/cars/share-kit-panel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getDealerContext } from "@/lib/auth/context"
import { canRefund } from "@/lib/core/permissions"
import { getShareKit } from "@/lib/cars/publish"
import { getCarState } from "@/lib/cars/state"
import { copy } from "@/lib/copy"
import { tryDecrypt } from "@/lib/crypto"
import { bookings } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { formatInr } from "@/lib/share/caption"
import { cn } from "@/lib/utils"

const t = copy.admin.cars.manage

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value ?? t.unknown}</dd>
    </div>
  )
}

// A car's page. Non-id paths under /cars (e.g. /cars/sold) fall through to the coming-soon screen.
/** What a refund that is not finished looks like to the dealer. Refunded appears only once Razorpay says it was sent. */
function refundLabel(status: string | null): string {
  if (status === "pending") return "Refund in progress"
  if (status === "failed") return "Refund failed"
  return "Refund owed (will retry)"
}

export default async function CarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    if (isPlaceholderPath(`/cars/${id}`))
      return <ComingSoon path={`/cars/${id}`} />
    notFound()
  }

  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) {
    return (
      <Alert className="max-w-lg">
        <AlertDescription>{copy.admin.dashboard.noDealerBody}</AlertDescription>
      </Alert>
    )
  }
  const car = await getCarState(ctx.dealer.id, id)
  if (!car) notFound()
  if (car.status === "draft") redirect(`/cars/new?car=${car.id}`)
  const kit =
    car.status === "live" ? await getShareKit(ctx.dealer.id, car.id) : null
  // The booking that holds the car comes first: a buyer who lost the race has a newer, refunded booking on the same car.
  const carBookings = await scopedDb(ctx.dealer.id).bookings.select(eq(bookings.carId, car.id), { orderBy: [desc(bookings.createdAt)], limit: 10 })
  const booking = carBookings.find((b) => b.status === "paid") ?? carBookings.find((b) => b.status === "refund_pending") ?? carBookings[0]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">
            {[car.year, car.variant?.label].filter(Boolean).join(" ")}
          </h1>
          <p className="text-sm text-muted-foreground">{car.reg}</p>
        </div>
        <Badge variant={car.status === "live" ? "default" : "secondary"}>
          {copy.admin.cars.status[car.status]}
        </Badge>
      </div>

      {booking ? (
        <Card>
          <CardHeader>
            <CardTitle>Booking</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Buyer" value={booking.buyerName} />
              <Row label="Phone" value={tryDecrypt(booking.buyerPhone)} />
              <Row label="Amount" value={`₹${formatInr(booking.amount)}`} />
              <Row label="Status" value={<span className="capitalize">{booking.status === "refund_pending" ? refundLabel(booking.refundStatus) : booking.status}</span>} />
            </dl>
            {canRefund(ctx.role) && (booking.status === "paid" || (booking.status === "refund_pending" && booking.refundStatus !== "pending" && booking.refundStatus !== "failed")) ? (
              <div className="mt-3">
                <BookingRefundButton bookingId={booking.id} retry={booking.status === "refund_pending"} />
              </div>
            ) : null}
            {booking.status === "refund_pending" && booking.refundStatus === "failed" ? (
              <p className="mt-3 text-sm text-destructive">Razorpay could not complete this refund. Please contact support.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {kit ? (
        <ShareKitPanel
          kit={kit}
          title={car.variant?.label}
          aside={
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t.facts}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y divide-border">
                    <Row
                      label={t.price}
                      value={
                        car.askingPrice
                          ? `₹${formatInr(car.askingPrice)}`
                          : null
                      }
                    />
                    <Row
                      label={t.km}
                      value={
                        car.kmDriven != null ? formatInr(car.kmDriven) : null
                      }
                    />
                    <Row label={t.owners} value={car.ownerCount} />
                    <Row label={t.insurance} value={car.insuranceValidTill} />
                    <Row
                      label={t.loan}
                      value={
                        car.hypothecationCleared === null
                          ? null
                          : car.hypothecationCleared
                            ? t.loanCleared
                            : t.loanActive
                      }
                    />
                    <Row
                      label="RTO"
                      value={car.rcVerified ? t.verified : t.unverified}
                    />
                  </dl>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/cars/new?car=${car.id}&step=photos`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  {t.editPhotos}
                </Link>
                {kit && (
                  <a
                    href={kit.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    {t.openPage}
                  </a>
                )}
              </div>
            </>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t.facts}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <Row
                  label={t.price}
                  value={
                    car.askingPrice ? `₹${formatInr(car.askingPrice)}` : null
                  }
                />
                <Row
                  label={t.km}
                  value={car.kmDriven != null ? formatInr(car.kmDriven) : null}
                />
                <Row label={t.owners} value={car.ownerCount} />
                <Row label={t.insurance} value={car.insuranceValidTill} />
                <Row
                  label={t.loan}
                  value={
                    car.hypothecationCleared === null
                      ? null
                      : car.hypothecationCleared
                        ? t.loanCleared
                        : t.loanActive
                  }
                />
                <Row
                  label="RTO"
                  value={car.rcVerified ? t.verified : t.unverified}
                />
              </dl>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/cars/new?car=${car.id}&step=photos`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t.editPhotos}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
