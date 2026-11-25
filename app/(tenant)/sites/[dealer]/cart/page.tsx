import { BackButton } from "@/components/restaurant/store/back-button"
import { CartPage } from "@/components/restaurant/store/cart-page"
import { currentCustomer } from "@/lib/core/login/customer"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Cart" }

export default async function Cart({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const signedIn = Boolean(await currentCustomer(dealer.id))
  return (
    <main className="mx-auto max-w-4xl px-4 pt-0 sm:px-6 md:pt-8">
      <div className="hidden items-center gap-3 md:flex">
        <BackButton className="-ml-2" />
        <h1 className="text-2xl font-bold tracking-tight">Cart</h1>
      </div>
      <div className="md:mt-6">
        <CartPage
          dishes={store.dishes}
          canOrder={store.canOrder}
          minOrder={store.settings.minOrder}
          freeAbove={store.settings.freeDeliveryAbove}
          deliveryFee={store.settings.deliveryFee}
          gstPercent={store.settings.gstPercent}
          signedIn={signedIn}
        />
      </div>
    </main>
  )
}
