import { FavouritesGrid } from "@/components/restaurant/store/favourites-grid"
import { StorePage } from "@/components/restaurant/store/ui"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Favourites" }

export default async function FavouritesPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { store } = await restaurantPage(params)
  return (
    <StorePage>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Favourites</h1>
      <FavouritesGrid dishes={store.dishes} canOrder={store.canOrder} />
    </StorePage>
  )
}
