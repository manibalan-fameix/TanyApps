"use client"

import { useEffect, useRef } from "react"

// Theme-token colours, resolved at run time so the burst follows the brand and light/dark mode.
const TOKENS = [
  "--primary",
  "--sidebar-primary",
  "--destructive",
  "--muted-foreground",
  "--foreground",
]
const COUNT = 140
const DURATION = 3200

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
  round: boolean
}

/** A one-off confetti pop from the top-centre of the screen. Skipped for reduced-motion users. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (
      !canvas ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = (canvas.width = window.innerWidth * dpr)
    const h = (canvas.height = window.innerHeight * dpr)
    const style = getComputedStyle(document.documentElement)
    const colors = TOKENS.map((t) => style.getPropertyValue(t).trim()).filter(
      Boolean
    )
    if (colors.length === 0) colors.push("currentColor")

    const pieces: Piece[] = Array.from({ length: COUNT }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const speed = (9 + Math.random() * 11) * dpr
      return {
        x: w / 2,
        y: h * 0.28,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (6 + Math.random() * 6) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.3,
      }
    })

    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION - t) / 900))
      for (const p of pieces) {
        p.vy += 0.32 * dpr
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.round) {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (t < DURATION) raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] size-full"
    />
  )
}
