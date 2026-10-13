import Link from "next/link"

import { StorePage } from "@/components/restaurant/store/ui"
import { CheckoutForm } from "@/components/restaurant/checkout-form"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Checkout" }

export default async function CheckoutPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const settings = store.settings
  return (
    <StorePage className="flex max-w-6xl flex-col gap-6">
      <div>
        <Link href="/cart" className="text-sm text-muted-foreground underline">
          Back to cart
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground">{dealer.displayName}</p>
      </div>
      {settings.acceptingOrders ? (
        <CheckoutForm settings={settings} zonesEnabled={store.zonesEnabled || store.serviceArea?.radiusKm != null} paymentMethods={store.paymentMethods} testPayments={store.testPayments} brandColor={dealer.theme.primary} />
      ) : (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">We are not taking online orders right now.</p>
      )}
    </StorePage>
  )
}
