"use client"

import Link from "next/link"
import { useRef, useState } from "react"

import { BANNER_TONE_CLASS, type StoreBanner, isExternalLink } from "@/lib/restaurant/banners"
import { cn } from "@/lib/utils"

/** The Tany product colours the home banners cycle through, one per banner: a light ground, the deep colour on it, and the button's text. */
const PRODUCT_LOOKS = ["tanyeats", "tanycabs", "tanyecom", "tanymotos", "tanyretail", "tanygaming"] as const

function productStyle(i: number) {
  const k = PRODUCT_LOOKS[i % PRODUCT_LOOKS.length]
  return { card: { backgroundColor: `var(--ground-${k})`, color: `var(--logo-${k})` }, button: { backgroundColor: `var(--logo-${k})`, color: `var(--logo-${k}-fg)` }, panel: { backgroundColor: `var(--logo-${k})`, color: `var(--logo-${k}-fg)` } }
}

/** Splits the offer text into at most three lines of near-equal width, breaking only between words ("ZERO DELIVERY FEE*" -> ZERO / DELIVERY / FEE*). */
function offerLines(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 3) return words
  let best: string[] = [words.join(" ")]
  let bestWidth = Infinity
  for (let i = 1; i < words.length - 1; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const lines = [words.slice(0, i).join(" "), words.slice(i, j).join(" "), words.slice(j).join(" ")]
      const width = Math.max(...lines.map((l) => l.length))
      if (width < bestWidth) { best = lines; bestWidth = width }
    }
  }
  return best
}

/** The offer text: three bold lines, sized so the longest line fills the panel's width. */
function OfferText({ text }: { text: string }) {
  const lines = offerLines(text)
  const longest = Math.max(...lines.map((l) => l.length), 1)
  // Black-weight capitals are about 0.68em wide; 88cqw leaves a margin inside the panel.
  const size = `min(calc(1.35rem + 10px), ${(96 / (longest * 0.68)).toFixed(1)}cqw)`
  return (
    <p style={{ fontSize: size }} className="w-full font-black leading-[1.15] tracking-tight uppercase [-webkit-text-stroke:1.2px_currentColor] [paint-order:stroke_fill]">
      {lines.map((l, i) => <span key={i} className="block whitespace-nowrap">{l}</span>)}
    </p>
  )
}

/**
 * One promo banner: a short title, a line of text and a button on the left, a picture on the right.
 * With a link the whole banner is tappable; the button is the visible cue for it.
 */
export function PromoBanner({ banner, className, look }: { banner: Omit<StoreBanner, "id">; className?: string; look?: number }) {
  const product = look === undefined ? null : productStyle(look)
  const tone = BANNER_TONE_CLASS[banner.tone]
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 py-4 pr-2 pl-4">
        <p className="line-clamp-2 text-[19px] leading-[1.1] font-extrabold tracking-tight">{banner.title}</p>
        {banner.subtitle ? <p className="line-clamp-2 text-xs leading-snug opacity-90">{banner.subtitle}</p> : null}
        {banner.buttonLabel && banner.linkUrl ? (
          <span style={product?.button} className={cn("mt-2 inline-flex h-8 items-center rounded-full px-4 text-xs font-bold", !product && tone.button)}>{banner.buttonLabel}</span>
        ) : null}
      </div>
      {banner.promoText || banner.imageUrl ? (
        // The offer side: a solid dark panel carrying the big offer text, with the picture (if any) faded behind it.
        <div style={product?.panel} className={cn("relative isolate flex w-[40%] shrink-0 items-center justify-center overflow-hidden p-3 text-center [container-type:inline-size]", !product && "bg-foreground text-background")}>
          {banner.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.imageUrl} alt="" loading="lazy" className={cn("absolute inset-0 -z-10 size-full object-cover", banner.promoText ? "opacity-30" : "opacity-100")} />
          ) : null}
          {banner.promoText ? <OfferText text={banner.promoText} /> : null}
        </div>
      ) : (
        <div className="w-4 shrink-0" />
      )}
    </>
  )
  const base = cn("flex h-40 w-full overflow-hidden rounded-2xl border border-foreground/10", !product && tone.card, className)
  if (!banner.linkUrl) return <div className={base} style={product?.card}>{body}</div>
  return isExternalLink(banner.linkUrl) ? (
    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={base} style={product?.card} aria-label={banner.title}>
      {body}
    </a>
  ) : (
    <Link href={banner.linkUrl} className={base} style={product?.card} aria-label={banner.title}>
      {body}
    </Link>
  )
}

/** A dot for each banner, with the one on show widened into a "1/5" count. Nothing is drawn for a single banner. */
export function BannerDots({ count, active, onSelect }: { count: number; active: number; onSelect: (i: number) => void }) {
  if (count < 2) return null
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5" role="group" aria-label="Banner">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Banner ${i + 1} of ${count}`}
          aria-current={active === i ? "true" : undefined}
          className={cn(
            "flex items-center justify-center rounded-full transition-all",
            active === i ? "h-5 min-w-10 bg-primary px-2.5 text-xs leading-none font-semibold text-primary-foreground tabular-nums" : "size-1.5 bg-muted-foreground/30"
          )}
        >
          {active === i ? `${i + 1}/${count}` : null}
        </button>
      ))}
    </div>
  )
}

/** Swipeable row of the restaurant's banners, shown under the search bar on the phone home screen, with a dot for each banner below it. */
export function PromoBanners({ banners }: { banners: StoreBanner[] }) {
  const list = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  if (banners.length === 0) return null

  // The banner whose left edge is nearest the start of the row is the one on show.
  const onScroll = () => {
    const el = list.current
    if (!el) return
    const items = Array.from(el.children) as HTMLElement[]
    const at = items.reduce((best, li, i) => (Math.abs(li.offsetLeft - el.scrollLeft - items[0].offsetLeft) < Math.abs(items[best].offsetLeft - el.scrollLeft - items[0].offsetLeft) ? i : best), 0)
    // At the far end the last banner may not reach the start, so the end of the row counts as the last one.
    setActive(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 ? items.length - 1 : at)
  }
  const go = (i: number) => {
    const el = list.current
    const li = el?.children[i] as HTMLElement | undefined
    if (el && li) el.scrollTo({ left: li.offsetLeft - (el.children[0] as HTMLElement).offsetLeft, behavior: "smooth" })
  }

  return (
    <section aria-label="Offers" className="mt-4">
      <ul ref={list} onScroll={onScroll} className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {banners.map((b, i) => (
          <li key={b.id} className={cn("snap-start", banners.length === 1 ? "w-full" : "w-[86%] max-w-sm shrink-0")}>
            <PromoBanner banner={b} look={i} />
          </li>
        ))}
      </ul>
      <BannerDots count={banners.length} active={active} onSelect={go} />
    </section>
  )
}
