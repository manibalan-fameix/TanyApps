"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { Location01Icon, Restaurant01Icon, Scooter01Icon, Search01Icon, ShoppingBag01Icon, Store01Icon, StoreLocation01Icon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { RotatingSearchInput } from "@/components/restaurant/store/rotating-search-input"
import { DeliveryStrip, OpenTag } from "@/components/restaurant/store/app-home"
import { readFulfilmentPref, writeFulfilmentPref } from "@/components/restaurant/store/fulfilment-pref"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"
import type { StoreInfo } from "@/components/restaurant/store/store-tabs"
import { isOpenAt, nextOpeningLabel } from "@/lib/hours"
import { type Fulfilment, FULFILMENT_LABEL } from "@/lib/restaurant/settings"

const MODE_ICON = { delivery: Scooter01Icon, pickup: Store01Icon, dine_in: Restaurant01Icon } as const

type WebHeaderData = {
  name: string
  logoUrl: string | null
  fulfilments: Fulfilment[]
  canOrder: boolean
  schedule: StoreInfo["schedule"]
  /** Where the shop is, shown under its name. */
  location: string | null
  /** Things to suggest in the search box, one after another. */
  searchHints: string[]
  /** Where the restaurant is, so the strip can estimate a delivery time. */
  origin: { lat: number; lng: number } | null
  directionsUrl: string | null
}

type WebHeaderState = WebHeaderData & {
  modes: Fulfilment[]
  mode: Fulfilment | null
  setMode: (m: Fulfilment) => void
  hoursOpen: boolean | null
  closed: string | null
  /** The delivery strip is showing under the header. */
  strip: boolean
}

const WebHeaderContext = createContext<WebHeaderState | null>(null)

/** Order type, opening hours and whether the strip shows. Shared by the web header and the home page under it. */
export function WebHeaderProvider({ data, children }: { data: WebHeaderData; children: React.ReactNode }) {
  const { fulfilments, schedule } = data
  const modes = useMemo(() => fulfilments.filter((f) => f !== "dine_in"), [fulfilments])
  const [mode, setModeState] = useState<Fulfilment | null>(modes[0] ?? null)
  const [inHours, setInHours] = useState<boolean | null>(null)
  const [opensAt, setOpensAt] = useState<string | null>(null)

  // Read after mount (and every minute) so the server and first client render match.
  useEffect(() => {
    const tick = () => {
      setInHours(isOpenAt(schedule))
      setOpensAt(nextOpeningLabel(schedule))
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [schedule])
  useEffect(() => {
    const saved = readFulfilmentPref()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && saved !== "dine_in" && modes.includes(saved)) setModeState(saved)
  }, [modes])

  const hoursOpen = inHours ?? (schedule ? null : true)
  const value: WebHeaderState = {
    ...data,
    modes,
    mode,
    setMode: (m) => {
      setModeState(m)
      writeFulfilmentPref(m)
    },
    hoursOpen,
    closed: hoursOpen === false ? (opensAt ?? "later") : null,
    strip: mode === "delivery" || mode === "pickup",
  }
  return <WebHeaderContext.Provider value={value}>{children}</WebHeaderContext.Provider>
}

function useWebHeader() {
  const v = useContext(WebHeaderContext)
  if (!v) throw new Error("WebHeaderProvider is missing")
  return v
}

/** Is this browser signed in to the shop? Asked after the page loads (so pages stay cacheable); null until the answer is back. */
function useSignedIn() {
  const pathname = usePathname()
  const [state, setState] = useState<{ signedIn: boolean | null; name: string | null }>({ signedIn: null, name: null })
  useEffect(() => {
    let live = true
    fetch("/api/t/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { signedIn?: boolean; name?: string | null } | null) => {
        if (live) setState({ signedIn: Boolean(d?.signedIn), name: d?.name ?? null })
      })
      .catch(() => live && setState({ signedIn: false, name: null }))
    return () => {
      live = false
    }
  }, [pathname])
  return state
}

/** Whether the delivery strip is showing, so the page under the header can offset its sticky bars. */
export function useWebStrip() {
  return useWebHeader().strip
}

/**
 * The header on every page from tablet width up: brand, Delivery / Pickup tabs, search, sign in and cart, with the delivery strip tucked under
 * it. Fixed to the top; the page scrolls under it, so a spacer holds its place in the flow.
 */
export function StoreWebHeader() {
  const terms = useStoreTerms()
  const cart = useCart()
  const { name, logoUrl, canOrder, location, searchHints, origin, directionsUrl, modes, mode, setMode, hoursOpen, closed, strip } = useWebHeader()
  const pathname = usePathname()
  const account = useSignedIn()
  // The checkout is a focused page with its own pinned top, so the site header and the strip beside it step aside.
  if (pathname === "/cart" || pathname.startsWith("/checkout")) return null

  return (
    <div className="hidden md:block">
      {/* The wrapper ignores the pointer so only the header and strip catch clicks. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <header className="pointer-events-auto relative z-10 rounded-b-3xl border-x border-b border-foreground/10 bg-background shadow-sm">
          <div className="mx-auto flex h-20 max-w-7xl items-center gap-3 px-4">
            <Link href="/" aria-label={`${name} home`} className="mr-6 flex min-w-0 shrink-0 items-center gap-2.5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-full bg-muted object-contain" />
              ) : null}
              <span className="flex min-w-0 flex-col">
                <span className="max-w-[16rem] truncate text-2xl leading-tight font-bold tracking-tight text-primary [-webkit-text-stroke:0.6px_currentColor]">{name}</span>
                {location ? (
                  <span className="flex max-w-[16rem] items-center gap-1 text-xs font-medium text-muted-foreground">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-3.5 shrink-0" />
                    <span className="truncate">{location}</span>
                  </span>
                ) : null}
              </span>
            </Link>

            {modes.length > 1 ? (
              <div role="radiogroup" aria-label="Order type" className="flex shrink-0 self-stretch">
                {modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    style={{ "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
                    // The same active look as the phone's tabs: a soft glow of the product colour behind the tab, a filled icon, bold text, a short underline.
                    className="group relative isolate flex w-24 flex-col items-center justify-center gap-0.5 px-2 text-sm font-medium text-muted-foreground transition-colors before:absolute before:inset-y-0 before:left-1/2 before:w-24 before:-translate-x-1/2 before:-z-10 before:rounded-t-2xl before:bg-linear-to-t before:from-transparent before:to-[var(--duo)] before:opacity-0 hover:text-foreground aria-checked:before:opacity-25 aria-checked:font-semibold aria-checked:text-foreground focus-visible:outline-none"
                  >
                    <HugeiconsIcon
                      icon={MODE_ICON[m]}
                      strokeWidth={1.75}
                      className="size-5 shrink-0 group-aria-checked:[&_path]:fill-[var(--duo)]"
                      // Two shades of the product colour: the deep one draws the icon, the light one fills it when active.
                      style={{ color: `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"})`, "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
                    />
                    {FULFILMENT_LABEL[m]}
                    <OpenTag open={hoursOpen === null ? null : hoursOpen && canOrder} />
                    <span aria-hidden className="absolute bottom-0 z-10 h-[3px] w-24 rounded-full bg-foreground opacity-0 transition-opacity group-aria-checked:opacity-100" />
                  </button>
                ))}
              </div>
            ) : null}

            <Link href="/search" aria-label="Search" className="ml-auto inline-flex size-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground/12 bg-muted shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_90%,transparent)] lg:hidden">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
            </Link>
            <form action="/search" role="search" className="ml-auto hidden h-12 w-full max-w-80 min-w-0 items-center gap-2.5 rounded-full border-[1.5px] border-foreground/12 bg-muted shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_90%,transparent)] px-4 lg:flex">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4.5 shrink-0" />
              <RotatingSearchInput hints={searchHints} fallback={`Search ${name}`} label={`Search ${terms.items}`} className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </form>

            <Link href="/info" aria-label="Store info" title="Store info" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-3 text-sm font-medium transition-colors hover:bg-muted lg:px-4">
              <HugeiconsIcon icon={StoreLocation01Icon} strokeWidth={2} className="size-5" />
              <span className="hidden lg:inline">Store info</span>
            </Link>
            {/* Signed out: "Sign in". Signed in: the customer's own first name, linking to their profile. Hidden until the browser has checked, so it never flashes the wrong one. */}
            {account.signedIn === null ? (
              <span aria-hidden className="h-12 w-12 shrink-0 lg:w-28" />
            ) : (
              <Link
                href="/account"
                aria-label={account.signedIn ? "My account" : "Sign in"}
                title={account.signedIn ? "My account" : "Sign in"}
                className="inline-flex h-12 max-w-44 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-3 text-sm font-medium transition-colors hover:bg-muted lg:px-4"
              >
                <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} className="size-5 shrink-0" />
                <span className="hidden truncate lg:inline">{account.signedIn ? (account.name?.split(" ")[0] || "My account") : "Sign in"}</span>
              </Link>
            )}
            <Link href="/cart" aria-label={cart.count ? `Cart (${cart.count})` : "Cart"} className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted">
              <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} className="size-6" />
              {cart.count ? (
                <span className="absolute top-0 right-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">{cart.count > 99 ? "99+" : cart.count}</span>
              ) : null}
            </Link>
          </div>
        </header>

        {strip ? (
          <>
            <div className="pointer-events-auto relative z-0 -mt-6 [clip-path:inset(0_0_1.5rem_0)]">
              <DeliveryStrip solid origin={origin} closed={closed} pickup={mode === "pickup"} restaurant={name} directionsUrl={directionsUrl} />
            </div>
            {/* The page slides under the strip; these two corner pieces paint the strip's colour around the page's rounded top corners. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(100%-1.5rem)] h-6">
              <span className="absolute top-0 left-0 size-6 [background:radial-gradient(circle_at_100%_100%,transparent_calc(1.5rem-0.5px),color-mix(in_oklab,var(--primary)_30%,var(--background))_1.5rem)]" />
              <span className="absolute top-0 right-0 size-6 [background:radial-gradient(circle_at_0%_100%,transparent_calc(1.5rem-0.5px),color-mix(in_oklab,var(--primary)_30%,var(--background))_1.5rem)]" />
            </div>
          </>
        ) : null}
      </div>
      <div aria-hidden className={strip ? "h-[7.5rem]" : "h-20"} />
    </div>
  )
}
