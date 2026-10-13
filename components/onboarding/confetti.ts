import confetti from "canvas-confetti"

/** Two bursts from the sides. Skipped for visitors who prefer reduced motion. */
export function celebrate(colors: string[]) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const shot = (x: number, angle: number) =>
    confetti({
      particleCount: 70,
      spread: 70,
      angle,
      origin: { x, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    })
  shot(0.1, 60)
  shot(0.9, 120)
  setTimeout(
    () =>
      confetti({ particleCount: 90, spread: 100, origin: { y: 0.5 }, colors }),
    250
  )
}
