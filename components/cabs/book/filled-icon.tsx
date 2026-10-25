import { Airplane01Icon, Clock01Icon, HistoryIcon, RepeatIcon, Route01Icon } from "@hugeicons/core-free-icons"

type Part = readonly [string, Record<string, string>]
type Glyph = readonly Part[]

/**
 * Solid versions of the trip-type icons. The free Hugeicons pack only has outline glyphs, so these draw the same shapes with the
 * closed parts filled. Strokes that sit inside a filled shape (the clock hands) take the page background so they stay visible.
 */
const CUT = "var(--card)"
// The icon data carries its own `key`, which React rejects when spread into JSX; the list below keys by position instead.
const bare = (a: Record<string, string>) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== "key"))
const stroke = (a: Record<string, string>, color = "currentColor", width = "1.5") => ({ ...bare(a), stroke: color, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round" }) as Record<string, string>

const GLYPHS = {
  airport: (Airplane01Icon as Glyph).map(([t, a]) => [t, { ...stroke(a), fill: "currentColor" }] as const),
  outstation: (Route01Icon as Glyph).map(([t, a]) => [t, t === "circle" ? { ...stroke(a), fill: "currentColor" } : stroke(a, "currentColor", "2")] as const),
  round: (RepeatIcon as Glyph).map(([t, a]) => [t, stroke(a, "currentColor", "2.4")] as const),
  local: [["circle", { cx: "12", cy: "12", r: "10", fill: "currentColor", stroke: "currentColor", strokeWidth: "1.5" }], ...(Clock01Icon as Glyph).slice(1).map(([t, a]) => [t, stroke(a, CUT, "2")] as const)] as Glyph,
  recent: [["circle", { cx: "12", cy: "12", r: "9", fill: "currentColor" }], ...(HistoryIcon as Glyph).map(([t, a], i) => [t, i === 0 ? stroke(a, "currentColor", "2") : stroke(a, CUT, "2")] as const)] as Glyph,
} satisfies Record<string, Glyph>

export type FilledGlyph = keyof typeof GLYPHS

export function FilledIcon({ glyph, className }: { glyph: FilledGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      {GLYPHS[glyph].map(([tag, attrs], i) => (tag === "circle" ? <circle key={i} {...attrs} /> : <path key={i} {...attrs} />))}
    </svg>
  )
}
