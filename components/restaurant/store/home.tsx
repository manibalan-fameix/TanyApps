import { HomeScreens } from "@/components/restaurant/store/home-screens"
import { summariseHours } from "@/lib/hours"
import { mapsUrl } from "@/lib/restaurant/location"
import { formatKm } from "@/lib/restaurant/service-area"
import { enabledFulfilments } from "@/lib/restaurant/settings"
import type { Storefront } from "@/lib/restaurant/storefront-data"
import type { DealerProfile } from "@/lib/tenant/dealer"

/** The About facts for a store, shared by the home page and the Store info page. */
export function storeInfo(dealer: DealerProfile, store: Storefront) {
  const { profile } = store
  const coords = store.serviceArea ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng } : null
  return {
      name: dealer.displayName,
      category: profile.category,
      photos: profile.photos,
      website: profile.website,
      instagram: profile.instagram,
      facebook: profile.facebook,
      whatsapp: profile.whatsapp,
      coords,
      tagline: profile.tagline,
      about: profile.about,
      address: profile.address || store.serviceArea?.address || "",
      hours: summariseHours(dealer.businessHours),
      schedule: dealer.businessHours ?? null,
      phone: dealer.phone,
      email: profile.email,
      deliveryText: store.serviceArea
        ? store.serviceArea.radiusKm !== null
          ? `Up to ${formatKm(store.serviceArea.radiusKm)} km from the ${dealer.industry === "retail" ? "shop" : "restaurant"}.`
          : "Set by delivery zones."
        : null,
      // The owner's own Google Maps link wins; otherwise the pin they set on the map.
      directionsUrl: profile.mapsUrl || (store.serviceArea ? mapsUrl(store.serviceArea.lat, store.serviceArea.lng) : null),
    }
}

export function storeReviews(store: Storefront) {
  return store.reviews.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      media: r.media,
      date: r.createdAt.toISOString(),
    }))
}

/** Everything the two home screens are drawn from. The admin's Home page preview builds the same thing. */
export function homeProps(dealer: DealerProfile, store: Storefront) {
  const { dishes, categories, banners, canOrder } = store
  const c = store.coupons[0]
  return {
    restaurant: dealer.displayName,
    logoUrl: dealer.logoUrl,
    fulfilments: enabledFulfilments(store.settings),
    dishes,
    categories,
    banners,
    canOrder,
    couponHint: c
      ? `Use code ${c.code} for ${c.offer}${c.minOrder ? ` on orders above ₹${c.minOrder}` : ""}`
      : null,
    info: storeInfo(dealer, store),
    location: store.serviceArea?.address || dealer.city || null,
    origin: store.serviceArea ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng } : null,
    layout: store.homepage,
  }
}

/** The landing page. Phones get the app-style home, wider screens the web home; both are built from the same data. */
export function StoreHome({
  dealer,
  store,
}: {
  dealer: DealerProfile
  store: Storefront
}) {
  return <HomeScreens {...homeProps(dealer, store)} />
}
