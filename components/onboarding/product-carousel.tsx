"use client"

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  SparkleIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { type IndustryKey } from "@/lib/industries"
import { PRODUCT_AUDIENCE, PRODUCTS, type ProductKey } from "@/lib/products"
import { liveIndustry, useEnabledIndustries } from "@/components/onboarding/enabled-industries"

const COUNT = PRODUCTS.length

/**
 * Phones and tablets: one full-width card per product in an endless carousel. The card in view and its
 * two neighbours sit side by side and slide together on the compositor, so a swipe follows the finger
 * and a flip never remounts anything. Neighbours stay loaded, so their animations are ready.
 */
export function ProductCarousel({
  value,
  onChange,
  onProductChange,
  renderStory,
}: {
  value: IndustryKey | null
  onChange: (key: IndustryKey | null) => void
  onProductChange?: (product: ProductKey) => void
  /** The product's animation, or null to show its icon instead. */
  renderStory?: (product: ProductKey) => React.ReactNode
}) {
  const enabled = useEnabledIndustries()
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      PRODUCTS.findIndex((p) => liveIndustry(p, enabled) === value)
    )
  )
  const [drag, setDrag] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; t: number } | null>(null)
  const latest = useRef({ value, onChange, onProductChange, enabled })
  useEffect(() => {
    latest.current = { value, onChange, onProductChange, enabled }
  })

  // Report the choice once the slide has settled, so the page behind does not re-render mid-slide.
  const firstRef = useRef(true)
  useEffect(() => {
    const product = PRODUCTS[index]
    const id = setTimeout(
      () => {
        const { value, onChange, onProductChange } = latest.current
        onProductChange?.(product.key)
        // Coming-soon products keep the last live choice so the preview stays put.
        const next = liveIndustry(product, latest.current.enabled)
        if (next && next !== value) onChange(next)
      },
      firstRef.current ? 0 : 340
    )
    firstRef.current = false
    return () => clearTimeout(id)
  }, [index])

  function go(delta: number) {
    setIndex((i) => (i + delta + COUNT) % COUNT)
  }
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select"))
        return
      goRef.current(e.key === "ArrowRight" ? 1 : -1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function release() {
    const start = startRef.current
    startRef.current = null
    if (!start || drag === null) return
    const width = trackRef.current?.clientWidth ?? 320
    const speed = Math.abs(drag) / Math.max(1, performance.now() - start.t)
    if (Math.abs(drag) > width * 0.2 || (speed > 0.4 && Math.abs(drag) > 24))
      go(drag < 0 ? 1 : -1)
    setDrag(null)
  }

  // The card in view and one either side, kept in product order so React never moves their nodes.
  const visible = [-1, 0, 1]
    .map((offset) => (index + offset + COUNT) % COUNT)
    .sort((a, b) => a - b)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label="Choose an app"
        onPointerDown={(e) => {
          startRef.current = { x: e.clientX, t: performance.now() }
          // Keep hearing the pointer if it leaves the track, so a release is never missed.
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const start = startRef.current
          if (!start) return
          const dx = e.clientX - start.x
          if (drag === null && Math.abs(dx) < 6) return
          setDrag(dx)
        }}
        onPointerUp={release}
        onPointerCancel={release}
        className="relative -mx-6 flex min-h-0 shrink touch-pan-y flex-col overflow-x-clip overflow-y-hidden select-none"
      >
        {/* Gives the track the card's height, so the arrows sit right under it. */}
        <div aria-hidden className="invisible flex min-h-0 flex-col px-5">
          <CardFace product={PRODUCTS[index]} />
        </div>
        {visible.map((i) => {
          const product = PRODUCTS[i]
          const rel = ((i - index + 1 + COUNT) % COUNT) - 1
          const story = renderStory?.(product.key)
          return (
            <div
              key={product.key}
              aria-hidden={rel !== 0}
              style={{
                transform: `translate3d(calc(${rel * 100}% + ${drag ?? 0}px), 0, 0)`,
                transition:
                  drag === null
                    ? "transform 360ms cubic-bezier(0.22, 0.8, 0.3, 1)"
                    : "none",
              }}
              className="absolute inset-0 flex flex-col px-5 will-change-transform"
            >
              <CardFace product={product} story={story} />
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center justify-center">
        <div className="flex items-center gap-1 rounded-full bg-background px-1 text-sm font-medium shadow-md">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous product"
            onClick={() => go(-1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <span className="tabular-nums">
            {index + 1} / {COUNT}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next product"
            onClick={() => go(1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The white card with the animation, name row and the audience strip tucked under it. */
function CardFace({
  product,
  story,
}: {
  product: (typeof PRODUCTS)[number]
  story?: React.ReactNode
}) {
  const live = liveIndustry(product, useEnabledIndustries()) !== undefined
  return (
    <div className="flex min-h-0 flex-col">
    <div className="relative z-10 flex min-h-0 flex-col overflow-hidden rounded-3xl bg-background">
      <div
        style={{ backgroundColor: `var(--ground-${product.key})` }}
        className="relative m-3 mb-0 h-[calc(100vw-54px)] min-h-0 shrink overflow-hidden rounded-2xl"
      >
        {story ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/brand/${product.key}-icon.svg`}
            alt=""
            className="absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2"
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/brand/${product.key}-icon.svg`}
          alt=""
          className="size-12 shrink-0"
        />
        <span className="text-3xl font-bold tracking-tight whitespace-nowrap">
          <span className="text-brand">tany</span>{" "}
          {product.name.replace(/^Tany/, "").toLowerCase()}
        </span>
        <span className="ml-auto shrink-0">
          {live ? (
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              className="size-7 text-primary"
            />
          ) : (
            <span
              style={{
                color: `var(--logo-${product.key})`,
                backgroundColor: `color-mix(in oklab, var(--logo-${product.key}) 12%, transparent)`,
              }}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
            >
              Coming soon
            </span>
          )}
        </span>
      </div>
    </div>
    {/* Tucked under the card: who the product is for. */}
    <div
      style={{
        backgroundColor: `var(--logo-${product.key})`,
        color: `var(--logo-${product.key}-fg)`,
      }}
      className="-mt-5 flex shrink-0 items-center justify-center gap-2.5 rounded-b-3xl px-4 pt-6 pb-2 text-xs font-medium whitespace-nowrap"
    >
      {PRODUCT_AUDIENCE[product.key].map((tag, n) => (
        <React.Fragment key={tag}>
          {n > 0 ? (
            <HugeiconsIcon
              icon={SparkleIcon}
              className="size-3.5 shrink-0 fill-current"
            />
          ) : null}
          <span>{tag}</span>
        </React.Fragment>
      ))}
    </div>
    </div>
  )
}
