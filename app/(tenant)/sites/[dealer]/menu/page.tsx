import { CategoryGrid } from "@/components/restaurant/store/category-grid"
import { MenuCatalogue } from "@/components/restaurant/store/menu-catalogue"
import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { cn } from "@/lib/utils"

export const metadata = { title: "Menu" }

// Fills the screen below the fixed header and above the phone tab bar; only the dish list scrolls.
export default async function MenuPage({
  params,
}: {
  params: Promise<{ dealer: string }>
}) {
  const { store } = await restaurantPage(params)
  return (
    <>
      <CategoryGrid
        dishes={store.dishes}
        categories={store.categories}
        banners={store.banners}
      />
      <main
        className={cn(
          STORE_CONTENT,
          "hidden h-[calc(100dvh-9rem)] min-h-0 flex-col overflow-hidden pb-4 md:flex md:h-[calc(100dvh-6rem)] md:pb-6"
        )}
      >
        <h1 className="sr-only">Menu</h1>
        <MenuCatalogue
          dishes={store.dishes}
          categories={store.categories}
          canOrder={store.canOrder}
        />
      </main>
    </>
  )
}
