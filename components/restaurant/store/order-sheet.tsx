import {
  ChefHatIcon,
  CheckmarkCircle02Icon,
  Home01Icon,
  Motorbike01Icon,
  ShoppingBag01Icon,
  Store01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { STATUS_LABEL, type OrderStatus } from "@/lib/restaurant/orders"
import { cn } from "@/lib/utils"

/** The icon for each order status. The admin's orders screens use these too, so both sides match. */
export const STEP_ICON = {
  pending_payment: ShoppingBag01Icon,
  new: ShoppingBag01Icon,
  confirmed: Tick02Icon,
  preparing: ChefHatIcon,
  ready: Store01Icon,
  out_for_delivery: Motorbike01Icon,
  completed: Home01Icon,
  cancelled: CheckmarkCircle02Icon,
} as const

/** The bottom-sheet card of the tracking page: sits over the map when there is one, on its own otherwise. */
export function OrderSheet({ overlap, className, children }: { overlap?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("relative z-10 grid gap-4 border bg-card p-5 shadow-sm", overlap ? "-mt-6 rounded-t-3xl" : "rounded-3xl", className)}>
      {overlap ? <span aria-hidden className="mx-auto -mt-2 h-1 w-10 rounded-full bg-muted" /> : null}
      {children}
    </section>
  )
}

/** Icon-per-step progress line: done steps filled, the current step ringed, the rest muted. */
export function StepLine({ steps, at }: { steps: OrderStatus[]; at: number }) {
  return (
    <ol className="flex items-center" aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s} className={cn("flex items-center", i < steps.length - 1 && "flex-1")} aria-current={i === at ? "step" : undefined}>
          <span
            title={STATUS_LABEL[s]}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full border",
              i <= at ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              i === at && "ring-4 ring-primary/20",
            )}
          >
            <HugeiconsIcon icon={STEP_ICON[s]} className="size-4" />
            <span className="sr-only">{STATUS_LABEL[s]}{i < at ? " (done)" : i === at ? " (current)" : ""}</span>
          </span>
          {i < steps.length - 1 ? <span aria-hidden className={cn("mx-1 h-0.5 flex-1 rounded-full", i < at ? "bg-primary" : "bg-muted")} /> : null}
        </li>
      ))}
    </ol>
  )
}
