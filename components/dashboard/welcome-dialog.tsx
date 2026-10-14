"use client"

import Link from "next/link"
import { useState, useSyncExternalStore } from "react"

import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const subscribe = () => () => {}
const seenKey = (dealerId: string) => `tany:welcome-seen:${dealerId}`
function readSeen(dealerId: string) {
  try {
    return localStorage.getItem(seenKey(dealerId)) !== null
  } catch {
    return false
  }
}

/** One-time greeting for a dealer who has just created their showroom. */
export function WelcomeDialog({
  name,
  planLabel,
  maxLiveCars,
  free,
  dealerId,
  isNew,
  industry = "motors",
  menuLimit,
}: {
  name: string
  planLabel: string
  maxLiveCars: number
  free: boolean
  dealerId: string
  /** The showroom was created recently. */
  isNew: boolean
  industry?: "motors" | "restaurants"
  /** Restaurants: dishes allowed on the plan (null is unlimited). */
  menuLimit?: number | null
}) {
  const restaurant = industry === "restaurants"
  const capText = restaurant ? (menuLimit == null ? "unlimited dishes" : `up to ${menuLimit} dishes`) : `up to ${maxLiveCars} cars live`
  // Hidden on the server and until the browser says this dealer has not seen it, so there is no flash or mismatch.
  const seen = useSyncExternalStore(
    subscribe,
    () => readSeen(dealerId),
    () => true
  )
  const [dismissed, setDismissed] = useState(false)
  const open = isNew && !seen && !dismissed
  const setOpen = (next: boolean) => {
    if (next) return
    setDismissed(true)
    try {
      localStorage.setItem(seenKey(dealerId), "1")
    } catch {
      // Without storage it may show again next visit.
    }
  }

  const steps = restaurant
    ? [
        "Add your dishes and group them into categories.",
        "Share your menu link on WhatsApp and Instagram, or print it as a QR code.",
        "Watch orders and guest messages arrive here.",
      ]
    : [
        "Add your first car from a plate photo, a video or by voice.",
        "Share its link on WhatsApp and Instagram.",
        "Watch leads and test-drive bookings arrive here.",
      ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to TanyApps, {name}!</DialogTitle>
          <DialogDescription>
            Your {restaurant ? "menu page" : "showroom"} is live on the {planLabel} plan
            {free
              ? `, free for as long as you like with ${capText}. Upgrade any time.`
              : `, with ${capText}.`}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-2 text-sm">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Link
            href={restaurant ? "/menu/new" : "/cars/new"}
            onClick={() => setOpen(false)}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            {restaurant ? "Add my first dish" : "Add my first car"}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Explore the dashboard
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
