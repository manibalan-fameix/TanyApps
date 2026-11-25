// What the owner can change about their store's home page. Saved inside the business's profile data under "homepage".
import { z } from "zod"

/** The blocks of the home page, in the order it ships with. The header above them is not movable. */
export const HOME_SECTIONS = ["banners", "categories", "picks", "offers", "catalogue"] as const
export type HomeSectionId = (typeof HOME_SECTIONS)[number]

export const MAX_ROW_PRODUCTS = 12

const heading = z.string().trim().max(60, "Keep the heading under 60 characters.").default("")
const chosen = z.array(z.string().uuid()).max(MAX_ROW_PRODUCTS, `Choose up to ${MAX_ROW_PRODUCTS} products.`).default([])

export const homepageSchema = z.object({
  sections: z.array(z.object({ id: z.enum(HOME_SECTIONS), visible: z.boolean() })).max(HOME_SECTIONS.length).default([]),
  /** An empty heading or product list means "decide automatically". */
  picks: z.object({ title: heading, productIds: chosen }).default({ title: "", productIds: [] }),
  offers: z.object({ title: heading, subtitle: z.string().trim().max(120, "Keep the line under 120 characters.").default(""), productIds: chosen }).default({ title: "", subtitle: "", productIds: [] }),
  /** Categories left out of the row of circles. A new category shows until it is hidden. */
  hiddenCategoryIds: z.array(z.string().uuid()).max(200).default([]),
})
export type Homepage = z.infer<typeof homepageSchema>

/** Every section exactly once: the saved order first, then any the saved list does not know about, shown. */
export function allSections(saved: Homepage["sections"]): Homepage["sections"] {
  const seen = new Set<HomeSectionId>()
  const kept = saved.filter((s) => !seen.has(s.id) && seen.add(s.id))
  return [...kept, ...HOME_SECTIONS.filter((id) => !seen.has(id)).map((id) => ({ id, visible: true }))]
}

export function readHomepage(profile: unknown): Homepage {
  const stored = (profile as { homepage?: unknown } | null | undefined)?.homepage
  const parsed = homepageSchema.safeParse(stored ?? {})
  const value = parsed.success ? parsed.data : homepageSchema.parse({})
  return { ...value, sections: allSections(value.sections) }
}

/**
 * The products of a row. With none chosen (or every chosen one since deleted) the automatic list is used. Otherwise the chosen ones,
 * in the owner's order, limited to those on screen now (the phone's filters may hide some).
 */
export function rowProducts<T extends { id: string }>(chosenIds: string[], everything: T[], onScreen: T[], automatic: T[]): T[] {
  const exist = chosenIds.filter((id) => everything.some((p) => p.id === id))
  if (exist.length === 0) return automatic
  return exist.flatMap((id) => onScreen.filter((p) => p.id === id))
}
