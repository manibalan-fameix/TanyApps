import { and, asc, eq, inArray } from "drizzle-orm"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HERO_ANGLE } from "@/lib/angles"
import { BuyerBottomBar } from "@/components/cars/buyer-bottom-bar"
import { BuyerGallery } from "@/components/cars/buyer-gallery"
import { BuyerHeaderCard } from "@/components/cars/buyer-header-card"
import { BuyerPurchasePanel } from "@/components/cars/buyer-purchase-panel"
import { NewCarComparisonCard } from "@/components/cars/new-car-comparison-card"
import { ShowMotoScoreCard } from "@/components/cars/showmoto-score-card"
import { ChatWidget } from "@/components/chat/chat-widget"
import { ViewBeacon } from "@/components/tenant/view-beacon"
import { SiteHeader } from "@/components/tenant/site-header"
import { isChatEnabled } from "@/lib/ai/chat"
import { copy } from "@/lib/copy"
import { computeShowMotoScore } from "@/lib/cars/score"
import { computeNewCarSavings } from "@/lib/cars/savings"
import { titleOf } from "@/lib/cars/title"
import { carMedia, cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import {
  emptyMarketplaceDetails,
  marketplaceDetailsSchema,
} from "@/lib/cars/marketplace"
import { tenantUrl } from "@/lib/env"
import { formatInr } from "@/lib/share/caption"
import { getStorage } from "@/lib/storage"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { getVariantById } from "@/lib/variants/repo"

const t = copy.tenant

async function load(dealerSlug: string, carSlug: string) {
  const dealer = await getDealerBySlug(dealerSlug)
  if (!dealer) return null
  const db = scopedDb(dealer.id)
  const [car] = await db.cars.select(eq(cars.slug, carSlug), { limit: 1 })
  // Buyers only ever see published cars.
  if (!car || car.status === "draft" || car.status === "archived") return null
  const variant = car.variantId ? await getVariantById(car.variantId) : null
  // Only photos that actually landed in storage. Pending rows are abandoned uploads with nothing behind the URL.
  const uploaded = await db.carMedia.select(
    and(
      eq(carMedia.carId, car.id),
      eq(carMedia.kind, "photo"),
      inArray(carMedia.status, ["uploaded", "ready"])
    ),
    { orderBy: [asc(carMedia.sortOrder)], limit: 8 }
  )
  // The hero leads the gallery, the rest follow in capture order.
  const media = [
    ...uploaded.filter((m) => m.angle === HERO_ANGLE),
    ...uploaded.filter((m) => m.angle !== HERO_ANGLE),
  ]
  const storage = getStorage()
  const hero = media.find((m) => m.angle === HERO_ANGLE) ?? media[0]
  return {
    dealer,
    car,
    variant,
    media,
    heroUrl: hero ? storage.publicUrl(hero.r2Key) : null,
    storage,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dealer: string; carSlug: string }>
}): Promise<Metadata> {
  const { dealer, carSlug } = await params
  const data = await load(dealer, carSlug)
  if (!data) return {}

  const title = titleOf(data.car.year, data.variant)
  const description = `${data.car.askingPrice ? `${formatInr(data.car.askingPrice)} — ` : ""}${data.dealer.displayName}, ${data.dealer.city}`
  // WhatsApp/Facebook unfurl og:image absolutely, so a locally-hosted photo (dev only; R2 is already absolute) needs the tenant host prefixed.
  const image = data.heroUrl
    ? data.heroUrl.startsWith("http")
      ? data.heroUrl
      : tenantUrl(dealer, data.heroUrl)
    : null

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [{ url: image }] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : [],
    },
  }
}

const specLabel: Record<string, string> = {
  engineCc: "Engine",
  bootSpace: "Boot space",
  seatingCapacity: "Seating",
  mileage: "Mileage",
  groundClearance: "Ground clearance",
}

// Full buyer page. Registration number and private RC response data stay server-only.
export default async function CarPage({
  params,
}: {
  params: Promise<{ dealer: string; carSlug: string }>
}) {
  const { dealer: dealerSlug, carSlug } = await params
  const data = await load(dealerSlug, carSlug)
  if (!data) notFound()
  const { dealer, car, variant, media, storage } = data
  const details = marketplaceDetailsSchema
    .catch(emptyMarketplaceDetails())
    .parse(car.marketplaceDetails ?? {})
  const title = titleOf(car.year, variant)
  const score = computeShowMotoScore({
    year: car.year,
    kmDriven: car.kmDriven,
    ownerCount: car.ownerCount,
    askingPrice: car.askingPrice,
    insuranceValidTill: car.insuranceValidTill,
    hypothecationCleared: car.hypothecationCleared,
    rcVerified: car.rcVerifiedAt != null,
    photoCount: media.length,
    details,
  })
  const savings = computeNewCarSavings({
    askingPrice: car.askingPrice,
    newCarPrice: details.pricing.newCarPrice,
  })
  const gallery = media.map((m) => ({
    url: storage.publicUrl(m.r2Key),
    angle: m.angle,
  }))
  const featureGroups = Object.entries(details.features)
    .filter(([, items]) => items.length > 0)
    .map(([group, items]) => ({ group, items }))
  const specs = {
    ...(variant?.engineCc ? { engineCc: `${variant.engineCc} cc` } : {}),
    ...details.specs,
  }
  const specEntries = Object.entries(specs)
    .filter(([, value]) => String(value).trim() !== "")
    .map(([key, value]) => ({
      label: specLabel[key] ?? key,
      value: String(value),
    }))

  const overview = [
    {
      label: "Make year",
      value: details.overview.makeYear ?? (car.year ? String(car.year) : null),
    },
    {
      label: "Registration year",
      value: details.overview.registrationYear ?? null,
    },
    { label: "Fuel type", value: car.fuel },
    {
      label: "KM driven",
      value: car.kmDriven != null ? `${formatInr(car.kmDriven)} km` : null,
    },
    { label: "Transmission", value: car.transmission },
    {
      label: "Owner",
      value: car.ownerCount ? t.car.owners(car.ownerCount) : null,
    },
    { label: "Insurance validity", value: car.insuranceValidTill },
    { label: "Insurance type", value: details.overview.insuranceType ?? null },
    { label: "RTO", value: details.overview.rto ?? null },
    { label: "Location", value: details.overview.location ?? null },
    { label: "Colour", value: car.colour },
    { label: "Body type", value: details.overview.bodyType ?? null },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value)
  )

  const inspection = [
    {
      label: "Inspection score",
      value: details.trust.inspectionScore
        ? `${details.trust.inspectionScore} points`
        : null,
    },
    {
      label: "Inspection note",
      value: details.trust.inspectionSummary ?? null,
    },
    {
      label: "Warranty",
      value: details.trust.warrantyAvailable ? "Available" : null,
    },
    { label: "Service history", value: details.trust.serviceHistory ?? null },
    { label: "Accident history", value: details.trust.accidentHistory ?? null },
    {
      label: "Flood affected",
      value: details.trust.floodAffected ? "Yes" : "No",
    },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value)
  )

  const condition = [
    { label: "Dent/scratch notes", value: details.condition.dentNotes ?? null },
    { label: "Exterior notes", value: details.condition.exteriorNotes ?? null },
    { label: "Tyres", value: details.condition.tyreCondition ?? null },
    { label: "Battery", value: details.condition.batteryCondition ?? null },
    ...details.condition.panelIssues.map((item) => ({
      label: item.panel,
      value: item.issue,
    })),
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value)
  )

  const coreFacts = [
    car.kmDriven != null ? `${formatInr(car.kmDriven)} km` : null,
    car.fuel,
    car.transmission,
  ].filter((value): value is string => Boolean(value))

  const headerFacts = [
    car.kmDriven != null ? `${formatInr(car.kmDriven)} km` : null,
    car.ownerCount ? t.car.owners(car.ownerCount) : null,
    car.transmission,
    car.fuel,
    details.overview.rto ?? null,
  ].filter((value): value is string => Boolean(value))

  return (
    <>
      <SiteHeader dealer={dealer} />
      <main className="min-h-svh items-start bg-background pt-[4.5rem] pb-24 lg:grid lg:grid-cols-[minmax(0,1fr)_40rem] lg:pt-20">
        <section className="sticky top-[4.5rem] z-30 flex flex-col overflow-y-auto bg-background pt-6 pb-7 lg:top-20 lg:h-[calc(100svh-5rem)] lg:pb-7">
          <div className="w-full px-4 lg:px-8">
            <BuyerGallery photos={gallery} title={title} />
          </div>
        </section>

        <div className="bg-background px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mb-6">
            <BuyerHeaderCard
              title={title}
              facts={headerFacts}
              location={details.overview.location ?? null}
              dealerPhone={dealer.phone}
              price={car.askingPrice}
              pricing={{
                loanAmount: details.pricing.loanAmount ?? null,
                downPayment: details.pricing.downPayment ?? null,
                loanDurationMonths: details.pricing.loanDurationMonths ?? null,
                interestRate: details.pricing.interestRate ?? null,
                bookingAmount: details.pricing.bookingAmount ?? null,
                tokenRefundable: details.pricing.tokenRefundable,
              }}
              booking={{
                dealerSlug: dealer.slug,
                carSlug,
                canPayOnline: dealer.razorpayAccountStatus === "activated",
              }}
            />
          </div>
          <div className="mb-4">
            <ShowMotoScoreCard result={score} />
          </div>
          {savings ? (
            <div className="mb-4">
              <NewCarComparisonCard savings={savings} title={title} />
            </div>
          ) : null}
          <BuyerPurchasePanel
            overview={overview}
            reasons={details.trust.reasonsToBuy}
            inspection={inspection}
            protectionPlans={details.protectionPlans}
            condition={condition}
            specs={specEntries}
            featureGroups={featureGroups}
          />
        </div>
        <BuyerBottomBar
          title={title}
          facts={coreFacts}
          price={car.askingPrice}
          dealerPhone={dealer.phone}
        />
        {isChatEnabled() ? (
          <ChatWidget
            scope={{ type: "car", carSlug }}
            greeting={t.chat.carGreeting}
            questions={t.chat.carQuestions}
            handoff={dealer.phone ? { phone: dealer.phone, message: t.chat.whatsappCar(title) } : null}
          />
        ) : null}
        <ViewBeacon carSlug={carSlug} />
      </main>
    </>
  )
}
