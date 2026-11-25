"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Call02Icon, Facebook01Icon, Globe02Icon, InstagramIcon, Location01Icon, Mail01Icon, Navigation03Icon, StarIcon, Time04Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useStoreFooter } from "@/components/restaurant/store/footer-gate"
import { DishListSection } from "@/components/restaurant/store/dish-list"
import { ShopReviewForm } from "@/components/restaurant/forms"
import { formatClock, isOpenAt, nextOpeningLabel } from "@/lib/hours"
import { categoryLook } from "@/lib/restaurant/category-icon"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export type StoreInfo = {
  name: string
  /** Like Google's "Supermarket". */
  category: string
  /** The owner's photos, the first is the main one. */
  photos: string[]
  website: string
  instagram: string
  facebook: string
  /** WhatsApp number as 91XXXXXXXXXX, or empty. */
  whatsapp: string
  /** Where the shop's pin is, for the map. */
  coords: { lat: number; lng: number } | null
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
export type StoreReview = { id: string; name: string; rating: number; comment: string; media: { type: "image" | "video"; url: string }[]; date: string }

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


/** The categories of the home page: a chip bar that jumps to a section, and the sections of dishes. */
export function StoreTabs({ dishes, categories, canOrder }: { dishes: StoreDish[]; categories: StoreCategory[]; canOrder: boolean }) {
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
      // The chip bar is pinned directly under the header, so its bottom edge is the line a section's title has to cross.
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
    // Capture: on the web home the page card scrolls instead of the window, and scroll events do not bubble.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true })
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((x) => x.c.id).join(",")])

  useEffect(() => {
    const chip = nav.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)
    if (chip && nav.current) nav.current.scrollTo({ left: Math.max(chip.offsetLeft - 16, 0), behavior: "smooth" })
  }, [active])

  return (
    <div>
        {sections.length > 1 ? (
          <nav ref={nav} aria-label="Jump to a category" className="sticky top-[var(--head-h,10rem)] z-20 flex h-[3.25rem] items-center gap-5 md:gap-10 overflow-x-auto border-b border-border bg-background px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => (
              <button
                key={s.c.id}
                type="button"
                data-cat={s.c.id}
                aria-current={active === s.c.id ? "true" : undefined}
                onClick={() => goTo(uid, s.c.id)}
                className={cn("flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap transition-colors md:gap-2 md:text-base", active === s.c.id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {/* No colour of its own: the icon takes the label's, dark for the open category and light for the rest. */}
                <HugeiconsIcon icon={categoryLook(s.c.name).icon} strokeWidth={1.75} aria-hidden className="size-5 shrink-0 md:size-6" />
                {s.c.name}
              </button>
            ))}
          </nav>
        ) : null}
        {sections.map((s, i) => (
          <div key={s.c.id} id={`${uid}-cat-${s.c.id}`} className="scroll-mt-[calc(var(--head-h,10rem)+3.25rem)]">
            {i > 0 ? <div aria-hidden className="mt-6 h-2 bg-muted" /> : null}
            <DishListSection title={s.c.name} href={`/category/${s.c.slug}`} total={s.dishes.length} dishes={s.dishes.slice(0, 10)} canOrder={canOrder} />
          </div>
        ))}
    </div>
  )
}

function Fact({ icon, label, children }: { icon: Parameters<typeof HugeiconsIcon>[0]["icon"]; label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium">{label}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

const WEEK = [
  { key: "mon", short: "Mon", name: "Monday" },
  { key: "tue", short: "Tue", name: "Tuesday" },
  { key: "wed", short: "Wed", name: "Wednesday" },
  { key: "thu", short: "Thu", name: "Thursday" },
  { key: "fri", short: "Fri", name: "Friday" },
  { key: "sat", short: "Sat", name: "Saturday" },
  { key: "sun", short: "Sun", name: "Sunday" },
] as const

const ACTION = "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"

/** The shop's photos in a swipeable strip, the first one large, like the photo strip on a Google listing. */
function PhotoStrip({ photos, name }: { photos: string[]; name: string }) {
  if (photos.length === 0) return null
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={`Photos of ${name}`}>
      {photos.map((url, i) => (
        <li key={url} className={cn("shrink-0 snap-start overflow-hidden rounded-xl bg-muted", i === 0 ? "h-56 w-[78%] sm:h-72 sm:w-[28rem]" : "h-56 w-44 sm:h-72 sm:w-56", photos.length === 1 && "w-full sm:w-full")}>
          <a href={url} target="_blank" rel="noreferrer" className="block size-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={i === 0 ? name : ""} loading={i === 0 ? "eager" : "lazy"} className="size-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  )
}

/** The About body, laid out like a Google business card: photos, name, rating and open now, action buttons, details, map. Then the store footer. */
export function StoreAbout({ info, rating }: { info: StoreInfo; rating?: { value: number; count: number } | null }) {
  const footer = useStoreFooter()
  // Read after mount, so the server and the first client render match. The restaurant's own clock: India has no daylight saving.
  const [now, setNow] = useState<{ open: boolean | null; opensAt: string | null; today: string } | null>(null)
  useEffect(() => {
    const tick = () => setNow({ open: isOpenAt(info.schedule), opensAt: nextOpeningLabel(info.schedule), today: new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }) })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [info.schedule])

  const hasHours = WEEK.some((d) => info.schedule?.[d.key])
  const map = info.coords ? `https://www.openstreetmap.org/export/embed.html?bbox=${info.coords.lng - 0.006}%2C${info.coords.lat - 0.004}%2C${info.coords.lng + 0.006}%2C${info.coords.lat + 0.004}&layer=mapnik&marker=${info.coords.lat}%2C${info.coords.lng}` : null
  const hostOf = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "")

  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-5 sm:px-6">
        <PhotoStrip photos={info.photos} name={info.name} />

        <div>
          <h2 className="text-2xl font-bold tracking-tight">{info.name}</h2>
          {rating ? (
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="font-semibold">{rating.value.toFixed(1)}</span>
              <Stars value={Math.round(rating.value)} />
              <span className="text-muted-foreground">({rating.count})</span>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {info.category ? <span>{info.category}</span> : null}
            {info.category && now?.open != null ? " · " : null}
            {now?.open === true ? <span className="font-semibold text-success">Open now</span> : null}
            {now?.open === false ? <span><span className="font-semibold text-destructive">Closed</span>{now.opensAt ? ` · Opens ${now.opensAt}` : ""}</span> : null}
          </p>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {info.directionsUrl ? (
            <a href={info.directionsUrl} target="_blank" rel="noreferrer" className={cn(ACTION, "border-info bg-info text-background hover:bg-info/90")}>
              <HugeiconsIcon icon={Navigation03Icon} strokeWidth={2} className="size-4.5" />
              Directions
            </a>
          ) : null}
          {info.phone ? (
            <a href={`tel:${info.phone}`} className={ACTION}>
              <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-4.5" />
              Call
            </a>
          ) : null}
          {info.whatsapp ? (
            <a href={`https://wa.me/${info.whatsapp}`} target="_blank" rel="noreferrer" className={ACTION}>
              <HugeiconsIcon icon={WhatsappIcon} strokeWidth={2} className="size-4.5" />
              WhatsApp
            </a>
          ) : null}
          {info.website ? (
            <a href={info.website} target="_blank" rel="noreferrer" className={ACTION}>
              <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-4.5" />
              Website
            </a>
          ) : null}
          {info.instagram ? (
            <a href={info.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className={ACTION}>
              <HugeiconsIcon icon={InstagramIcon} strokeWidth={2} className="size-4.5" />
              Instagram
            </a>
          ) : null}
          {info.facebook ? (
            <a href={info.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className={ACTION}>
              <HugeiconsIcon icon={Facebook01Icon} strokeWidth={2} className="size-4.5" />
              Facebook
            </a>
          ) : null}
        </div>

        {info.tagline || info.about ? (
          <div>
            {info.tagline ? <h3 className="text-base font-bold tracking-tight">{info.tagline}</h3> : null}
            {info.about ? <p className="mt-1.5 leading-6 whitespace-pre-line text-muted-foreground">{info.about}</p> : null}
          </div>
        ) : null}

        <ul className="grid gap-4 rounded-xl border border-border p-4">
          {info.address ? <Fact icon={Location01Icon} label="Address">{info.address}</Fact> : null}
          {hasHours ? (
            <Fact icon={Time04Icon} label="Opening hours">
              <ul className="mt-1 grid max-w-xs gap-0.5">
                {WEEK.map((d) => {
                  const h = info.schedule?.[d.key]
                  const today = now?.today === d.short
                  return (
                    <li key={d.key} className={cn("flex justify-between gap-6", today && "font-semibold text-foreground")}>
                      <span>{d.name}</span>
                      <span>{h ? `${formatClock(h.open)} – ${formatClock(h.close)}` : "Closed"}</span>
                    </li>
                  )
                })}
              </ul>
            </Fact>
          ) : info.hours ? (
            <Fact icon={Time04Icon} label="Opening hours">{info.hours}</Fact>
          ) : null}
          {info.phone ? <Fact icon={Call02Icon} label="Phone"><a href={`tel:${info.phone}`} className="underline">{info.phone}</a></Fact> : null}
          {info.website ? <Fact icon={Globe02Icon} label="Website"><a href={info.website} target="_blank" rel="noreferrer" className="underline">{hostOf(info.website)}</a></Fact> : null}
          {info.email ? <Fact icon={Mail01Icon} label="Email"><a href={`mailto:${info.email}`} className="underline">{info.email}</a></Fact> : null}
          {info.deliveryText ? <Fact icon={Location01Icon} label="Delivery area">{info.deliveryText}</Fact> : null}
        </ul>

        {map ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <iframe title={`Map of ${info.name}`} src={map} loading="lazy" referrerPolicy="no-referrer" className="h-64 w-full border-0" />
            {info.directionsUrl ? (
              <a href={info.directionsUrl} target="_blank" rel="noreferrer" className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-info hover:bg-muted">
                View larger map
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      {footer}
    </>
  )
}

/** The Reviews body: the rating summary and the review list. */
export function StoreReviews({ reviews, rating, write = "hidden" }: { reviews: StoreReview[]; rating: { value: number; count: number } | null; write?: "signed-in" | "signed-out" | "done" | "hidden" }) {
  return (
    <>
        {write === "signed-in" ? <div className="mb-5"><ShopReviewForm /></div> : null}
        {write === "signed-out" ? (
          <div className="mb-5 flex flex-col items-center gap-3 rounded-xl border border-border p-4 text-center">
            <p className="font-medium">Been here? Tell others what you think.</p>
            <a href={`/api/t/auth/start?next=${encodeURIComponent("/info")}`} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Sign in to write a review</a>
          </div>
        ) : null}
        {write === "done" ? <p className="mb-5 rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">Thanks for reviewing this shop.</p> : null}
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-muted-foreground">No reviews yet. Be the first to tell us how it was.</p>
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
                  {r.media.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {r.media.filter((m) => m.type === "image").map((m) => (
                        <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-lg bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={`Photo from ${r.name}`} loading="lazy" className="size-full object-cover" />
                        </a>
                      ))}
                      {r.media.filter((m) => m.type === "video").map((m) => (
                        <video key={m.url} src={m.url} controls preload="metadata" playsInline className="max-h-60 w-full rounded-lg bg-black sm:w-auto" />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
    </>
  )
}
