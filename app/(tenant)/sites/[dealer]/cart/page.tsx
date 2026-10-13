import { CartPage } from "@/components/restaurant/store/cart-page"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Cart" }

export default async function Cart({ params }: { params: Promise<{ dealer: string }> }) {
  const { store } = await restaurantPage(params)
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Review your dishes and quantities before checkout.</p>
      <div className="mt-6">
        <CartPage dishes={store.dishes} canOrder={store.canOrder} minOrder={store.settings.minOrder} freeAbove={store.settings.freeDeliveryAbove} deliveryFee={store.settings.deliveryFee} />
      </div>
    </main>
  )
}
