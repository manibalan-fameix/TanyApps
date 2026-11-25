"use client"

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { BannerDots } from "@/components/restaurant/store/promo-banners"
import { cn } from "@/lib/utils"

/**
 * The width of a product card in a wide-screen row: an equal share of the row, so whole cards fill it. Six on a full-width desktop,
 * five or four on narrower windows. The row's gap is 1rem, which each share leaves room for (gaps = cards - 1).
 */
export const PRODUCT_SLOT = "w-[calc((100%-3rem)/4)] shrink-0 snap-start lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]"

/**
 * A section title with previous / next buttons, and a row of items that scrolls sideways under it. Buttons only show when there is more to see.
 * With `dots` (the number of items) the row also gets the banner indicator. Several items fit on a wide screen, so the last ones can never
 * reach the left edge; each item is instead given an equal share of the scroll distance, and the arrows move one share at a time.
 */
export function ScrollRow({ title, subtitle, children, className, listClassName, dots = 0 }: { dots?: number; title?: string; subtitle?: string; children: React.ReactNode; className?: string; listClassName?: string }) {
  const list = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: true })
  const [active, setActive] = useState(0)
  const stepped = dots > 1

  const measure = useCallback(() => {
    const el = list.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    const max = el.scrollWidth - el.clientWidth
    setActive(stepped && max > 0 ? Math.round((el.scrollLeft / max) * (dots - 1)) : 0)
  }, [stepped, dots])

  useEffect(() => {
    const el = list.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const show = (i: number) => {
    const el = list.current
    if (el) el.scrollTo({ left: ((el.scrollWidth - el.clientWidth) * Math.min(Math.max(i, 0), dots - 1)) / (dots - 1), behavior: "smooth" })
  }
  const go = (dir: 1 | -1) => {
    if (stepped) show(active + dir)
    else list.current?.scrollBy({ left: dir * list.current.clientWidth * 0.85, behavior: "smooth" })
  }
  const canScroll = !(edge.start && edge.end)

  const arrow = "flex size-9 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-background"
  const prev = <button type="button" aria-label="Previous" disabled={edge.start} onClick={() => go(-1)} className={arrow}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" /></button>
  const next = <button type="button" aria-label="Next" disabled={edge.end} onClick={() => go(1)} className={arrow}><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" /></button>

  return (
    <section className={cn("relative", className)}>
      {title ? (
        <div className="flex items-end justify-between gap-4 px-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {canScroll ? <div className="flex shrink-0 gap-2">{prev}{next}</div> : null}
        </div>
      ) : canScroll ? (
        <>
          {!edge.start ? <div className="absolute top-1/2 left-1 z-10 -translate-y-1/2 shadow-md">{prev}</div> : null}
          {!edge.end ? <div className="absolute top-1/2 right-1 z-10 -translate-y-1/2 shadow-md">{next}</div> : null}
        </>
      ) : null}
      <ul ref={list} onScroll={measure} className={cn("flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", title && "mt-4", stepped && "snap-none", listClassName)}>
        {children}
      </ul>
      {stepped && canScroll ? <BannerDots count={dots} active={active} onSelect={show} /> : null}
    </section>
  )
}
