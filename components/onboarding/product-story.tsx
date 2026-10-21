"use client"

import { useEffect, useState } from "react"

import {
  PRODUCT_STORY,
  PRODUCTS,
  type ProductKey,
} from "@/lib/products"
import { liveIndustry, useEnabledIndustries } from "@/components/onboarding/enabled-industries"

/** Side panel for products that do not have an animated how-it-works page yet. */
export function ProductStory({ product }: { product: ProductKey }) {
  const lines = PRODUCT_STORY[product]
  const name = PRODUCTS.find((p) => p.key === product)?.name ?? "Tany"
  const live = liveIndustry(PRODUCTS.find((p) => p.key === product)!, useEnabledIndustries()) !== undefined
  const [state, setState] = useState({ product, index: 0 })
  // Restart from the first caption when the product changes.
  const index = state.product === product ? state.index : 0

  useEffect(() => {
    const id = setInterval(
      () =>
        setState((s) => ({
          product,
          index: ((s.product === product ? s.index : 0) + 1) % lines.length,
        })),
      3200
    )
    return () => clearInterval(id)
  }, [product, lines.length])

  return (
    <div className="flex size-full flex-col items-center justify-center gap-10 px-10 text-center">
      <div>
        <p
          key={`${product}-${index}`}
          className="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-[15em] text-2xl font-semibold tracking-tight text-balance text-foreground duration-500"
        >
          {lines[index]}
        </p>
      </div>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={product}
          src={`/brand/${product}-icon.svg`}
          alt={name}
          className="size-44 animate-in zoom-in-75 fade-in duration-700"
        />
      </div>
      {!live ? (
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Coming soon
        </span>
      ) : null}
      <div className="flex gap-1.5" aria-hidden>
        {lines.map((_, i) => (
          <span
            key={i}
            className={
              i === index
                ? "h-1.5 w-6 rounded-full bg-foreground transition-all"
                : "h-1.5 w-1.5 rounded-full bg-foreground/25 transition-all"
            }
          />
        ))}
      </div>
    </div>
  )
}
