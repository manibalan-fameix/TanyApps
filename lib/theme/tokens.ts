import { z } from "zod"

export const RADIUS_OPTIONS = {
  none: "0rem",
  sm: "0.375rem",
  md: "0.625rem", // the preset default
  lg: "1rem",
} as const
export type RadiusKey = keyof typeof RADIUS_OPTIONS

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #1a56db")

/** Colours and radius only. Name and logo live on the dealer row. No free-form CSS. */
export const dealerThemeSchema = z.object({
  primary: hex,
  primaryForeground: hex,
  accent: hex,
  radius: z.enum(Object.keys(RADIUS_OPTIONS) as [RadiusKey, ...RadiusKey[]]),
})
export type DealerTheme = z.infer<typeof dealerThemeSchema>

export const DEFAULT_THEME: DealerTheme = {
  primary: "#E5270B",
  primaryForeground: "#ffffff",
  accent: "#f59e0b",
  radius: "md",
}

// ---- WCAG 2.x contrast ----

function channel(v: number) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(color: string): number {
  const n = parseInt(color.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const AA_TEXT = 4.5
export const AA_UI = 3

const WHITE = "#ffffff"
const INK = "#111111"
const BLACK = "#000000"

/**
 * White or near-black, whichever reads better on `background`. Falls back to pure black
 * in the narrow mid-tone band where near-black dips under 4.5:1. Always >= 4.5:1.
 */
export function readableOn(background: string): string {
  const best = contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK
  return contrastRatio(background, best) >= AA_TEXT ? best : BLACK
}


export type ThemeResult =
  | { ok: true; theme: DealerTheme; adjustments: string[] }
  | { ok: false; errors: string[] }

/**
 * Validate on save. Foreground colours are auto-adjusted to meet AA (4.5:1).
 * A primary that is too light to stand on a white page (< 3:1) is rejected,
 * because buttons and links would disappear.
 */
export function validateTheme(input: unknown): ThemeResult {
  const parsed = dealerThemeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }
  }
  const theme = { ...parsed.data }
  const adjustments: string[] = []

  if (contrastRatio(theme.primary, WHITE) < AA_UI) {
    return { ok: false, errors: ["primary: too light against a white page. Pick a darker brand colour."] }
  }
  if (contrastRatio(theme.primary, theme.primaryForeground) < AA_TEXT) {
    theme.primaryForeground = readableOn(theme.primary)
    adjustments.push(`Text on primary changed to ${theme.primaryForeground} to meet WCAG AA.`)
  }
  return { ok: true, theme, adjustments }
}

/** CSS custom properties that override the preset on the tenant layout root. */
export function themeToCssVars(theme: DealerTheme): Record<string, string> {
  return {
    "--primary": theme.primary,
    "--primary-foreground": theme.primaryForeground,
    "--ring": theme.primary,
    "--accent": theme.accent,
    "--accent-foreground": readableOn(theme.accent),
    "--radius": RADIUS_OPTIONS[theme.radius],
  }
}
