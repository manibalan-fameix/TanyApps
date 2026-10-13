import Link from "next/link"

import { Eyebrow, StorePage } from "@/components/restaurant/store/ui"
import { buttonVariants } from "@/components/ui/button"
import { summariseHours } from "@/lib/hours"
import { mapsUrl } from "@/lib/restaurant/location"
import { formatKm } from "@/lib/restaurant/service-area"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { cn } from "@/lib/utils"

export const metadata = { title: "Our story" }

export default async function AboutPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const { profile } = store
  const hours = summariseHours(dealer.businessHours)
  return (
    <StorePage className="max-w-3xl">
      <Eyebrow>Our story</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{profile.tagline || dealer.displayName}</h1>
      <p className="mt-6 leading-8 whitespace-pre-line text-muted-foreground">
        {profile.about || `${dealer.displayName} serves fresh food in ${dealer.city}. Browse the menu and order for pickup or delivery.`}
      </p>
      <dl className="mt-8 grid gap-4 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Address</dt><dd className="mt-1 text-muted-foreground">{profile.address || dealer.city}</dd></div>
        {hours ? <div><dt className="font-medium">Opening hours</dt><dd className="mt-1 text-muted-foreground">{hours}</dd></div> : null}
        {dealer.phone ? <div><dt className="font-medium">Phone</dt><dd className="mt-1"><a href={`tel:${dealer.phone}`} className="underline">{dealer.phone}</a></dd></div> : null}
        {store.serviceArea ? (
          <div>
            <dt className="font-medium">Delivery area</dt>
            <dd className="mt-1 text-muted-foreground">
              {store.serviceArea.radiusKm !== null ? `Up to ${formatKm(store.serviceArea.radiusKm)} km from the restaurant. ` : ""}
              <a className="underline" target="_blank" rel="noreferrer" href={mapsUrl(store.serviceArea.lat, store.serviceArea.lng)}>Get directions</a>
            </dd>
          </div>
        ) : null}
        {profile.email ? <div><dt className="font-medium">Email</dt><dd className="mt-1"><a href={`mailto:${profile.email}`} className="underline">{profile.email}</a></dd></div> : null}
      </dl>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/menu" className={cn(buttonVariants({ size: "lg" }))}>See the menu</Link>
        <Link href="/contact" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>Contact us</Link>
      </div>
    </StorePage>
  )
}
