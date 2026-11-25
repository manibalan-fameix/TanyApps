import { z } from "zod"

/** The most banners a business can have, hidden ones included. The home page shows no more than this. */
export const MAX_BANNERS = 5

/** Background looks an owner can pick. Each uses the restaurant's own theme colours, so any brand colour stays readable. */
export const BANNER_TONES = ["soft", "bold", "dark"] as const
export type BannerTone = (typeof BANNER_TONES)[number]
export const BANNER_TONE_LABEL: Record<BannerTone, string> = {
  soft: "Soft",
  bold: "Brand colour",
  dark: "Dark",
}

/** Classes for each tone: card background, text colour and the button on it. */
export const BANNER_TONE_CLASS: Record<
  BannerTone,
  { card: string; button: string }
> = {
  // Soft is the pastel look: a light wash of the brand colour, dark text, and a deep shade of the brand colour on the button.
  soft: {
    card: "relative isolate text-foreground before:absolute before:inset-0 before:-z-10 before:bg-primary before:opacity-25",
    button: "bg-foreground text-background",
  },
  bold: {
    card: "bg-primary text-primary-foreground",
    button: "bg-background text-foreground",
  },
  dark: {
    card: "bg-foreground text-background",
    button: "bg-primary text-primary-foreground",
  },
}

export const readTone = (v: unknown): BannerTone =>
  (BANNER_TONES as readonly string[]).includes(v as string)
    ? (v as BannerTone)
    : "soft"

/** Where a banner can send a guest: a page on the restaurant's own site, or an https address. Anything else is dropped. */
export function cleanLink(v: string): string {
  const t = v.trim()
  if (t === "") return ""
  if (t.startsWith("/") && !t.startsWith("//") && !/[\s\\]/.test(t)) return t
  try {
    const u = new URL(t)
    if (u.protocol === "https:") return u.toString()
  } catch {
    /* not a link */
  }
  return ""
}

export const isExternalLink = (v: string) => /^https:\/\//i.test(v)

export const bannerSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a title.")
    .max(50, "Keep the title under 50 characters."),
  subtitle: z
    .string()
    .trim()
    .max(90, "Keep the description under 90 characters.")
    .default(""),
  buttonLabel: z
    .string()
    .trim()
    .max(20, "Keep the button text under 20 characters.")
    .default(""),
  /** The big offer text in the dark panel on the right, e.g. "FLAT 20% OFF*". */
  promoText: z
    .string()
    .trim()
    .max(40, "Keep the offer text under 40 characters.")
    .default(""),
  linkUrl: z.string().trim().max(500).default(""),
  tone: z.enum(BANNER_TONES).default("soft"),
  imageUrl: z.string().trim().max(500).default(""),
})

/** What the storefront needs to draw one banner. */
export type StoreBanner = {
  id: string
  title: string
  subtitle: string
  buttonLabel: string
  linkUrl: string
  tone: BannerTone
  imageUrl: string | null
  promoText: string
}
