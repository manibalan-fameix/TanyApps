"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Beach02Icon, Call02Icon, Car01Icon, Menu01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { BackdropMap } from "@/components/cabs/tenant/backdrop-map"
import { BookingFlow, type Section } from "@/components/cabs/book/booking-flow"
import { SessionKeeper } from "@/components/cabs/book/session-keeper"
import { DealerMark } from "@/components/dealer-mark"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"

type FlowProps = Omit<ComponentProps<typeof BookingFlow>, "section" | "greeting" | "initial"> & { initial: ComponentProps<typeof BookingFlow>["initial"] }

/**
 * The cab operator's home as an app screen: a greyed map behind everything, Rides / Vacation tabs across the top, a menu button
 * on the map, and a sheet from the bottom holding the greeting, the search and the suggestions. On a phone the sheet rises
 * from the bottom edge; on a wide screen it is a card on the left.
 * `intro` is shown instead of the booking form when online booking is not set up (call and WhatsApp buttons).
 */
export function CabsAppFrame({ dealer, lang, signedIn, customerName, map, flow, intro, children }: {
  dealer: { name: string; logoUrl: string | null; phone: string | null }
  lang: Lang
  signedIn: boolean
  customerName: string | null
  map: { centre: [number, number]; zoom: number }
  flow: FlowProps | null
  intro: ReactNode
  children: ReactNode
}) {
  const t = bookingText(lang)
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const expandedRef = useRef(false)
  const [section, setSection] = useState<Section>(flow?.initial && flow.initial.tripType === "package_tour" ? "vacation" : "rides")
  const firstName = customerName?.trim().split(/\s+/)[0]
  const greeting = firstName ? t.hiWhereTo.replace("{name}", firstName) : t.whereTo
  const next: Lang = lang === "en" ? "ta" : "en"

  // Two resting places: peeking from the bottom, or filling the screen under the tab bar. `--sheet-y` is how far down the sheet sits.
  const COLLAPSED = "calc(100% - (60dvh - 3.5rem))"
  function settle(open: boolean) {
    const el = sheet.current
    if (!el) return
    expandedRef.current = open
    el.style.transition = ""
    el.style.setProperty("--sheet-y", open ? "0px" : COLLAPSED)
    setExpanded(open)
  }

  useEffect(() => {
    const el = sheet.current
    const root = frame.current
    if (!el || !root) return
    const narrow = window.matchMedia("(max-width: 767px)")
    el.style.setProperty("--sheet-y", COLLAPSED)

    // This screen is an app view: pull-to-refresh (which listens on the whole document) must not fire from the sheet or the map.
    const keep = (e: Event) => e.stopPropagation()
    root.addEventListener("touchstart", keep, { passive: true })
    root.addEventListener("touchmove", keep, { passive: true })
    root.addEventListener("touchend", keep, { passive: true })

    let startY = 0
    let startOffset = 0
    let travel = 0
    let dragging = false
    let tracking = false
    let lastY = 0
    let lastT = 0
    let velocity = 0

    const collapsedPx = () => Math.max(0, el.getBoundingClientRect().height - (window.innerHeight * 0.6 - 56))
    const offsetNow = () => (expandedRef.current ? 0 : collapsedPx())

    const onStart = (e: TouchEvent) => {
      if (!narrow.matches || e.touches.length !== 1) return
      const t = e.touches[0]!
      startY = lastY = t.clientY
      lastT = e.timeStamp
      velocity = 0
      startOffset = offsetNow()
      travel = collapsedPx()
      tracking = true
      dragging = false
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const y = e.touches[0]!.clientY
      const dy = y - startY
      const scroller = body.current
      if (!dragging) {
        // Collapsed: any vertical swipe drags the sheet. Open: only a pull down from the very top of the content does.
        const fromHandle = (e.target as HTMLElement).closest("button") !== null
        const atTop = !scroller || scroller.scrollTop <= 0
        const pullDown = expandedRef.current && atTop && dy > 6
        const swipe = !expandedRef.current && Math.abs(dy) > 6
        if (!(pullDown || swipe || (fromHandle && Math.abs(dy) > 6))) return
        dragging = true
        el.style.transition = "none"
      }
      if (e.cancelable) e.preventDefault()
      const dt = Math.max(1, e.timeStamp - lastT)
      velocity = (y - lastY) / dt
      lastY = y
      lastT = e.timeStamp
      const offset = Math.min(travel, Math.max(0, startOffset + dy))
      el.style.setProperty("--sheet-y", `${offset}px`)
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (!dragging) return
      dragging = false
      const current = parseFloat(el.style.getPropertyValue("--sheet-y")) || 0
      // A quick flick decides; otherwise the nearer resting place wins.
      const open = Math.abs(velocity) > 0.4 ? velocity < 0 : current < travel / 2
      settle(open)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)
    return () => {
      root.removeEventListener("touchstart", keep)
      root.removeEventListener("touchmove", keep)
      root.removeEventListener("touchend", keep)
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [])

  return (
    <div ref={frame} data-immersive className="relative h-dvh w-full overflow-hidden bg-muted">
      <BackdropMap centre={map.centre} zoom={map.zoom} label={dealer.name} locateLabel={t.locateMe} />

      <div className="absolute inset-x-0 top-0 z-20 bg-background pt-[var(--safe-area-inset-top,0px)] shadow-sm">
        {flow ? (
          <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="mx-auto w-full max-w-md gap-0">
            <TabsList variant="line" className="group-data-horizontal/tabs:h-16 w-full rounded-none border-b border-border p-0">
              <TabsTrigger value="rides" data-testid="section-rides" className="h-full gap-2.5 pb-3 rounded-none text-base font-semibold group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-[5px] after:bg-primary data-active:text-foreground">
                <HugeiconsIcon icon={Car01Icon} strokeWidth={2} className="size-6" />
                {t.tabRides}
              </TabsTrigger>
              <TabsTrigger value="vacation" data-testid="section-vacation" className="h-full gap-2.5 pb-3 rounded-none text-base font-semibold group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-[5px] after:bg-primary data-active:text-foreground">
                <HugeiconsIcon icon={Beach02Icon} strokeWidth={2} className="size-6" />
                {t.tabVacation}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
            <DealerMark name={dealer.name} logoUrl={dealer.logoUrl} />
            <span className="truncate font-semibold">{dealer.name}</span>
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="icon" aria-label={t.menu} className="absolute top-[calc(var(--safe-area-inset-top,0px)+4.75rem)] left-3 z-10 size-10 rounded-xl shadow-md md:right-16 md:left-auto" />}>
          <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-60 rounded-xl p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 p-2">
              <DealerMark name={dealer.name} logoUrl={dealer.logoUrl} className="size-8" />
              <span className="truncate text-sm font-semibold text-foreground">{dealer.name}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {signedIn ? (
            <>
              <DropdownMenuItem render={<Link href="/my/bookings" data-testid="nav-bookings" />} className="p-2">{t.myBookings}</DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/my" />} className="p-2">{t.myAccount}</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem render={<a href={`/api/t/auth/start?next=${encodeURIComponent("/my/bookings")}&lang=${lang}`} />} className="p-2">{t.signIn}</DropdownMenuItem>
          )}
          {dealer.phone ? (
            <DropdownMenuItem render={<a href={`tel:${dealer.phone}`} />} className="gap-2 p-2">
              <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-4" />
              {t.callOperator.replace("{operator}", dealer.phone.replace(/^\+91/, "+91 "))}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            lang={next}
            className="p-2"
            onClick={() => {
              document.cookie = `tany_lang=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
              router.refresh()
            }}
          >
            {t.otherLanguage}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {signedIn ? <SessionKeeper /> : null}

      <section
        ref={sheet}
        onFocusCapture={() => settle(true)}
        style={{ transform: "translateY(var(--sheet-y))" }}
        className={cn(
          "absolute inset-x-0 top-[calc(var(--safe-area-inset-top,0px)+4rem)] bottom-[calc(3.5rem+var(--safe-area-inset-bottom,0px))] z-10 flex flex-col border-t bg-background shadow-[0_-10px_40px_rgba(0,0,0,0.14)] will-change-transform [transition:transform_320ms_cubic-bezier(0.22,1,0.36,1),border-radius_320ms]",
          expanded ? "rounded-t-none" : "rounded-t-3xl",
          "md:inset-x-auto md:top-[calc(var(--safe-area-inset-top,0px)+5rem)] md:bottom-6 md:left-6 md:w-[26rem] md:rounded-3xl md:border md:transform-none!",
        )}
      >
        <button type="button" aria-label={expanded ? t.back : t.whereTo} aria-expanded={expanded} onClick={() => settle(!expandedRef.current)} className="mx-auto flex h-7 w-full shrink-0 touch-none items-center justify-center md:hidden">
          <span aria-hidden className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </button>
        <div ref={body} className={cn("flex flex-1 flex-col overflow-x-hidden overscroll-contain px-4 pt-2 pb-6", expanded ? "overflow-y-auto" : "overflow-y-hidden")}>
          {flow ? <BookingFlow key={section} {...flow} initial={section === "vacation" ? (flow.initial?.tripType === "package_tour" ? flow.initial : null) : flow.initial?.tripType === "package_tour" ? null : flow.initial} section={section} greeting={greeting} /> : intro}
          {children}
        </div>
      </section>
    </div>
  )
}
