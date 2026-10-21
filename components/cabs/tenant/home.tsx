import { asc } from "drizzle-orm"
import { Call02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { BookingFlow, type InitialDraft } from "@/components/cabs/book/booking-flow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { bookingText } from "@/lib/cabs/booking-copy"
import { currentLang } from "@/lib/cabs/lang-server"
import { picksFor } from "@/lib/cabs/quick-picks"
import { loadBookingOptions, repeatDraft } from "@/lib/cabs/trip-data"
import { getPlacesProvider } from "@/lib/core/geo/places-provider"
import { currentCustomer } from "@/lib/core/login/customer"
import { vehicleClasses } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { billingState } from "@/lib/billing/state"
import type { DealerProfile } from "@/lib/tenant/dealer"
import { whatsappLink } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

/**
 * The public page of a cab operator: the booking form first, then who they are and the vehicles they offer. Online booking needs
 * fares set up and a map service; without them the page falls back to calling or WhatsApp, as before.
 */
export async function CabsHome({ dealer, search }: { dealer: DealerProfile; search: Record<string, string | string[] | undefined> }) {
  const db = scopedDb(dealer.id)
  const lang = await currentLang()
  const t = bookingText(lang)
  const now = new Date()
  const [classes, settings, options, customer] = await Promise.all([
    db.vehicleClasses.select(undefined, { orderBy: [asc(vehicleClasses.sortOrder), asc(vehicleClasses.name)] }),
    db.cabSettings.select(),
    loadBookingOptions(db, now),
    currentCustomer(dealer.id),
  ])
  const offered = classes.filter((c) => c.active)
  const cities = settings[0]?.serviceCities ?? []
  const bookable = offered.length > 0 && billingState(dealer).hasAccess && getPlacesProvider() !== null
  const repeatId = typeof search.repeat === "string" ? search.repeat : null
  const initial: InitialDraft | null = customer && repeatId && /^[0-9a-f-]{36}$/.test(repeatId) ? await repeatDraft(db, repeatId, customer.id) : null
  const quick = picksFor(cities).map((q) => ({ key: q.key, label: lang === "ta" ? q.ta : q.en }))

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{bookable ? t.homeTitle : dealer.displayName}</h1>
        <p className="text-muted-foreground">{bookable ? t.homeSub : cities.length > 0 ? t.servesCities.replace("{cities}", cities.join(", ")) : t.servesFrom.replace("{city}", dealer.city)}</p>
        {dealer.phone ? (
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${dealer.phone}`} className={cn(buttonVariants({ size: "lg", variant: bookable ? "outline" : "default" }))}>
              <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-5" />
              {t.callOperator.replace("{operator}", dealer.phone.replace(/^\+91/, "+91 "))}
            </a>
            {bookable ? null : (
              <a href={whatsappLink(dealer.phone, `Hi ${dealer.displayName}, I would like to book a cab.`)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
                {t.whatsapp}
              </a>
            )}
          </div>
        ) : null}
      </section>

      {bookable ? (
        <section className="mx-auto w-full max-w-xl">
          <BookingFlow operator={dealer.displayName} lang={lang} signedIn={Boolean(customer)} minStart={new Date(now.getTime() + 330 * 60_000 + Math.max(settings[0]?.minLeadMinutes ?? 0, 15) * 60_000).toISOString().slice(0, 16)} quick={quick} localPackages={options.localPackages} tours={options.tours} initial={initial} resume={search.resume === "1"} />
        </section>
      ) : null}

      {offered.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.ourVehicles}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offered.map((c) => (
              <Card key={c.id}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.name} className="aspect-video w-full rounded-t-xl object-cover" />
                ) : null}
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <CardDescription>{[t.seatsN.replace("{n}", String(c.seats)), t.bagsN.replace("{n}", String(c.bags)), c.ac ? t.acLabel : null].filter(Boolean).join(" · ")}</CardDescription>
                </CardHeader>
                {c.description ? <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent> : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
