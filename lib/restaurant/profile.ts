import { z } from "zod"

/** A web address the owner types: empty, or an http(s) link. "www.shop.in" gets https:// added. Anything else (javascript:, data:) is refused. */
const link = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (v === "") return true
    try {
      const u = new URL(v)
      return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".")
    } catch {
      return false
    }
  }, "Enter a valid web address.")
  .default("")

/** The words and contact details a restaurant shows on its public pages. All optional. */
export const profileSchema = z.object({
  tagline: z.string().trim().max(80).default(""),
  about: z.string().trim().max(1200).default(""),
  address: z.string().trim().max(200).default(""),
  /** What kind of place it is, like Google's "Supermarket" or "South Indian restaurant". */
  category: z.string().trim().max(40).default(""),
  website: link,
  instagram: link,
  facebook: link,
  /** The owner's own Google Maps link, used for the Directions button. Without it, directions use the pin on the map. */
  mapsUrl: link,
  /** Photos of the place, in the order they show (the first is the big one). The owner's own uploads only, checked when saved. */
  photos: z.array(z.string().trim().max(400)).max(8).default([]),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email.")
    .default(""),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(\+91|91|0)?[6-9][0-9]{9}$/.test(v), "Enter a valid 10-digit WhatsApp number.")
    .transform((v) => (v === "" ? "" : `91${v.slice(-10)}`))
    .default(""),
})
export type RestaurantProfile = z.infer<typeof profileSchema>

export function readProfile(stored: unknown): RestaurantProfile {
  const parsed = profileSchema.safeParse(stored ?? {})
  return parsed.success ? parsed.data : profileSchema.parse({})
}
