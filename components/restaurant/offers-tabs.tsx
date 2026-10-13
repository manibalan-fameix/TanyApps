import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** "Offers & Coupons" is one sidebar item with two pages: coupon codes and the banners shown on the menu page. */
export function OffersTabs({ active }: { active: "coupons" | "banners" }) {
  return (
    <div className="flex gap-1 self-start rounded-lg border p-1" role="group" aria-label="Offers">
      {(["coupons", "banners"] as const).map((k) => (
        <Link key={k} href={`/${k}`} aria-current={active === k} className={cn(buttonVariants({ size: "sm", variant: active === k ? "default" : "ghost" }))}>
          {k === "coupons" ? "Coupons" : "Banners"}
        </Link>
      ))}
    </div>
  )
}
