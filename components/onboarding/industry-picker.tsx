"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle01Icon,
  Search01Icon,
  SparkleIcon,
} from "@hugeicons/core-free-icons"

import { LogoIcon, ProductLogo } from "@/components/logo"
import { ProductCarousel } from "@/components/onboarding/product-carousel"
import { ScrollHint } from "@/components/onboarding/scroll-hint"
import { Input } from "@/components/ui/input"
import { type IndustryKey } from "@/lib/industries"
import { PRODUCT_AUDIENCE, PRODUCTS, type ProductKey } from "@/lib/products"
import { cn } from "@/lib/utils"

/** Searchable product cards, three per row. Only products with an industry can be chosen; the rest are marked coming soon. */
export function IndustryPicker({
  value,
  onChange,
  variant = "default",
  onProductChange,
  renderStory,
}: {
  value: IndustryKey | null
  onChange: (key: IndustryKey | null) => void
  variant?: "default" | "explore"
  /** Explore variant, phones: the animation shown on each card; null falls back to the product icon. */
  renderStory?: (product: ProductKey) => React.ReactNode
  /** Explore variant: the product currently centred in the reel. */
  onProductChange?: (product: ProductKey) => void
}) {
  const compact = useIsCompact()
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const products = PRODUCTS.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.blurb.toLowerCase().includes(q)
  )

  if (variant === "explore" && compact) {
    return (
      <ProductCarousel
        value={value}
        onChange={onChange}
        onProductChange={onProductChange}
        renderStory={renderStory}
      />
    )
  }

  if (variant === "explore") {
    return (
      <ExploreProductScroller
        products={PRODUCTS}
        value={value}
        onChange={onChange}
        onProductChange={onProductChange}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <SearchField query={query} onChange={setQuery} className="pr-6" />
      {products.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No products match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Industry"
          className="onboarding-product-grid grid min-h-0 grid-cols-3 gap-3 overflow-y-auto p-1 pr-6 pb-40"
        >
          {products.map((p) => {
            const industry = "industry" in p ? p.industry : undefined
            const selected = industry !== undefined && value === industry
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!industry}
                onClick={() =>
                  industry && onChange(selected ? null : industry)
                }
                className={cn(
                  "relative flex flex-col items-start gap-3 rounded-xl border border-muted-foreground/25 p-4 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent",
                  selected && "border-primary bg-white ring-1 ring-primary"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/brand/${p.key}-icon.svg`}
                  alt=""
                  className="size-14 shrink-0"
                />
                <ProductLogo product={p.key} className="h-4" />
                {!industry ? (
                  <span className="absolute top-3 right-3 rounded-full bg-linear-to-r from-primary to-primary/70 px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Coming soon
                  </span>
                ) : null}
                {selected ? (
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    className="absolute top-3 right-3 size-5 text-primary"
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** True below lg, where the side animation panel is hidden. */
function useIsCompact() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia("(max-width: 1023px)")
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false
  )
}

function SearchField({
  query,
  onChange,
  className,
}: {
  query: string
  onChange: (query: string) => void
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search products, e.g. salon or garage"
        aria-label="Search products"
        className="bg-muted pl-9"
      />
    </div>
  )
}

function ExploreProductScroller({
  products,
  value,
  onChange,
  onProductChange,
}: {
  products: readonly (typeof PRODUCTS)[number][]
  value: IndustryKey | null
  onChange: (key: IndustryKey | null) => void
  onProductChange?: (product: ProductKey) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
  // -1 until the user picks: the card shows only "tany" and the list waits below it.
  const [activeIndex, setActiveIndex] = useState(() =>
    products.findIndex((p) => "industry" in p && p.industry === value)
  )

  const activeProduct = products[Math.max(0, activeIndex)]
  const hasSelection = activeIndex >= 0

  /** Centres a product in the card. Uses layout offsets, so the rows' translate nudges cannot skew it. */
  function scrollToIndex(index: number, behavior: ScrollBehavior) {
    const scroller = scrollerRef.current
    const item = itemsRef.current[index]
    if (!scroller || !item) return
    const top = item.offsetTop + item.offsetHeight / 2 - scroller.clientHeight / 2
    if (behavior === "auto") scroller.scrollTop = top
    else glideTo(top)
  }

  /** Eases the reel to a position in one continuous motion; a new target takes over from wherever it is. */
  function glideTo(top: number) {
    const scroller = scrollerRef.current
    if (!scroller) return
    cancelAnimationFrame(glideRef.current)
    const from = scroller.scrollTop
    const distance = top - from
    if (Math.abs(distance) < 1) return
    const duration = Math.min(650, 380 + Math.abs(distance) * 0.35)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // Ease out: quick off the mark, then settles gently.
      scroller.scrollTop = from + distance * (1 - Math.pow(1 - t, 3))
      if (t < 1) glideRef.current = requestAnimationFrame(tick)
    }
    glideRef.current = requestAnimationFrame(tick)
  }

  // Land on the chosen product when the step opens, if there is one.
  useEffect(() => {
    if (activeIndex < 0) return
    scrollToIndex(activeIndex, "auto")
    onProductChange?.(products[activeIndex].key)
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closestIndex() {
    const scroller = scrollerRef.current
    if (!scroller) return 0
    // Layout offsets, not bounding boxes: the rows are nudged with transforms
    // that lag behind a fast scroll and would skew the result.
    const center = scroller.scrollTop + scroller.clientHeight / 2
    let closest = 0
    let distance = Number.POSITIVE_INFINITY
    itemsRef.current.forEach((item, index) => {
      if (!item) return
      const nextDistance = Math.abs(item.offsetTop + item.offsetHeight / 2 - center)
      if (nextDistance < distance) {
        distance = nextDistance
        closest = index
      }
    })
    return closest
  }

  function choose(index: number) {
    if (index === activeIndex) return
    setActiveIndex(index)
    const product = products[index]
    const nextIndustry = "industry" in product ? product.industry : undefined
    onProductChange?.(product.key)
    // Coming-soon products keep the last live choice so the preview stays put.
    if (nextIndustry && nextIndustry !== value) onChange(nextIndustry)
  }

  /** Moves the reel exactly one product. Going up from the first product returns to the empty start. */
  function step(delta: number) {
    // Count from where the last step is heading, not from the card, which trails the animation.
    const next = Math.min(products.length - 1, targetRef.current + delta)
    if (next < 0) {
      targetRef.current = -1
      glideTo(0)
      return
    }
    targetRef.current = next
    // The card follows the scroll (syncFromScroll), so its text and icon never get ahead of the reel.
    scrollToIndex(next, "smooth")
  }
  const glideRef = useRef(0)
  const targetRef = useRef(activeIndex)
  const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => cancelAnimationFrame(glideRef.current), [])
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })

  // Wheel, trackpad and swipe move the reel by how far and fast they travel; arrow keys move one product.
  // They are heard anywhere on the page, not only over the list.
  useEffect(() => {
    // One flick moves one product. A fast flick adds one or two more. The fading tail of a trackpad
    // flick is ignored, so a small scroll never runs on.
    const FAST_SUM = 260 // scroll distance in the first 100ms that counts as a fast flick
    let gestureStart = 0
    let lastEvent = 0
    let lastAbs = 0
    let peak = 0
    let sum = 0
    let extraDone = true
    let dir = 1
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = performance.now()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const abs = Math.abs(e.deltaY) * unit
      if (abs < 2) return
      const gap = now - lastEvent
      lastEvent = now
      const growing = abs > lastAbs * 1.6 && now - gestureStart > 250
      // Still pushing as hard as at the start (a mouse wheel, steady scrolling): keep stepping.
      const steady = now - gestureStart > 450 && abs >= peak * 0.6
      lastAbs = abs
      if (gap > 120 || growing || steady) {
        gestureStart = now
        peak = abs
        sum = abs
        extraDone = false
        dir = e.deltaY > 0 ? 1 : -1
        stepRef.current(dir)
        return
      }
      peak = Math.max(peak, abs)
      if (extraDone) return
      if (now - gestureStart <= 100) {
        sum += abs
        return
      }
      extraDone = true
      const extra = Math.min(2, Math.floor(sum / FAST_SUM))
      if (extra > 0) stepRef.current(dir * extra)
    }
    let startY: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (startY === null) return
      const dy = startY - e.touches[0].clientY
      const n = Math.min(2, Math.floor(Math.abs(dy) / 90))
      if (n < 1) return
      startY = e.touches[0].clientY
      stepRef.current((dy > 0 ? 1 : -1) * n)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable]")) return
      e.preventDefault()
      stepRef.current(e.key === "ArrowDown" ? 1 : -1)
    }
    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  function syncFromScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    // Once scrolling settles, steps count from wherever the reel actually ended up.
    clearTimeout(settleRef.current)
    settleRef.current = setTimeout(() => {
      targetRef.current = scroller.scrollTop < 4 ? -1 : closestIndex()
    }, 120)
    // At the very top nothing is chosen: the card is empty and the list waits below it.
    if (scroller.scrollTop < 4) {
      if (hasSelection) {
        setActiveIndex(-1)
        onChange(null)
      }
      return
    }
    choose(closestIndex())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <div className={cn("relative min-h-0 flex-1 overflow-hidden rounded-3xl",
        "bg-transparent"
      )}>
      <div className="absolute inset-x-0 -top-56 bottom-0 flex justify-center">
       <div className="relative flex h-full items-stretch gap-3 max-sm:h-[147%] max-sm:origin-top max-sm:scale-[0.68]">
        {/* Layer tucked under the active card, holding who the product is for. */}
        {hasSelection ? (
          <div
            aria-hidden
            style={{
              top: "calc(50% + 2.5rem)",
              backgroundColor: `var(--logo-${activeProduct.key})`,
              color: `var(--logo-${activeProduct.key}-fg)`,
            }}
            className="pointer-events-none absolute -inset-x-6 flex h-10 items-center justify-center gap-4 rounded-b-3xl px-4 pt-4"
          >
            {PRODUCT_AUDIENCE[activeProduct.key].map((tag, i) => (
              <React.Fragment key={`${activeProduct.key}-${tag}`}>
                {i > 0 ? (
                  <HugeiconsIcon
                    icon={SparkleIcon}
                    className="size-3.5 shrink-0 fill-current"
                  />
                ) : null}
                <span className="animate-in fade-in text-xs font-medium whitespace-nowrap duration-500">
                  {tag}
                </span>
              </React.Fragment>
            ))}
          </div>
        ) : null}
        {/* Stroke box around the active card, with its status icon and description. */}
        <div
          aria-hidden
          style={{ top: "calc(50% - 3.5rem)" }}
          className={cn(
            "pointer-events-none absolute -inset-x-6 h-28 rounded-3xl bg-background"
          )}
        >
          <div className="absolute top-1/2 right-5 flex -translate-y-1/2 items-center gap-2">
            {hasSelection && !("industry" in activeProduct) ? (
              <span
                style={{
                  color: `var(--logo-${activeProduct.key})`,
                  backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(--logo-${activeProduct.key}) 18%, transparent), color-mix(in oklab, var(--logo-${activeProduct.key}) 6%, transparent))`,
                }}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap backdrop-blur-sm"
              >
                Coming soon
              </span>
            ) : null}
            {hasSelection && "industry" in activeProduct ? (
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                className="size-7 text-primary"
              />
            ) : null}
          </div>
        </div>
        {/* Fixed core: the product icon and "tany". Only the product name scrolls. */}
        <div className="pointer-events-none relative z-10 flex items-center select-none">
          <span className="relative mr-3 size-14 shrink-0">
            <LogoIcon
              className={cn(
                "absolute inset-0 size-full transition-[opacity,transform] duration-500",
                hasSelection ? "scale-75 opacity-0" : "scale-100 opacity-100"
              )}
            />
            {products.map((product, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={product.key}
                src={`/brand/${product.key}-icon.svg`}
                alt=""
                className={cn(
                  "absolute inset-0 size-full transition-[opacity,transform] duration-500",
                  index === activeIndex
                    ? "scale-100 opacity-100"
                    : "scale-75 opacity-0"
                )}
              />
            ))}
          </span>
          <span className="text-5xl font-bold tracking-tight text-brand">
            tany
          </span>
          {/* Sits where the product name will appear, in line with the list below. */}
          {!hasSelection ? <ScrollHint /> : null}
        </div>

        <div
          ref={scrollerRef}
          role="radiogroup"
          aria-label="Choose an app"
          onScroll={syncFromScroll}
          className={cn(
            "relative z-10 flex h-full flex-col overflow-y-auto pr-28 [scrollbar-width:none] sm:pr-36 [&::-webkit-scrollbar]:hidden"
          )}
        >
          {/* The extra 6rem leaves the card empty at scroll position 0, with the list waiting below it. */}
          <div aria-hidden className="h-[calc(50%+4.5rem)] shrink-0" />
          {products.map((product, index) => {
            const selected = index === activeIndex
            return (
              <button
                key={product.key}
                ref={(item) => {
                  itemsRef.current[index] = item
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={product.name}
                onClick={() => {
                  scrollToIndex(index, "smooth")
                }}
                className={cn(
                  "flex h-12 shrink-0 whitespace-nowrap items-center text-left tracking-tight transition-[color,opacity,transform,font-size] duration-300",
                  // Open up extra room above and below the selected card only.
                  index < activeIndex && "-translate-y-7",
                  index > activeIndex && hasSelection && "translate-y-20",
                  selected
                    ? "text-5xl font-bold text-foreground"
                    : "text-3xl font-semibold text-muted-foreground opacity-50 hover:opacity-80"
                )}
              >
                {product.name.replace(/^Tany/, "").toLowerCase()}
              </button>
            )
          })}
          <div aria-hidden className="h-[calc(50%-1.5rem)] shrink-0" />
        </div>
       </div>
      </div>
    </div>
    </div>
  )
}
