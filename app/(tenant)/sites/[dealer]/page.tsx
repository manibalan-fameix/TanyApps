import type { CSSProperties } from "react"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { notFound } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Grid02Icon, Shield01Icon } from "@hugeicons/core-free-icons"

import { CarFiltersSidebar } from "@/components/tenant/car-filters-sidebar"
import { DealerInventoryHeader } from "@/components/tenant/dealer-inventory-header"
import { OfferBannerCarousel } from "@/components/tenant/offer-banner-carousel"
import { CarGridCard } from "@/components/cars/car-grid-card"
import { ChatWidget } from "@/components/chat/chat-widget"
import { ViewBeacon } from "@/components/tenant/view-beacon"
import { isChatEnabled } from "@/lib/ai/chat"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { HERO_ANGLE } from "@/lib/angles"
import { calculateEmi } from "@/lib/cars/emi"
import { copy } from "@/lib/copy"
import { CabsHome } from "@/components/cabs/tenant/home"
import { StoreHome } from "@/components/restaurant/store/home"
import { loadStorefront } from "@/lib/restaurant/storefront-data"
import {
  facetOptions,
  filterListing,
  parseCarFilters,
  type ListingItem,
} from "@/lib/cars/filters"
import {
  emptyMarketplaceDetails,
  marketplaceDetailsSchema,
} from "@/lib/cars/marketplace"
import { carMedia, cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { getStorage } from "@/lib/storage"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { getAllVariants } from "@/lib/variants/repo"

const t = copy.tenant

export default async function DealerHome({
  params,
  searchParams,
}: {
  params: Promise<{ dealer: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer) notFound()
  if (dealer.industry === "restaurants") return <StoreHome dealer={dealer} store={await loadStorefront(dealer)} />
  if (dealer.industry === "cabs") return <CabsHome dealer={dealer} />
  const rawSearchParams = await searchParams
  const db = scopedDb(dealer.id)

  const [live, variants] = await Promise.all([
    db.cars.select(eq(cars.status, "live"), { orderBy: [desc(cars.listedAt)] }),
    getAllVariants(),
  ])
  const variantById = new Map(variants.map((v) => [v.id, v]))

  const MAX_GRID_IMAGES = 6
  const carIds = live.map((car) => car.id)
  const imagesByCarId = new Map<string, string[]>()
  if (carIds.length > 0) {
    const storage = getStorage()
    const media = await db.carMedia.select(
      and(
        inArray(carMedia.carId, carIds),
        eq(carMedia.kind, "photo"),
        inArray(carMedia.status, ["uploaded", "ready"])
      ),
      {
        orderBy: [asc(carMedia.sortOrder)],
      }
    )
    const byCarId = new Map<string, typeof media>()
    for (const m of media)
      byCarId.set(m.carId, [...(byCarId.get(m.carId) ?? []), m])
    for (const [carId, items] of byCarId) {
      // Hero angle leads the carousel; the rest follow in capture order.
      const hero = items.find((m) => m.angle === HERO_ANGLE)
      const ordered = hero
        ? [hero, ...items.filter((m) => m.id !== hero.id)]
        : items
      imagesByCarId.set(
        carId,
        ordered.slice(0, MAX_GRID_IMAGES).map((m) => storage.publicUrl(m.r2Key))
      )
    }
  }

  const listing: ListingItem[] = live.map((car) => {
    const variant = car.variantId
      ? (variantById.get(car.variantId) ?? null)
      : null
    const details = marketplaceDetailsSchema
      .catch(emptyMarketplaceDetails())
      .parse(car.marketplaceDetails ?? {})
    const price = car.askingPrice
    const downPayment =
      details.pricing.downPayment ??
      (details.pricing.loanAmount != null && price != null
        ? price - details.pricing.loanAmount
        : price != null
          ? Math.round(price * 0.2)
          : null)
    const loanAmount =
      price != null && downPayment != null
        ? Math.max(0, price - downPayment)
        : null
    const emiPerMonth =
      details.pricing.emiStart ??
      (loanAmount
        ? Math.round(
            calculateEmi(
              loanAmount,
              details.pricing.interestRate ?? 10.99,
              details.pricing.loanDurationMonths ?? 60
            )
          )
        : null)

    return {
      id: car.id,
      slug: car.slug,
      title:
        [car.year, variant && `${variant.make} ${variant.model}`]
          .filter(Boolean)
          .join(" ") ||
        (car.regPrefix?.toUpperCase() ?? ""),
      variantLabel: variant?.variant ?? null,
      model: variant ? `${variant.make} ${variant.model}` : null,
      fuel: car.fuel,
      transmission: car.transmission,
      ownerCount: car.ownerCount,
      kmDriven: car.kmDriven,
      askingPrice: car.askingPrice,
      emiPerMonth,
      regPrefix: car.regPrefix?.toUpperCase() ?? null,
      reasonsToBuy: details.trust.reasonsToBuy,
      images: imagesByCarId.get(car.id) ?? [],
      year: car.year,
      bodyType: details.overview.bodyType ?? null,
      colour: car.colour ?? null,
      rto: details.overview.rto ?? null,
      seats: details.specs.seatingCapacity ?? details.specs.seats ?? null,
      warrantyAvailable: details.trust.warrantyAvailable,
      returnAssurance: details.protectionPlans.some((plan) =>
        /return|buyback/i.test(plan)
      ),
      features: Object.values(details.features).flat(),
      safetyFeatures: details.features.safety,
    }
  })

  const filters = parseCarFilters(rawSearchParams)
  const facets = facetOptions(listing)
  const results = filterListing(listing, filters)

  return (
    <div className="bg-muted/50">
      <SidebarProvider
        className="h-svh flex-col pt-14 lg:pt-16"
        style={{ "--sidebar-width": "19rem" } as CSSProperties}
      >
        <DealerInventoryHeader
          dealer={{
            name: dealer.displayName,
            city: dealer.city,
            logoUrl: dealer.logoUrl,
          }}
          query={filters.q}
        />
        <div className="flex min-h-0 flex-1">
          <CarFiltersSidebar
            filters={filters}
            facets={facets}
            resultCount={results.length}
          />
          <SidebarInset className="min-w-0 overflow-y-auto bg-background">
            <main className="w-full px-[60px] py-4 max-lg:px-6 max-md:pb-[calc(6rem+var(--safe-area-inset-bottom))] sm:py-6 lg:py-8">
              <OfferBannerCarousel />

              <section className="mt-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {filters.q ? "Matching vehicles" : "Available now"}
                      </h2>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {results.length}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cars selected for quality, value, and the road ahead.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground sm:self-auto">
                    <HugeiconsIcon
                      icon={Grid02Icon}
                      strokeWidth={2}
                      className="size-4 text-foreground"
                    />
                    Grid view
                    <span className="mx-1 h-4 w-px bg-border" />
                    <HugeiconsIcon
                      icon={Shield01Icon}
                      strokeWidth={2}
                      className="size-4 text-primary"
                    />
                    Verified inventory
                  </div>
                </div>
                {results.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
                    <HugeiconsIcon
                      icon={Grid02Icon}
                      strokeWidth={1.5}
                      className="mx-auto size-9 text-muted-foreground"
                    />
                    <p className="mt-4 font-medium">
                      {filters.q ? t.noSearchResults : t.noCars}
                    </p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      {t.emptyHint}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3 2xl:grid-cols-4">
                    {results.map((item) => (
                      <CarGridCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </section>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
      {isChatEnabled() ? (
        <ChatWidget
          scope={{ type: "general" }}
          greeting={t.chat.generalGreeting(dealer.displayName)}
          questions={t.chat.generalQuestions}
          handoff={dealer.phone ? { phone: dealer.phone, message: t.chat.whatsappGeneral(dealer.displayName) } : null}
        />
      ) : null}
      <ViewBeacon />
    </div>
  )
}
