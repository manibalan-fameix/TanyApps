"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Loading03Icon } from "@hugeicons/core-free-icons"

const THRESHOLD = 70
const MAX_PULL = 110

// Touch-only pull-to-refresh. Re-fetches the current route's server data without a full reload.
export function PullToRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    const scrollable = (el: EventTarget | null) => {
      for (
        let n = el as HTMLElement | null;
        n && n !== document.body;
        n = n.parentElement
      ) {
        if (n.closest?.("[role=dialog],[data-slot=sheet-content]")) return true
        const oy = getComputedStyle(n).overflowY
        if (
          (oy === "auto" || oy === "scroll") &&
          n.scrollHeight > n.clientHeight
        )
          return true
      }
      return false
    }

    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }

    const onStart = (e: TouchEvent) => {
      startY.current =
        window.scrollY <= 0 && !scrollable(e.target)
          ? e.touches[0].clientY
          : null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0)
        return
      }
      if (e.cancelable) e.preventDefault()
      set(Math.min(MAX_PULL, dy * 0.5))
    }
    const onEnd = () => {
      if (startY.current === null) return
      startY.current = null
      if (pullRef.current >= THRESHOLD * 0.5 + 10) {
        startTransition(() => router.refresh())
      }
      set(0)
    }

    document.documentElement.style.overscrollBehaviorY = "contain"
    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: false })
    document.addEventListener("touchend", onEnd)
    document.addEventListener("touchcancel", onEnd)
    return () => {
      document.documentElement.style.overscrollBehaviorY = ""
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", onEnd)
    }
  }, [router])

  const visible = pull > 0 || pending
  const offset = pending ? 48 : pull
  const ready = pull >= THRESHOLD * 0.5 + 10

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)] md:hidden"
      style={{
        transform: `translateY(${visible ? offset - 40 : -48}px)`,
        opacity: visible ? 1 : 0,
        transition:
          pull > 0 ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <div className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md">
        <HugeiconsIcon
          icon={pending ? Loading03Icon : ArrowDown01Icon}
          className={
            pending ? "size-4 animate-spin" : "size-4 transition-transform"
          }
          style={
            pending ? undefined : { transform: `rotate(${ready ? 180 : 0}deg)` }
          }
        />
      </div>
    </div>
  )
}
