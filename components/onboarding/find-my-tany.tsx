"use client"

import { useState, useTransition } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  CheckmarkCircle01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import { findMyProduct } from "@/app/(admin)/onboarding/actions"
import { ProductLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { type IndustryKey } from "@/lib/industries"
import { PRODUCT_EXAMPLES, PRODUCTS, type ProductKey } from "@/lib/products"
import { cn } from "@/lib/utils"

const EXAMPLES = PRODUCTS.map((p) => ({ key: p.key, ...PRODUCT_EXAMPLES[p.key] }))

/** Describe the business in a sentence; the AI picks the closest product and selects it when it is live. */
export function FindMyTany({
  onPick,
}: {
  /** The recommended product, and its industry when it is live; both null when cleared. */
  onPick: (industry: IndustryKey | null, product: ProductKey | null) => void
}) {
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    product: ProductKey
    reason: string
  } | null>(null)

  function recommend(description: string) {
    setError(null)
    startTransition(async () => {
      const res = await findMyProduct(description)
      if (!res.ok) {
        setResult(null)
        setError(res.error)
        return
      }
      setResult(res)
      const picked = PRODUCTS.find((p) => p.key === res.product)
      onPick(picked && "industry" in picked ? picked.industry : null, res.product)
    })
  }

  const match = result ? PRODUCTS.find((p) => p.key === result.product) : undefined
  const live = match !== undefined && "industry" in match

  // Once there is a recommendation it replaces the form; Back returns to the form with the text kept.
  if (result && match) {
    return (
      <div className="flex flex-col gap-4 pr-6 max-lg:pr-0">
        <div>
          <h2 className="text-lg font-semibold">We recommend</h2>
          <p className="text-sm text-foreground/70">
            Based on &ldquo;{text.trim()}&rdquo;
          </p>
        </div>
        <div
          style={{ backgroundColor: `var(--logo-${match.key}-fg)` }}
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4",
            "border-primary ring-1 ring-primary"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/brand/${match.key}-icon.svg`} alt="" className="size-14 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ProductLogo product={match.key} className="h-4 self-start" />
            <p className="text-sm text-foreground/80">{result.reason}</p>
            {!live ? (
              <p className="text-xs font-medium text-primary">
                Coming soon. Browse products and pick TanyMotos or TanyEats to continue.
              </p>
            ) : null}
          </div>
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-6 shrink-0 text-primary" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="self-start"
          onClick={() => {
            setResult(null)
            setError(null)
            onPick(null, null)
          }}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-6 max-lg:pr-0">
      <Textarea
        value={text}
        maxLength={300}
        aria-label="Describe your business or paste a link"
        placeholder="Describe your business, or paste your website or Instagram link"
        className="min-h-24 rounded-xl border-foreground/30 bg-background text-foreground shadow-xs placeholder:text-muted-foreground"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim() && !pending) {
            e.preventDefault()
            recommend(text)
          }
        }}
      />
      <div className="flex flex-wrap gap-3 max-lg:gap-2">
        {EXAMPLES.map(({ key, lead, focus }) => (
          <button
            key={focus}
            type="button"
            disabled={pending}
            onClick={() => {
              setText(lead + focus)
              recommend(lead + focus)
            }}
            className="flex items-center gap-2 rounded-full border border-foreground/30 bg-background py-1.5 pl-1.5 pr-3 text-sm text-foreground max-lg:text-[13px] transition-colors hover:bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/brand/${key}-glyph.svg`} alt="" className="size-5 shrink-0" />
            <span>
              <span className="text-foreground/60">{lead}</span>
              <span className="font-semibold text-foreground">{focus}</span>
            </span>
          </button>
        ))}
      </div>
      {text.trim().length >= 3 || pending ? (
        <Button
          type="button"
          size="lg"
          className="sticky bottom-0 z-10 h-12 w-full shrink-0 shadow-lg"
          disabled={pending}
          onClick={() => recommend(text)}
        >
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
          {pending ? "Finding your Tany..." : "Recommend my product"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
