import type { CSSProperties } from "react"

import { BackButton } from "@/components/restaurant/store/back-button"
import { StorePage } from "@/components/restaurant/store/ui"
import { CheckoutForm } from "@/components/restaurant/checkout-form"
import { currentCustomer } from "@/lib/core/login/customer"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { savedAddressesFor } from "@/lib/restaurant/saved-address-data"
import { themeToCssVars } from "@/lib/theme/tokens"

export const metadata = { title: "Checkout" }

export default async function CheckoutPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const settings = store.settings
  const customer = await currentCustomer(dealer.id)
  const addresses = customer ? await savedAddressesFor(dealer.id, customer.id) : []
  return (
    <StorePage className="flex max-w-4xl flex-col gap-0 pt-0 pb-[calc(15rem+var(--safe-area-inset-bottom,0px))] md:gap-6 md:pt-8 lg:px-6">
      <div className="hidden items-center gap-3 md:flex">
        <BackButton className="-ml-2" />
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
      </div>
      {settings.acceptingOrders ? (
        <CheckoutForm signedIn={Boolean(customer)} savedAddresses={addresses} themeVars={themeToCssVars(dealer.theme) as CSSProperties} settings={settings} zonesEnabled={store.zonesEnabled || store.serviceArea?.radiusKm != null} paymentMethods={store.paymentMethods} testPayments={store.testPayments} brandColor={dealer.theme.primary} dishes={store.dishes} canOrder={store.canOrder} origin={store.serviceArea ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng } : null} />
      ) : (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">We are not taking online orders right now.</p>
      )}
    </StorePage>
  )
}
