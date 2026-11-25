"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Notification01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { NewOrdersPopup } from "@/components/restaurant/new-orders-popup"
import { type OrderAlert, fetchOrderAlerts } from "@/lib/restaurant/admin-actions"
import { fetchReturnAlerts } from "@/lib/returns/admin-actions"
import type { ReturnAlert } from "@/lib/returns/shop"

const POLL_MS = 20_000
const MUTE_KEY = "tany-alerts-muted"
const MAX = 30

type Alerts = {
  recent: OrderAlert[]
  unseen: number
  markAllSeen: () => void
  muted: boolean
  toggleMuted: () => void
  soundOn: boolean
  enableSound: () => void
  connected: boolean
  /** Return conversations waiting for the shop. */
  returnsWaiting: number
  /** Checks again at once, after the shop has acted on a return. */
  returnsChanged: () => void
}
const Ctx = createContext<Alerts | null>(null)

export function useOrderAlerts(): Alerts {
  const c = useContext(Ctx)
  if (!c) throw new Error("useOrderAlerts must be used inside OrderAlertsProvider")
  return c
}

/** The count beside "Returns" in the menu. Nothing shows outside the ordering products, or when nothing waits. */
export function ReturnsWaitingBadge() {
  const waiting = useContext(Ctx)?.returnsWaiting ?? 0
  if (!waiting) return null
  return (
    <span aria-label={`${waiting} waiting`} className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground group-data-[collapsible=icon]:hidden">
      {waiting > 99 ? "99+" : waiting}
    </span>
  )
}

/** A short two-note chime. Browsers only allow sound after the person has tapped something, hence enableSound(). */
function chime(ctx: AudioContext) {
  const now = ctx.currentTime
  ;[880, 1175].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + i * 0.18)
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + i * 0.18)
    osc.stop(now + i * 0.18 + 0.32)
  })
}

/**
 * Watches for new orders from any admin page: a pop-up stacking them, a chime, and an unread count on the bell. The list lives in
 * this browser session only. It is a live alert, not an archive. The Orders page has the full history.
 */
export function OrderAlertsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  /** New orders nobody has opened or dismissed yet, newest first. */
  const [waiting, setWaiting] = useState<OrderAlert[]>([])
  const primed = useRef(false)
  const [recent, setRecent] = useState<OrderAlert[]>([])
  const [unseen, setUnseen] = useState(0)
  const [muted, setMuted] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [connected, setConnected] = useState(true)
  const audio = useRef<AudioContext | null>(null)
  const cursor = useRef<string | null>(null)
  const mutedRef = useRef(false)
  /** Return conversations with something new, one entry each. */
  const [waitingReturns, setWaitingReturns] = useState<ReturnAlert[]>([])
  const [returnsWaiting, setReturnsWaiting] = useState(0)
  const returnCursor = useRef<string | null>(null)
  const returnsPrimed = useRef(false)

  const pollReturns = useCallback(async () => {
    if (document.visibilityState !== "visible") return
    try {
      const res = await fetchReturnAlerts(returnCursor.current)
      if (!res.ok) return
      setReturnsWaiting(res.waiting)
      const first = !returnsPrimed.current
      returnsPrimed.current = true
      if (res.alerts.length === 0) return
      returnCursor.current = res.alerts[0].at
      if (first) return
      setWaitingReturns((list) => [...res.alerts, ...list.filter((x) => !res.alerts.some((a) => a.id === x.id))])
      setUnseen((n) => n + res.alerts.length)
      if (!mutedRef.current && audio.current) chime(audio.current)
    } catch {
      // The order poll reports a lost connection; this one just tries again.
    }
  }, [])

  useEffect(() => {
    try {
      const m = localStorage.getItem(MUTE_KEY) === "1"
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMuted(m)
      mutedRef.current = m
    } catch {
      // Storage blocked: alerts are simply not muted.
    }
  }, [])

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return
    try {
      const res = await fetchOrderAlerts(cursor.current)
      if (!res.ok) return setConnected(false)
      setConnected(true)
      // The first read only sets where "new" starts; older orders are not announced.
      const first = !primed.current
      primed.current = true
      if (res.alerts.length === 0) return
      cursor.current = res.alerts[0].createdAt
      if (first) return
      // A slow read can overlap the next one, so an order already stacked is not added twice.
      const add = (list: OrderAlert[]) => [...res.alerts.filter((a) => !list.some((x) => x.id === a.id)), ...list]
      setWaiting(add)
      setRecent((r) => add(r).slice(0, MAX))
      setUnseen((n) => n + res.alerts.length)
      if (!mutedRef.current && audio.current) chime(audio.current)
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    // The first read only sets where "new" starts. It runs from a timer so it is not a synchronous state update in the effect.
    const check = () => {
      void poll()
      void pollReturns()
    }
    const first = setTimeout(check, 0)
    const t = setInterval(check, POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [poll, pollReturns])

  const value = useMemo<Alerts>(
    () => ({
      recent,
      unseen,
      markAllSeen: () => setUnseen(0),
      muted,
      toggleMuted: () =>
        setMuted((m) => {
          mutedRef.current = !m
          try {
            localStorage.setItem(MUTE_KEY, !m ? "1" : "0")
          } catch {
            // Not saved; applies for this session.
          }
          return !m
        }),
      soundOn,
      enableSound: () => {
        try {
          audio.current ??= new AudioContext()
          void audio.current.resume()
          chime(audio.current)
          setSoundOn(true)
        } catch {
          toast.error("This browser blocked sound.")
        }
      },
      connected,
      returnsWaiting,
      returnsChanged: () => void pollReturns(),
    }),
    [recent, unseen, muted, soundOn, connected, returnsWaiting, pollReturns],
  )
  // While one order is on screen the stack steps aside, and returns with the rest when it is closed.
  const viewingOrder = /^\/orders\/[^/]+$/.test(pathname)
  return (
    <Ctx.Provider value={value}>
      {children}
      <NewOrdersPopup
        orders={viewingOrder ? [] : waiting}
        // In the inbox the list itself shows what is new.
        returns={viewingOrder || pathname === "/returns" ? [] : waitingReturns}
        onOpenReturn={(id) => {
          setWaitingReturns((list) => list.filter((r) => r.id !== id))
          router.push(`/returns?id=${id}`)
        }}
        onOpen={(id) => {
          setWaiting((w) => w.filter((o) => o.id !== id))
          router.push(`/orders/${id}`, { scroll: false })
        }}
        onDismissAll={() => {
          setWaiting([])
          setWaitingReturns([])
        }}
      />
    </Ctx.Provider>
  )
}

/** Bell with the unread count, shown in the admin header. */
export function OrderAlertsBell() {
  const { unseen } = useOrderAlerts()
  return (
    <Link href="/notifications" aria-label={unseen ? `Notifications (${unseen} new)` : "Notifications"} className="relative inline-flex size-9 items-center justify-center rounded-full hover:bg-muted">
      <HugeiconsIcon icon={Notification01Icon} strokeWidth={2} className="size-5" />
      {unseen > 0 ? <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">{unseen > 99 ? "99+" : unseen}</span> : null}
    </Link>
  )
}
