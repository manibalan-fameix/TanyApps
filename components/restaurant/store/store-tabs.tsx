"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Call02Icon, Location01Icon, Mail01Icon, StarIcon, Time04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DishListSection } from "@/components/restaurant/store/dish-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export type StoreInfo = {
  tagline: string
  about: string
  address: string
  hours: string | null
  /** The raw weekly schedule, for the live Open / Closed labels. */
  schedule?: import("@/lib/hours").BusinessHours | null
  phone: string | null
  email: string
  deliveryText: string | null
  directionsUrl: string | null
}
export type StoreReview = { id: string; name: string; rating: number; comment: string; date: string }

// Pill tabs: the active one is a filled dark pill, the others are light grey pills.
const TRIGGER = "h-9! flex-none rounded-full border-0 bg-muted! px-4 text-sm font-medium text-muted-foreground after:hidden data-active:bg-foreground! data-active:font-semibold data-active:text-background!"

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <HugeiconsIcon key={n} icon={StarIcon} strokeWidth={2} className={cn("size-3.5", n <= value ? "fill-current text-primary" : "text-muted-foreground/40")} />
      ))}
    </span>
  )
}

function goTo(uid: string, id: string) {
  document.getElementById(`${uid}-cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
}


/** Categories, About and Reviews as underlined tabs. Categories jump to a section of the dish list. */
export function StoreTabs({ dishes, categories, canOrder, info, reviews, rating }: { dishes: StoreDish[]; categories: StoreCategory[]; canOrder: boolean; info: StoreInfo; reviews: StoreReview[]; rating: { value: number; count: number } | null }) {
  const sections = categories.map((c) => ({ c, dishes: dishes.filter((d) => d.categoryId === c.id) })).filter((s) => s.dishes.length > 0)
  // The phone and the desktop home both mount this component (one is hidden by CSS), so element ids must be unique per copy.
  const uid = useId()
  const [active, setActive] = useState(sections[0]?.c.id ?? "")
  const nav = useRef<HTMLElement>(null)

  // Follow the list: the chip of the category on screen is the active one, and it scrolls into view in the chip row.
  useEffect(() => {
    if (sections.length < 2) return
    let frame = 0
    const update = () => {
      frame = 0
      // The chip bar is pinned under the header and tab bar, so its bottom edge is the line a section's title has to cross.
      const line = (nav.current?.getBoundingClientRect().bottom ?? 200) + 8
      let current = sections[0].c.id
      for (const sec of sections) {
        const el = document.getElementById(`${uid}-cat-${sec.c.id}`)
        if (el && el.getBoundingClientRect().top <= line) current = sec.c.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((x) => x.c.id).join(",")])

  useEffect(() => {
    const chip = nav.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)
    if (chip && nav.current) nav.current.scrollTo({ left: Math.max(chip.offsetLeft - 16, 0), behavior: "smooth" })
  }, [active])

  return (
    <Tabs defaultValue="categories" className="gap-0">
      <TabsList variant="line" className="sticky top-[calc(var(--head-h,10rem)+3.25rem)] z-30 h-[3.25rem]! w-full justify-start gap-2 border-b border-border bg-background px-4 py-2">
        <TabsTrigger value="categories" className={TRIGGER}>Categories</TabsTrigger>
        <TabsTrigger value="about" className={TRIGGER}>About</TabsTrigger>
        <TabsTrigger value="reviews" className={TRIGGER}>Reviews{reviews.length ? ` (${rating?.count ?? reviews.length})` : ""}</TabsTrigger>
      </TabsList>

      <TabsContent value="categories">
        {sections.length > 1 ? (
          <nav ref={nav} aria-label="Jump to a category" className="sticky top-[calc(var(--head-h,10rem)+6.5rem)] z-20 flex h-[3.25rem] items-center gap-5 overflow-x-auto border-b border-border bg-background px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => (
              <button
                key={s.c.id}
                type="button"
                data-cat={s.c.id}
                aria-current={active === s.c.id ? "true" : undefined}
                onClick={() => goTo(uid, s.c.id)}
                className={cn("shrink-0 text-sm whitespace-nowrap transition-colors", active === s.c.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {s.c.name}
              </button>
            ))}
          </nav>
        ) : null}
        {sections.map((s, i) => (
          <div key={s.c.id} id={`${uid}-cat-${s.c.id}`} className="scroll-mt-[calc(var(--head-h,10rem)+9.75rem)]">
            {i > 0 ? <div aria-hidden className="mt-6 h-2 bg-muted" /> : null}
            <DishListSection title={s.c.name} href={`/category/${s.c.slug}`} total={s.dishes.length} dishes={s.dishes.slice(0, 4)} canOrder={canOrder} />
          </div>
        ))}
      </TabsContent>

      <TabsContent value="about" className="px-4 pt-5 text-sm md:max-w-3xl">
        {info.tagline ? <h2 className="text-lg font-bold tracking-tight">{info.tagline}</h2> : null}
        {info.about ? <p className="mt-2 leading-6 whitespace-pre-line text-muted-foreground">{info.about}</p> : null}
        <ul className="mt-5 grid gap-4 rounded-xl border border-border p-4">
          {info.address ? <Fact icon={Location01Icon} label="Address">{info.address}</Fact> : null}
          {info.hours ? <Fact icon={Time04Icon} label="Opening hours">{info.hours}</Fact> : null}
          {info.phone ? <Fact icon={Call02Icon} label="Phone"><a href={`tel:${info.phone}`} className="underline">{info.phone}</a></Fact> : null}
          {info.email ? <Fact icon={Mail01Icon} label="Email"><a href={`mailto:${info.email}`} className="underline">{info.email}</a></Fact> : null}
          {info.deliveryText ? (
            <Fact icon={Location01Icon} label="Delivery area">
              {info.deliveryText}
              {info.directionsUrl ? <> <a className="underline" target="_blank" rel="noreferrer" href={info.directionsUrl}>Get directions</a></> : null}
            </Fact>
          ) : null}
        </ul>
      </TabsContent>

      <TabsContent value="reviews" className="px-4 pt-5 text-sm">
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">No reviews yet. Order and tell us how it was.</p>
        ) : (
          <>
            {rating ? (
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold tracking-tight">{rating.value.toFixed(1)}</span>
                <div>
                  <Stars value={Math.round(rating.value)} />
                  <p className="mt-0.5 text-xs text-muted-foreground">{rating.count} {rating.count === 1 ? "review" : "reviews"}</p>
                </div>
              </div>
            ) : null}
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{r.name}</span>
                    <time dateTime={r.date} className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time>
                  </div>
                  <div className="mt-1"><Stars value={r.rating} /></div>
                  {r.comment ? <p className="mt-2 leading-5 text-muted-foreground">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </TabsContent>
    </Tabs>
  )
}

function Fact({ icon, label, children }: { icon: Parameters<typeof HugeiconsIcon>[0]["icon"]; label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}
