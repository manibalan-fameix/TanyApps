import { cn } from "@/lib/utils"
import { PromoBanner } from "@/components/restaurant/store/promo-banners"
import { DishCard } from "@/components/restaurant/store/dish-card"
import { SectionTitle, StoreEmpty, StorePage, DISH_GRID } from "@/components/restaurant/store/ui"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { isOnOffer } from "@/lib/restaurant/storefront"

export const metadata = { title: "Offers" }

export default async function OffersPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { store } = await restaurantPage(params)
  const dishes = store.dishes.filter(isOnOffer)
  const none = dishes.length === 0 && store.coupons.length === 0 && store.banners.length === 0
  return (
    <StorePage className="grid gap-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Offers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Current deals and coupon codes.</p>
      </div>
      {none ? <StoreEmpty title="No offers right now" body="Check back soon, or browse the full menu." action={{ href: "/menu", label: "Browse the menu" }} /> : null}
      {store.banners.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {store.banners.map((b) => (
            <li key={b.id}>
              <PromoBanner banner={b} />
            </li>
          ))}
        </ul>
      ) : null}
      {store.coupons.length > 0 ? (
        <section>
          <SectionTitle title="Coupon codes" hint="Enter a code at checkout." />
          <ul className={cn("mt-6", DISH_GRID)}>
            {store.coupons.map((c) => (
              <li key={c.code} className="rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-5">
                <p className="font-mono text-lg font-semibold text-primary">{c.code}</p>
                <p className="mt-1 font-medium">{c.offer}</p>
                {c.minOrder ? <p className="text-sm text-muted-foreground">On orders above ₹{c.minOrder}</p> : null}
                {c.expires ? <p className="text-xs text-muted-foreground">Valid until {c.expires.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {dishes.length > 0 ? (
        <section>
          <SectionTitle title="Dishes on offer" />
          <div className={cn("mt-6", DISH_GRID)}>
            {dishes.map((d) => <DishCard key={d.id} dish={d} canOrder={store.canOrder} />)}
          </div>
        </section>
      ) : null}
    </StorePage>
  )
}
