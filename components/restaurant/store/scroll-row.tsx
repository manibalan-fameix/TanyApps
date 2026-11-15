"use client"

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** A section title with previous / next buttons, and a row of items that scrolls sideways under it. Buttons only show when there is more to see. */
export function ScrollRow({ title, subtitle, children, className, listClassName }: { title?: string; subtitle?: string; children: React.ReactNode; className?: string; listClassName?: string }) {
  const list = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const el = list.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    const el = list.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const go = (dir: 1 | -1) => list.current?.scrollBy({ left: dir * list.current.clientWidth * 0.85, behavior: "smooth" })
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
      <ul ref={list} onScroll={measure} className={cn("flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", title && "mt-4", listClassName)}>
        {children}
      </ul>
    </section>
  )
}
