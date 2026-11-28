"use client"

import { useMemo, useState } from "react"
import { ArrowDown01Icon, Clock01Icon, DiscountTag01Icon, FilterHorizontalIcon, Medal01Icon, SortByDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useStoreTerms } from "@/components/restaurant/store/terms-context"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

type Sort = "popular" | "low" | "high"
type Diet = "all" | "veg" | "nonVeg"

const SORT_LABEL: Record<Sort, string> = {
  popular: "Popular",
  low: "Price: low to high",
  high: "Price: high to low",
}

const DIET_LABEL: Record<Diet, string> = {
  all: "Dietary",
  veg: "Veg",
  nonVeg: "Non-veg",
}

const PILL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-background px-3.5 text-sm whitespace-nowrap text-foreground shadow-[0_0_6px_1px_color-mix(in_oklab,var(--foreground)_9%,transparent),0_0_2px_color-mix(in_oklab,var(--foreground)_10%,transparent)] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"

const PILL_ON = "border-foreground bg-foreground text-background"

/** The sort and filter choices of a home screen, and the dishes that pass them. */
export function useDishFilters(dishes: StoreDish[]) {
  const [sort, setSort] = useState<Sort>("popular")
  const [diet, setDiet] = useState<Diet>("all")
  const [open, setOpen] = useState(false)
  const [offers, setOffers] = useState(false)
  const [best, setBest] = useState(false)

  const anyFilter =
    diet !== "all" || open || offers || best || sort !== "popular"
  const shown = useMemo(() => {
    const list = dishes.filter((d) => {
      if (diet === "veg" && !d.isVeg) return false
      if (diet === "nonVeg" && d.isVeg) return false
      if (open && !d.isAvailable) return false
      if (offers && offerPercent(d) === null) return false
      if (best && !d.isFeatured) return false
      return true
    })
    const unit = (d: StoreDish) =>
      d.portions.length ? Math.min(...d.portions.map((p) => p.price)) : d.price
    if (sort === "low") return [...list].sort((a, b) => unit(a) - unit(b))
    if (sort === "high") return [...list].sort((a, b) => unit(b) - unit(a))
    return list
  }, [dishes, diet, open, offers, best, sort])

  const clear = () => {
    setDiet("all")
    setOpen(false)
    setOffers(false)
    setBest(false)
    setSort("popular")
  }

  return { sort, setSort, diet, setDiet, open, setOpen, offers, setOffers, best, setBest, shown, anyFilter, clear }
}

/** The sort / filter strip, pinned while the products scroll. The caller says where it pins. */
export function FilterBar({ filters, className, ref }: { filters: ReturnType<typeof useDishFilters>; className?: string; ref?: React.Ref<HTMLDivElement> }) {
  const terms = useStoreTerms()
  const { sort, setSort, diet, setDiet, open, setOpen, offers, setOffers, best, setBest, anyFilter, clear } = filters
  return (
    <div
      ref={ref}
      className={cn("sticky z-30 mt-6 flex bg-background scroll-px-4 [scrollbar-width:none] gap-3 h-[3.25rem] shrink-0 items-center overflow-x-auto border-y border-border px-4 [&::-webkit-scrollbar]:hidden", className)}
      aria-label="Filters"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(PILL, sort !== "popular" && PILL_ON)}
        >
          <HugeiconsIcon
            icon={SortByDown01Icon}
            strokeWidth={2}
            className="size-4"
          />
          Sort
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
              <DropdownMenuRadioItem key={k} value={k}>
                {SORT_LABEL[k]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {terms.diet ? (
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(PILL, diet !== "all" && PILL_ON)}>
          {DIET_LABEL[diet]}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          <DropdownMenuRadioGroup
            value={diet}
            onValueChange={(v) => setDiet(v as Diet)}
          >
            <DropdownMenuRadioItem value="all">
              All {terms.items}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="veg">Veg</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="nonVeg">
              Non-veg
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      ) : null}
      <button
        type="button"
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(PILL, open && PILL_ON)}
      >
        <HugeiconsIcon
          icon={Clock01Icon}
          strokeWidth={2}
          className="size-4"
        />
        Open Now
      </button>
      <button
        type="button"
        aria-pressed={offers}
        onClick={() => setOffers((v) => !v)}
        className={cn(PILL, offers && PILL_ON)}
      >
        <HugeiconsIcon
          icon={DiscountTag01Icon}
          strokeWidth={2}
          className="size-4"
        />
        Offers
      </button>
      <button
        type="button"
        aria-pressed={best}
        onClick={() => setBest((v) => !v)}
        className={cn(PILL, best && PILL_ON)}
      >
        <HugeiconsIcon
          icon={Medal01Icon}
          strokeWidth={2}
          className="size-4 text-primary"
        />
        Bestsellers
      </button>
      {anyFilter ? (
        <button
          type="button"
          onClick={clear}
          className={cn(PILL, "text-muted-foreground")}
        >
          <HugeiconsIcon
            icon={FilterHorizontalIcon}
            strokeWidth={2}
            className="size-4"
          />
          Clear
        </button>
      ) : null}
    </div>
  )
}
