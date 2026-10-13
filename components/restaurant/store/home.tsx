import Link from "next/link"

import { DishCard } from "@/components/restaurant/store/dish-card"
import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { CategoryChip, SectionTitle, DISH_GRID } from "@/components/restaurant/store/ui"
import { buttonVariants } from "@/components/ui/button"
import type { Storefront } from "@/lib/restaurant/storefront-data"
import type { DealerProfile } from "@/lib/tenant/dealer"
import { cn } from "@/lib/utils"

/** The landing page, laid out like the Lala Sweets home: a full-screen hero, category chips, then best sellers. */
export function StoreHome({ dealer, store }: { dealer: DealerProfile; store: Storefront }) {
  const { dishes, categories, banners, profile, canOrder } = store
  const hero = banners[0]
  const best = dishes.slice(0, 6)
  const intro = profile.about ? profile.about.split(/(?<=[.!?])\s/)[0] : "Freshly made, served with care. Order online for delivery or pickup."

  return (
    <main>
      <section className="relative min-h-svh overflow-hidden border-b border-border bg-primary text-primary-foreground">
        {hero?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.imageUrl} alt="" className="absolute inset-0 size-full object-cover object-[70%_center] sm:object-[64%_center]" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent sm:from-black/65 sm:via-black/30" />
        <div className={cn(STORE_CONTENT, "relative flex min-h-svh items-center py-20 text-white")}>
          <div className="max-w-xl">
            <p className="text-[10px] font-bold tracking-[0.34em] uppercase sm:text-xs">{hero?.subtitle || profile.tagline || dealer.city}</p>
            <h1 className="mt-4 max-w-[12ch] text-4xl leading-[1.08] font-semibold sm:max-w-xl sm:text-5xl lg:text-6xl">{hero?.title || dealer.displayName}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 sm:text-base">{intro}</p>
            <Link href="/menu" className={cn(buttonVariants({ size: "lg" }), "mt-7 bg-white px-8 text-base font-semibold text-foreground shadow-lg hover:bg-white/90")}>
              {canOrder ? "Order now" : "See the menu"}
            </Link>
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className={cn(STORE_CONTENT, "-mt-2 py-6 sm:py-8")} aria-label="Categories">
          <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((c) => (
              <CategoryChip key={c.id} href={`/category/${c.slug}`} label={c.name} />
            ))}
          </div>
        </section>
      ) : null}

      <section className={cn(STORE_CONTENT, "py-10 sm:py-12")}>
        <SectionTitle eyebrow="Best sellers" title="Our most-loved dishes" hint="Freshly made and ready to order." action={{ href: "/menu", label: "Full Menu" }} />
        {best.length > 0 ? (
          <div className={cn("mt-6", DISH_GRID)}>
            {best.map((d) => (
              <DishCard key={d.id} dish={d} canOrder={canOrder} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Our menu is coming soon. Please check back shortly.</p>
        )}
      </section>
    </main>
  )
}
