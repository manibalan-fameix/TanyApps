"use client"

import { useEffect, useRef, useState } from "react"

import { type ProductKey } from "@/lib/products"

const RULER_TICKS = 33

/** Small ruler at the bottom, centred; its peak travels left to right as the reel scrolls. */
export function ScrollRuler({
  progress: scrolled,
  hint,
  product,
  label,
  onSeek,
  onRelease,
  onStep,
}: {
  progress: number
  hint: boolean
  product: ProductKey
  label: string
  onSeek: (to: number) => void
  onRelease: () => void
  onStep: (delta: number) => void
}) {
  const dragRef = useRef(false)
  function toPosition(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }
  const [nudge, setNudge] = useState(0)
  useEffect(() => {
    if (!hint) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      // Slide right, then ease back, every 2.6s.
      setNudge(Math.sin((((now - start) / 2600) % 1) * Math.PI) * 0.18)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [hint])

  const progress = hint ? Math.min(1, scrolled + nudge) : scrolled
  const color = `var(--logo-${product})`
  const focus = progress * (RULER_TICKS - 1)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Scroll through products"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(scrolled * 100)}
      aria-valuetext={label}
      onPointerDown={(e) => {
        dragRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        toPosition(e)
      }}
      onPointerMove={(e) => dragRef.current && toPosition(e)}
      onPointerUp={() => {
        dragRef.current = false
        onRelease()
      }}
      onPointerCancel={() => {
        dragRef.current = false
        onRelease()
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") onStep(1)
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") onStep(-1)
        else return
        e.preventDefault()
      }}
      className="relative mx-auto mt-2 h-14 w-full max-w-sm shrink-0 cursor-grab touch-none outline-none select-none active:cursor-grabbing"
    >
      {Array.from({ length: RULER_TICKS }, (_, i) => {
        const d = Math.abs(i - focus)
        const near = Math.exp(-((d / 3) ** 2))
        return (
          <span
            key={i}
            className="absolute top-0 w-0.5 -translate-x-1/2 rounded-full"
            style={{
              left: `${(i / (RULER_TICKS - 1)) * 100}%`,
              height: 8 + 24 * near,
              backgroundColor: color,
              opacity: 0.3 + 0.7 * near,
            }}
          />
        )
      })}
      <span
        className="absolute bottom-0 h-3 w-3.5 -translate-x-1/2 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
        style={{ left: `${progress * 100}%`, backgroundColor: color }}
      />
    </div>
  )
}
