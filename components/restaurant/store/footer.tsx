import Link from "next/link"
import { Call02Icon, Location01Icon, Mail01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { formatKm } from "@/lib/restaurant/service-area"
import { mapsUrl } from "@/lib/restaurant/location"
import { PoweredBy } from "@/components/tenant/powered-by"
import type { DealerProfile } from "@/lib/tenant/dealer"
import type { Storefront } from "@/lib/restaurant/storefront-data"
import { cn } from "@/lib/utils"

export function StoreFooter({ dealer, store }: { dealer: DealerProfile; store: Storefront }) {
  const { profile, categories } = store
  return (
    <footer className="mt-12 border-t border-border bg-card pb-16 md:pb-0">
      <div className={cn(STORE_CONTENT, "grid gap-8 py-8 md:grid-cols-[1.3fr_1fr_1fr]")}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{dealer.displayName}</h2>
          {profile.tagline ? <p className="mt-1 text-sm font-medium text-primary">{profile.tagline}</p> : null}
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            {dealer.city ? `Order online from ${dealer.displayName}, ${dealer.city}.` : `Order online from ${dealer.displayName}.`}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium">Menu</h3>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li><Link href="/menu" className="hover:text-foreground">Full menu</Link></li>
            {categories.map((c) => (
              <li key={c.id}><Link href={`/category/${c.slug}`} className="hover:text-foreground">{c.name}</Link></li>
            ))}
            <li><Link href="/offers" className="hover:text-foreground">Offers</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-medium">Contact</h3>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            {dealer.phone ? (
              <li><a href={`tel:${dealer.phone}`} className="inline-flex items-center gap-2 hover:text-foreground"><HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-4" />{dealer.phone.replace(/^\+91/, "+91 ")}</a></li>
            ) : null}
            {profile.email ? (
              <li><a href={`mailto:${profile.email}`} className="inline-flex items-center gap-2 hover:text-foreground"><HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />{profile.email}</a></li>
            ) : null}
            <li><Link href="/contact" className="inline-flex items-center gap-2 hover:text-foreground"><HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4" />{profile.address || dealer.city}</Link></li>
            {store.serviceArea ? (
              <li><a href={mapsUrl(store.serviceArea.lat, store.serviceArea.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-foreground"><HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4" />Get directions{store.serviceArea.radiusKm !== null ? ` · delivers up to ${formatKm(store.serviceArea.radiusKm)} km` : ""}</a></li>
            ) : null}
            <li><Link href="/track-order" className="hover:text-foreground">Track an order</Link></li>
          </ul>
        </div>
      </div>
      {dealer.whiteLabel ? null : <PoweredBy product="restaurants" />}
    </footer>
  )
}
