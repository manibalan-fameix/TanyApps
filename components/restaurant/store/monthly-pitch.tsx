import { CalendarCheckIn01Icon, DeliveryTruck01Icon, PercentCircleIcon, ShoppingBasket01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { buttonVariants } from "@/components/ui/button"
import type { MonthlyOffer } from "@/lib/restaurant/settings"
import { cn } from "@/lib/utils"

const STEPS = [
  { icon: ShoppingBasket01Icon, title: "Build your list", body: "Add the groceries you buy every month, one by one, in the quantity you want." },
  { icon: CalendarCheckIn01Icon, title: "Pick your day", body: "Choose the date of the month you want it delivered." },
  { icon: DeliveryTruck01Icon, title: "We deliver, you pay at the door", body: "Your order is packed and sent every month. Pause or change it any time." },
]

/** What a signed-out visitor sees at /monthly: the offer, how it works, and a sign-in button. */
export function MonthlyPitch({ offer, shop }: { offer: MonthlyOffer; shop: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-[calc(1rem+var(--safe-area-inset-top,0px))] pb-32 md:py-10">
      <div className="rounded-3xl bg-primary p-6 text-primary-foreground">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">Monthly groceries</p>
        <h1 className="mt-2 text-3xl leading-tight font-bold">Your monthly shopping, on autopilot.</h1>
        <p className="mt-3 text-sm opacity-90">
          Make your list once and {shop} delivers it every month.
          {offer.percentOff > 0 ? ` Subscribers save ${offer.percentOff}% on every bill` : ""}
          {offer.freeDelivery ? `${offer.percentOff > 0 ? " and get" : " Subscribers get"} free delivery.` : offer.percentOff > 0 ? "." : ""}
        </p>
        {offer.percentOff > 0 ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-3 py-1.5 text-sm font-bold text-primary">
            <HugeiconsIcon icon={PercentCircleIcon} strokeWidth={2} className="size-4" />
            {offer.percentOff}% off every month{offer.maxDiscount ? ` (up to ₹${offer.maxDiscount})` : ""}
          </p>
        ) : null}
      </div>

      <ol className="mt-6 grid gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl border bg-card p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
              <HugeiconsIcon icon={s.icon} strokeWidth={2} className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{i + 1}. {s.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* A route handler, not a page: it starts the phone sign-in and brings the customer straight back here. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/api/t/auth/start?next=/monthly" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-12 w-full text-base")}>
        Sign in with your mobile to start
      </a>
      <p className="mt-3 text-center text-xs text-muted-foreground">We send a one-time code to your phone. Nothing is charged: you pay when it is delivered.</p>
    </main>
  )
}
