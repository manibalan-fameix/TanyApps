"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Notification01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { type OrderAlert, fetchOrderAlerts } from "@/lib/restaurant/admin-actions"

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
}
const Ctx = createContext<Alerts | null>(null)

export function useOrderAlerts(): Alerts {
  const c = useContext(Ctx)
  if (!c) throw new Error("useOrderAlerts must be used inside OrderAlertsProvider")
  return c
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
 * Watches for new orders from any admin page: a toast, a chime, and an unread count on the bell. The list lives in
 * this browser session only. It is a live alert, not an archive. The Orders page has the full history.
 */
export function OrderAlertsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [recent, setRecent] = useState<OrderAlert[]>([])
  const [unseen, setUnseen] = useState(0)
  const [muted, setMuted] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [connected, setConnected] = useState(true)
  const audio = useRef<AudioContext | null>(null)
  const cursor = useRef<string | null>(null)
  const mutedRef = useRef(false)

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
      if (res.alerts.length === 0) return
      // The first read only sets where "new" starts; older orders are not announced.
      const first = cursor.current === null
      cursor.current = res.alerts[0].createdAt
      if (first) return
      const fresh = [...res.alerts].reverse()
      setRecent((r) => [...res.alerts, ...r].slice(0, MAX))
      setUnseen((n) => n + fresh.length)
      for (const a of fresh) toast.info(`New order ${a.code} · ₹${a.total.toLocaleString("en-IN")}`, { description: `${a.customerName} · ${a.itemCount} ${a.itemCount === 1 ? "item" : "items"}`, action: { label: "Open", onClick: () => router.push(`/orders/${a.id}`) } })
      if (!mutedRef.current && audio.current) chime(audio.current)
    } catch {
      setConnected(false)
    }
  }, [router])

  useEffect(() => {
    // The first read only sets where "new" starts. It runs from a timer so it is not a synchronous state update in the effect.
    const first = setTimeout(() => void poll(), 0)
    const t = setInterval(() => void poll(), POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [poll])

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
    }),
    [recent, unseen, muted, soundOn, connected],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
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
