import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const inr = new Intl.NumberFormat("en-IN")

// Floating bar pinned to the bottom of the buyer page: car name, key facts, price and the primary action.
export function BuyerBottomBar({
  title,
  facts,
  price,
  dealerPhone,
}: {
  title: string
  facts: string[]
  price: number | null
  dealerPhone: string | null
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-border bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-4 px-5 py-3 pb-[max(0.75rem,var(--safe-area-inset-bottom))] sm:px-8">
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-base font-medium tracking-tight sm:text-xl">{title}</p>
          {facts.length ? <p className="truncate text-sm text-muted-foreground">{facts.join(" · ")}</p> : null}
        </div>
        <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:gap-8">
          <div className="sm:text-right">
            <p className="text-lg font-medium tracking-tight sm:text-2xl">{price ? `₹${inr.format(price)}` : "Price on request"}</p>
            <p className="text-xs text-muted-foreground">Asking price</p>
          </div>
          {dealerPhone ? (
            <a href={`tel:${dealerPhone}`} className={cn(buttonVariants({ size: "lg" }), "h-10 px-8")}>
              Call dealer
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
