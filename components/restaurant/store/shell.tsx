import { CartProvider } from "@/components/restaurant/cart-provider"
import { StoreBottomNav } from "@/components/restaurant/store/bottom-nav"
import { FooterGate } from "@/components/restaurant/store/footer-gate"
import { StoreFooter } from "@/components/restaurant/store/footer"
import { FavouritesProvider } from "@/components/restaurant/store/favourites"
import { LocationPicker } from "@/components/restaurant/store/location-picker"
import { readServiceArea } from "@/lib/restaurant/service-area"
import { LocationDialog, LocationProvider } from "@/components/restaurant/store/location"
import { StoreHeader } from "@/components/restaurant/store/header"
import { ViewCartBar } from "@/components/restaurant/store/view-cart-bar"
import type { CSSProperties } from "react"
import { themeToCssVars } from "@/lib/theme/tokens"
import { loadStorefront } from "@/lib/restaurant/storefront-data"
import type { DealerProfile } from "@/lib/tenant/dealer"

/** Header, footer, phone bottom bar and floating cart around every public restaurant page. */
export async function StoreShell({ dealer, children }: { dealer: DealerProfile; children: React.ReactNode }) {
  const store = await loadStorefront(dealer)
  const area = readServiceArea(dealer.serviceArea)
  const centre = area ? { lat: area.lat, lng: area.lng } : null
  return (
    <CartProvider slug={dealer.slug}>
      <FavouritesProvider slug={dealer.slug}>
       <LocationProvider>
        <StoreHeader name={dealer.displayName} logoUrl={dealer.logoUrl} phone={dealer.phone} />
        {children}
        <FooterGate>
          <StoreFooter dealer={dealer} store={store} />
        </FooterGate>
        <ViewCartBar />
        <StoreBottomNav />
        <LocationDialog restaurant={dealer.displayName} themeVars={themeToCssVars(dealer.theme) as CSSProperties} />
        <LocationPicker restaurant={dealer.displayName} themeVars={themeToCssVars(dealer.theme) as CSSProperties} centre={centre} />
       </LocationProvider>
      </FavouritesProvider>
    </CartProvider>
  )
}
