import { CartProvider } from "@/components/restaurant/cart-provider"
import { DishPopupProvider } from "@/components/restaurant/store/dish-popup"
import { StoreBottomNav } from "@/components/restaurant/store/bottom-nav"
import { FooterGate, FooterProvider, HomeOnly } from "@/components/restaurant/store/footer-gate"
import { PoweredBy } from "@/components/tenant/powered-by"
import { StoreFooter } from "@/components/restaurant/store/footer"
import { FavouritesProvider } from "@/components/restaurant/store/favourites"
import { LocationPicker } from "@/components/restaurant/store/location-picker"
import { readServiceArea } from "@/lib/restaurant/service-area"
import { LocationDialog, LocationProvider } from "@/components/restaurant/store/location"
import { StoreHeader } from "@/components/restaurant/store/header"
import { StoreWebHeader, WebHeaderProvider } from "@/components/restaurant/store/web-header"
import { enabledFulfilments } from "@/lib/restaurant/settings"
import { mapsUrl } from "@/lib/restaurant/location"
import { OrderAssistant } from "@/components/restaurant/store/order-assistant"
import { ViewCartBar, ViewCartBarSpacer } from "@/components/restaurant/store/view-cart-bar"
import type { CSSProperties } from "react"
import { themeToCssVars } from "@/lib/theme/tokens"
import { loadStorefront } from "@/lib/restaurant/storefront-data"
import type { DealerProfile } from "@/lib/tenant/dealer"
import { StoreTermsProvider } from "@/components/restaurant/store/terms-context"
import { storeTerms } from "@/lib/verticals/terms"
import { StorePathProvider } from "@/components/restaurant/store/store-path"

/** Up to ten things to suggest in the search box, from what this store sells: its categories first, then its featured and other dishes. */
function searchHints(store: Awaited<ReturnType<typeof loadStorefront>>): string[] {
  const names = [...store.categories.map((c) => c.name), ...[...store.dishes].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)).filter((d) => d.isAvailable).map((d) => d.name)]
  const seen = new Set<string>()
  return names.map((n) => n.trim()).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, 10)
}

/** Header, footer, phone bottom bar and floating cart around every public restaurant page. */
export async function StoreShell({ dealer, children, preview = false }: { dealer: DealerProfile; children: React.ReactNode; /** The admin's home page preview: the page as it looks, without the pop-up that greets a new visitor. */ preview?: boolean }) {
  const store = await loadStorefront(dealer)
  const area = readServiceArea(dealer.serviceArea)
  const centre = area ? { lat: area.lat, lng: area.lng } : null
  const terms = storeTerms(dealer.industry, dealer.businessType)
  return (
    <StorePathProvider path={preview ? "/" : null}>
    <StoreTermsProvider value={terms}>
    <CartProvider slug={dealer.slug}>
      <FavouritesProvider slug={dealer.slug}>
       <DishPopupProvider dishes={store.dishes} categories={store.categories} canOrder={store.canOrder}>
       <LocationProvider>
        <WebHeaderProvider
          data={{
            name: dealer.displayName,
            logoUrl: dealer.logoUrl,
            fulfilments: enabledFulfilments(store.settings),
            canOrder: store.canOrder,
            schedule: dealer.businessHours ?? null,
            origin: area ? { lat: area.lat, lng: area.lng } : null,
            searchHints: searchHints(store),
            location: store.serviceArea?.address || dealer.city || null,
            directionsUrl: store.serviceArea ? mapsUrl(store.serviceArea.lat, store.serviceArea.lng) : null,
          }}
        >
        <StoreHeader />
        <StoreWebHeader />
        <FooterProvider footer={<StoreFooter dealer={dealer} store={store} hidePoweredBy />}>{children}</FooterProvider>
        {dealer.whiteLabel ? null : (
          <HomeOnly className="pt-20 pb-[calc(4rem+var(--safe-area-inset-bottom,0px))] md:pt-24 md:pb-0">
            <PoweredBy product={dealer.industry} />
          </HomeOnly>
        )}
        <FooterGate>
          <StoreFooter dealer={dealer} store={store} />
        </FooterGate>
        <ViewCartBarSpacer />
        </WebHeaderProvider>
        <ViewCartBar />
        <OrderAssistant dishes={store.dishes} categories={store.categories} canOrder={store.canOrder} name={dealer.displayName} logoUrl={dealer.logoUrl ?? null} themeVars={themeToCssVars(dealer.theme) as CSSProperties} />
        <StoreBottomNav monthly={store.settings.monthly.enabled} />
        {preview ? null : <LocationDialog restaurant={dealer.displayName} themeVars={themeToCssVars(dealer.theme) as CSSProperties} centre={centre} />}
        <LocationPicker restaurant={dealer.displayName} themeVars={themeToCssVars(dealer.theme) as CSSProperties} centre={centre} />
       </LocationProvider>
       </DishPopupProvider>
      </FavouritesProvider>
    </CartProvider>
    </StoreTermsProvider>
    </StorePathProvider>
  )
}
