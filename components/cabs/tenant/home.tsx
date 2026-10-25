import { asc } from "drizzle-orm"
import { Call02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { InitialDraft } from "@/components/cabs/book/booking-flow"
import { CabsAppFrame } from "@/components/cabs/tenant/app-frame"
import { PoweredBy } from "@/components/tenant/powered-by"
import { buttonVariants } from "@/components/ui/button"
import { bookingText } from "@/lib/cabs/booking-copy"
import { fmtIst } from "@/lib/cabs/customer-page"
import { currentLang } from "@/lib/cabs/lang-server"
import { mapCentreFor, picksFor } from "@/lib/cabs/quick-picks"
import { loadBookingOptions, loadCustomerTrips, repeatDraft } from "@/lib/cabs/trip-data"
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
  // The last few rides, for the "Recent" shortcut: tapping one books it again.
  const recent = customer ? (await loadCustomerTrips(db, customer.id)).slice(0, 5).map((tr) => ({ id: tr.id, route: [tr.pickup, tr.drop].filter(Boolean).join(" → "), when: fmtIst(tr.startAt, lang), lat: tr.pickupAt?.lat ?? null, lng: tr.pickupAt?.lng ?? null })) : []
  const quick = picksFor(cities).slice(0, 5).map((q) => ({ key: q.key, kind: q.kind, label: lang === "ta" ? q.ta : q.en, lat: q.lat, lng: q.lng }))
  const mapCentre = mapCentreFor(cities, dealer.city)

  const intro = (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{dealer.displayName}</h1>
      <p className="text-sm text-muted-foreground">{cities.length > 0 ? t.servesCities.replace("{cities}", cities.join(", ")) : t.servesFrom.replace("{city}", dealer.city)}</p>
      {dealer.phone ? (
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${dealer.phone}`} className={cn(buttonVariants({ size: "lg" }), "rounded-xl")}>
            <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-5" />
            {t.callOperator.replace("{operator}", dealer.phone.replace(/^\+91/, "+91 "))}
          </a>
          <a href={whatsappLink(dealer.phone, `Hi ${dealer.displayName}, I would like to book a cab.`)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-xl")}>
            {t.whatsapp}
          </a>
        </div>
      ) : null}
    </section>
  )

  return (
    <CabsAppFrame
      dealer={{ name: dealer.displayName, logoUrl: dealer.logoUrl, phone: dealer.phone }}
      lang={lang}
      signedIn={Boolean(customer)}
      customerName={customer?.name ?? null}
      map={{ centre: mapCentre.centre, zoom: mapCentre.zoom }}
      flow={bookable ? { operator: dealer.displayName, lang, signedIn: Boolean(customer), minStart: new Date(now.getTime() + 330 * 60_000 + Math.max(settings[0]?.minLeadMinutes ?? 0, 15) * 60_000).toISOString().slice(0, 16), quick, localPackages: options.localPackages, tours: options.tours, initial, resume: search.resume === "1", recent } : null}
      intro={intro}
    >
      {dealer.whiteLabel ? null : <PoweredBy product="cabs" className="mt-auto border-t-0 pt-6 pb-0" />}
    </CabsAppFrame>
  )
}
