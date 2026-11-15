import { StoreAppHome } from "@/components/restaurant/store/app-home"
import { StoreWebHome } from "@/components/restaurant/store/web-home"
import { summariseHours } from "@/lib/hours"
import { mapsUrl } from "@/lib/restaurant/location"
import { formatKm } from "@/lib/restaurant/service-area"
import { enabledFulfilments } from "@/lib/restaurant/settings"
import type { Storefront } from "@/lib/restaurant/storefront-data"
import type { DealerProfile } from "@/lib/tenant/dealer"

/** The landing page. Phones get the app-style home, wider screens the web home; both are built from the same data. */
export function StoreHome({
  dealer,
  store,
}: {
  dealer: DealerProfile
  store: Storefront
}) {
  const { dishes, categories, banners, profile, canOrder } = store
  const c = store.coupons[0]
  const shared = {
    restaurant: dealer.displayName,
    logoUrl: dealer.logoUrl,
    fulfilments: enabledFulfilments(store.settings),
    dishes,
    categories,
    banners,
    canOrder,
    rating: store.rating,
    couponHint: c
      ? `Use code ${c.code} for ${c.offer}${c.minOrder ? ` on orders above ₹${c.minOrder}` : ""}`
      : null,
    info: {
      tagline: profile.tagline,
      about: profile.about,
      address: profile.address || store.serviceArea?.address || "",
      hours: summariseHours(dealer.businessHours),
      schedule: dealer.businessHours ?? null,
      phone: dealer.phone,
      email: profile.email,
      deliveryText: store.serviceArea
        ? store.serviceArea.radiusKm !== null
          ? `Up to ${formatKm(store.serviceArea.radiusKm)} km from the restaurant.`
          : "Set by delivery zones."
        : null,
      directionsUrl: store.serviceArea
        ? mapsUrl(store.serviceArea.lat, store.serviceArea.lng)
        : null,
    },
    reviews: store.reviews.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      date: r.createdAt.toISOString(),
    })),
  }
  return (
    <>
      <StoreAppHome
        {...shared}
        origin={
          store.serviceArea
            ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng }
            : null
        }
      />
      <StoreWebHome {...shared} />
    </>
  )
}
