import { AA_TEXT, contrastRatio } from "../theme/tokens"

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

function hsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Darkens a colour until it reads as text on a white page (WCAG AA), keeping its hue and most of its saturation. */
export function readableBrandColour(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [h, s, l] = hsl((n >> 16) & 255, (n >> 8) & 255, n & 255)
  let light = l
  let out = hex
  while (contrastRatio(out, "#ffffff") < AA_TEXT && light > 0.05) {
    light -= 0.02
    out = fromHsl(h, s, light)
  }
  return out
}

/**
 * The most prominent real colour in a logo, in the browser. Transparent, near-white, near-black and grey pixels are ignored
 * (they are background, outlines or text, not the brand), colours are grouped into coarse buckets, and the biggest bucket wins.
 * Returns null for a logo with no colour (for example a black-and-white mark), so the caller keeps the colour it already has.
 */
export async function dominantLogoColour(src: string): Promise<string | null> {
  const img = new Image()
  img.decoding = "async"
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("image"))
    img.src = src
  })
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 200) continue
    const [, s, l] = hsl(r, g, b)
    if (l > 0.92 || l < 0.1 || s < 0.25) continue
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const w = 1 + s // favour vivid colours over muddy ones
    const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 }
    e.w += w
    e.r += r * w
    e.g += g * w
    e.b += b * w
    buckets.set(key, e)
  }
  let best: { w: number; r: number; g: number; b: number } | null = null
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e
  if (!best) return null
  return readableBrandColour(toHex(best.r / best.w, best.g / best.w, best.b / best.w))
}
