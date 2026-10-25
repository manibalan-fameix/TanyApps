"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar03Icon, Home01Icon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import { cn } from "@/lib/utils"

/**
 * The app-style tab bar at the bottom of a phone screen: Home, Bookings, Account. A signed-out customer who taps Bookings or
 * Account goes through the phone login first and lands where they were headed. Hidden on wide screens, which keep the header.
 */
export function CabsBottomNav({ lang, signedIn }: { lang: Lang; signedIn: boolean }) {
  const t = bookingText(lang)
  const path = usePathname()
  const gate = (to: string) => (signedIn ? to : `/api/t/auth/start?next=${encodeURIComponent(to)}&lang=${lang}`)
  const items = [
    { key: "home", label: t.navHome, icon: Home01Icon, href: "/", active: path === "/", plain: true },
    { key: "bookings", label: t.navBookings, icon: Calendar03Icon, href: gate("/my/bookings"), active: path.startsWith("/my/bookings"), plain: signedIn },
    { key: "account", label: t.navAccount, icon: UserCircleIcon, href: gate("/my"), active: path === "/my" || (path.startsWith("/my/") && !path.startsWith("/my/bookings")), plain: signedIn },
  ]
  return (
    <nav aria-label={t.menu} className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[var(--safe-area-inset-bottom,0px)] md:hidden">
      <ul className="mx-auto flex h-14 max-w-md items-stretch">
        {items.map((i) => {
          const body = (
            <>
              <HugeiconsIcon icon={i.icon} strokeWidth={i.active ? 2.5 : 2} className="size-6" />
              <span className={cn("text-[11px]", i.active ? "font-semibold" : "font-medium")}>{i.label}</span>
            </>
          )
          const cls = cn("flex size-full flex-col items-center justify-center gap-0.5", i.active ? "text-primary" : "text-muted-foreground")
          return (
            <li key={i.key} className="flex-1">
              {i.plain ? (
                <Link href={i.href} aria-current={i.active ? "page" : undefined} data-testid={`bottom-${i.key}`} className={cls}>{body}</Link>
              ) : (
                // The login start is a route handler, so it needs a full navigation rather than a client transition.
                <a href={i.href} data-testid={`bottom-${i.key}`} className={cls}>{body}</a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
